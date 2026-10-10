import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clampInto, defaultMascotPosition, isMostlyVisible } from './layout.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(here, '..', 'renderer', 'mascot.html');
const PRELOAD = path.join(here, '..', 'preload', 'mascot-preload.cjs');
const SIZE = 96;

/**
 * Mascot mode: a small always-on-top character. Click it to open the bar,
 * hold the left button and drag it anywhere (it stays exactly where it is
 * dropped, kept fully on screen), right-click for a menu. It shows three
 * states: idle, thinking (while an answer streams) and done.
 *
 * The window is not focusable, so clicking it never steals focus from the
 * bar (which would close the bar on blur). Like the bar, it is a normal
 * window for screen sharing and recording.
 */
export class Mascot {
  constructor({ position, onMoved = () => {}, onDragStart = () => {} }) {
    this.onMoved = onMoved;
    this.onDragStart = onDragStart;
    this.state = 'idle';
    this.timer = null;
    this.dragTimer = null;

    const start = this.startPosition(position);
    this.win = new BrowserWindow({
      x: start.x,
      y: start.y,
      width: SIZE,
      height: SIZE,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      title: 'AskBar mascot',
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    this.win.loadFile(PAGE);
    this.win.once('ready-to-show', () => this.win.showInactive());
    this.win.webContents.on('did-finish-load', () => this.send('mascot:state', this.state));
    this.win.webContents.on('will-navigate', (e) => e.preventDefault());
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  }

  /** The saved spot if it is still on a screen, else the bottom-right corner. */
  startPosition(saved) {
    const areas = screen.getAllDisplays().map((d) => d.workArea);
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      if (isMostlyVisible({ x: saved.x, y: saved.y, width: SIZE, height: SIZE }, areas)) return saved;
    }
    return defaultMascotPosition(screen.getPrimaryDisplay().workArea, SIZE);
  }

  isVisible() {
    return !this.win.isDestroyed() && this.win.isVisible();
  }

  getBounds() {
    return this.win.getBounds();
  }

  ownsSender(event) {
    return !this.win.isDestroyed() && event.sender === this.win.webContents;
  }

  /** Follows the mouse until endDrag(); offset = where the mouse grabbed the window. */
  startDrag(offsetX, offsetY) {
    this.stopDrag();
    this.onDragStart();
    this.dragTimer = setInterval(() => {
      const p = screen.getCursorScreenPoint();
      this.moveTo({ x: p.x - offsetX, y: p.y - offsetY });
    }, 16);
  }

  endDrag() {
    if (!this.dragTimer) return;
    this.stopDrag();
    const spot = clampInto(this.win.getBounds(), screen.getDisplayMatching(this.win.getBounds()).workArea);
    this.moveTo(spot);
    this.onMoved(spot);
  }

  /** Back to the default spot (tray: Reset positions). */
  resetPosition() {
    this.moveTo(defaultMascotPosition(screen.getPrimaryDisplay().workArea, SIZE));
  }

  // setBounds with an explicit size: repeated setPosition() calls make the
  // window slowly grow on Windows at non-100% display scaling.
  moveTo({ x, y }) {
    if (!this.win.isDestroyed()) this.win.setBounds({ x: Math.round(x), y: Math.round(y), width: SIZE, height: SIZE });
  }

  stopDrag() {
    clearInterval(this.dragTimer);
    this.dragTimer = null;
  }

  /**
   * 'thinking' while an answer streams; 'done' when it finished. 'done' stays
   * until the bar is next opened, or fades after a moment if the bar is
   * already open and the answer is visible.
   */
  setState(state, { barVisible = false } = {}) {
    clearTimeout(this.timer);
    this.state = state;
    this.send('mascot:state', state);
    if (state === 'done' && barVisible) this.timer = setTimeout(() => this.setState('idle'), 2500);
  }

  barShown() {
    if (this.state !== 'done') return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.setState('idle'), 1500);
  }

  send(channel, payload) {
    if (!this.win.isDestroyed()) this.win.webContents.send(channel, payload);
  }

  destroy() {
    this.stopDrag();
    clearTimeout(this.timer);
    if (!this.win.isDestroyed()) this.win.destroy();
  }
}

/** IPC from the mascot page. Each message must come from the current mascot window. */
export function registerMascotIpc({ getMascot, onClick, onLook, onMenu }) {
  const from = (event) => {
    const m = getMascot();
    return m && m.ownsSender(event) ? m : null;
  };
  ipcMain.on('mascot:click', (e) => from(e) && onClick());
  ipcMain.on('mascot:look', (e) => from(e) && onLook());
  ipcMain.on('mascot:menu', (e) => from(e) && onMenu());
  ipcMain.on('mascot:drag-start', (e, p) => {
    const m = from(e);
    if (m && Number.isFinite(p?.offsetX) && Number.isFinite(p?.offsetY)) {
      m.startDrag(clampNum(p.offsetX, 0, SIZE), clampNum(p.offsetY, 0, SIZE));
    }
  });
  ipcMain.on('mascot:drag-end', (e) => from(e)?.endDrag());
}

function clampNum(n, min, max) {
  return Math.min(Math.max(n, min), max);
}
