import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchorAfterMove, clampInto, placeNear, placeSaved, placeTopCenter } from './layout.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const RENDERER_FILE = path.join(here, '..', 'renderer', 'index.html');

// The window is a little larger than the visible card: the transparent margin
// (--pad-* in styles.css) leaves room for the drop shadow.
const WIDTH = 440;
const INITIAL_HEIGHT = 64;
const MIN_HEIGHT = 40;

/**
 * The launcher window: frameless, transparent, always on top, no taskbar
 * button. It is a normal window as far as capture goes: it shows up in screen
 * shares and recordings like any other app.
 *
 * Placement: in mascot mode right next to the mascot (`getAnchorRect`);
 * otherwise where the user last dragged it (`getSavedPosition`), or
 * top-centre of the display under the mouse. When it sits in the lower half
 * of the screen it grows upwards, keeping its bottom edge fixed.
 *
 * Moving: hold the left button on the bar's badge, its empty edges or the
 * footer and drag. The page reports drag start/end; in between, this window
 * follows the mouse (same approach as the mascot, reliable on Windows).
 */
export class Overlay {
  constructor({
    shouldHideOnBlur,
    preload,
    onShow = () => {},
    getAnchorRect = () => null,
    getSavedPosition = () => null,
    onUserMove = () => {},
  }) {
    this.shouldHideOnBlur = shouldHideOnBlur;
    this.onShow = onShow;
    this.getAnchorRect = getAnchorRect;
    this.getSavedPosition = getSavedPosition;
    this.onUserMove = onUserMove;
    this.maxHeight = 600;
    this.anchor = { top: 0 };
    this.growUp = false;
    this.dragTimer = null;

    this.win = new BrowserWindow({
      width: WIDTH,
      height: INITIAL_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false, // the card draws its own shadow
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      title: 'AskBar',
      webPreferences: {
        preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        devTools: true,
      },
    });

    this.win.loadFile(RENDERER_FILE);

    this.win.on('blur', () => {
      if (this.win.webContents.isDevToolsOpened()) return;
      if (this.shouldHideOnBlur()) this.hide();
    });

    // 'moved' fires once when the user finishes dragging (not for setBounds).
    this.win.on('moved', () => this.afterUserMove());

    // The page never navigates and never opens windows; links go through
    // the 'open-external' IPC handler, which only allows http(s).
    this.win.webContents.on('will-navigate', (e) => e.preventDefault());
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  }

  get webContents() {
    return this.win.webContents;
  }

  isVisible() {
    return this.win.isVisible();
  }

  show(payload = {}) {
    if (!this.win.isVisible()) this.position();
    this.win.show();
    this.win.focus();
    this.win.webContents.send('overlay:shown', { maxHeight: this.maxHeight, growUp: this.growUp, ...payload });
    this.onShow();
  }

  hide() {
    this.stopDrag();
    if (this.win.isVisible()) this.win.hide();
  }

  toggle() {
    if (this.win.isVisible() && this.win.isFocused()) this.hide();
    else this.show();
  }

  position() {
    const anchorRect = this.getAnchorRect();
    const saved = anchorRect ? null : this.getSavedPosition();
    let place;
    if (anchorRect) {
      place = placeNear(anchorRect, screen.getDisplayMatching(anchorRect).workArea, { width: WIDTH });
    } else if (saved) {
      const point = { x: Math.round(saved.x + WIDTH / 2), y: Math.round(saved.top ?? saved.bottom) };
      place = placeSaved(saved, screen.getDisplayNearestPoint(point).workArea, { width: WIDTH });
    } else {
      place = placeTopCenter(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea, { width: WIDTH });
    }

    this.growUp = place.growUp;
    this.anchor = place.growUp ? { bottom: place.bottom } : { top: place.top };
    this.maxHeight = Math.max(MIN_HEIGHT, place.maxHeight);
    const height = clamp(this.win.getBounds().height, MIN_HEIGHT, this.maxHeight);
    const y = place.growUp ? place.bottom - height : place.top;
    this.win.setBounds({ x: place.x, y, width: WIDTH, height });
  }

  /** Follows the mouse until endDrag(); offset = where the mouse grabbed the window. */
  startDrag(offsetX, offsetY) {
    this.stopDrag();
    this.dragTimer = setInterval(() => {
      const p = screen.getCursorScreenPoint();
      const { height } = this.win.getBounds();
      this.win.setBounds({ x: Math.round(p.x - offsetX), y: Math.round(p.y - offsetY), width: WIDTH, height });
    }, 16);
  }

  endDrag() {
    if (!this.dragTimer) return;
    this.stopDrag();
    const b = this.win.getBounds();
    const spot = clampInto(b, screen.getDisplayMatching(b).workArea); // keep it fully on screen
    if (spot.x !== b.x || spot.y !== b.y) this.win.setBounds({ ...spot, width: WIDTH, height: b.height });
    this.afterUserMove();
  }

  stopDrag() {
    clearInterval(this.dragTimer);
    this.dragTimer = null;
  }

  /** The user dropped the bar somewhere: grow from there, and let main remember the spot. */
  afterUserMove() {
    const bounds = this.win.getBounds();
    const place = anchorAfterMove(bounds, screen.getDisplayMatching(bounds).workArea);
    this.growUp = place.growUp;
    this.anchor = place.growUp ? { bottom: place.bottom } : { top: place.top };
    this.maxHeight = Math.max(MIN_HEIGHT, place.maxHeight);
    this.send('overlay:layout', { growUp: this.growUp, maxHeight: this.maxHeight });
    this.onUserMove({ x: place.x, ...this.anchor });
  }

  /** The renderer reports its content height; resize, keeping the anchored edge in place. */
  setContentHeight(height) {
    const h = clamp(Math.ceil(height), MIN_HEIGHT, this.maxHeight);
    const b = this.win.getBounds();
    // While being dragged the window follows the mouse; anchoring resumes on drop.
    const y = this.anchor.bottom != null && !this.dragTimer ? this.anchor.bottom - h : b.y;
    if (b.height !== h || b.y !== y) this.win.setBounds({ x: b.x, y, width: WIDTH, height: h });
  }

  send(channel, payload) {
    if (!this.win.isDestroyed()) this.win.webContents.send(channel, payload);
  }
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}
