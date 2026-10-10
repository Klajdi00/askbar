import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const RENDERER_FILE = path.join(here, '..', 'renderer', 'index.html');

// The window is a little larger than the visible card: the transparent margin
// (see --gap in styles.css) leaves room for the drop shadow.
const WIDTH = 700;
const INITIAL_HEIGHT = 100;
const MIN_HEIGHT = 60;
const TOP_OFFSET_RATIO = 0.18; // distance from the top of the work area, like Spotlight
const BOTTOM_MARGIN = 24;

/**
 * The launcher window: frameless, transparent, always on top, no taskbar
 * button. It is a normal window as far as capture goes: it shows up in screen
 * shares and recordings like any other app.
 */
export class Overlay {
  constructor({ shouldHideOnBlur, preload, onShow = () => {} }) {
    this.shouldHideOnBlur = shouldHideOnBlur;
    this.onShow = onShow;
    this.maxHeight = 600;

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

  /** Shows the bar near the top of the display the mouse is on. */
  show(payload = {}) {
    if (!this.win.isVisible()) this.position();
    this.win.show();
    this.win.focus();
    this.win.webContents.send('overlay:shown', { maxHeight: this.maxHeight, ...payload });
    this.onShow();
  }

  hide() {
    if (this.win.isVisible()) this.win.hide();
  }

  toggle() {
    if (this.win.isVisible() && this.win.isFocused()) this.hide();
    else this.show();
  }

  position() {
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const x = Math.round(workArea.x + (workArea.width - WIDTH) / 2);
    const y = Math.round(workArea.y + workArea.height * TOP_OFFSET_RATIO);
    this.maxHeight = Math.max(MIN_HEIGHT, workArea.y + workArea.height - y - BOTTOM_MARGIN);
    const height = clamp(this.win.getBounds().height, MIN_HEIGHT, this.maxHeight);
    this.win.setBounds({ x, y, width: WIDTH, height });
  }

  /** The renderer reports its content height; grow or shrink downwards. */
  setContentHeight(height) {
    const h = clamp(Math.ceil(height), MIN_HEIGHT, this.maxHeight);
    const b = this.win.getBounds();
    if (b.height !== h) this.win.setBounds({ x: b.x, y: b.y, width: WIDTH, height: h });
  }

  send(channel, payload) {
    if (!this.win.isDestroyed()) this.win.webContents.send(channel, payload);
  }

  /**
   * Makes the window fully transparent while `fn` runs, so a screenshot shows
   * what is underneath instead of the launcher itself. Opacity (rather than
   * hide()) keeps keyboard focus in the input.
   */
  async whileTransparent(fn) {
    const wasVisible = this.win.isVisible();
    if (wasVisible) {
      this.win.setOpacity(0);
      await delay(150); // let the compositor draw one frame without us
    }
    try {
      return await fn();
    } finally {
      if (wasVisible) this.win.setOpacity(1);
    }
  }
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
