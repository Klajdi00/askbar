// AskBar main process: tray app with a global-hotkey launcher window and an
// optional mascot.
//
// Network: the only outgoing requests are the AI API calls in src/main/ai.js,
// to the provider the user picked. No telemetry, no analytics, no update checks.
// (Spellcheck is off in the windows, which also stops Chromium from downloading
// dictionaries.)

import { app, globalShortcut, Menu, nativeImage, Notification } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HOTKEY_LABELS } from '../config/defaults.js';
import { MASCOTS } from '../config/mascots.js';
import { PROVIDERS, PROVIDER_IDS } from '../config/providers.js';
import { runChat, warmUpProxy } from './ai.js';
import { captureActiveDisplay, withWindowsTransparent } from './capture.js';
import { rewriteClipboard } from './clipboard.js';
import { prettyAccelerator, registerHotkeys } from './hotkeys.js';
import { registerIpc } from './ipc.js';
import { Mascot, registerMascotIpc } from './mascot.js';
import { chooseCustomMascot, loadCustomImages, removeCustomFiles } from './mascot-custom.js';
import {
  getApiKey,
  getBarPosition,
  getCustomMascot,
  getMascotPosition,
  getSettings,
  hasApiKey,
  initSettings,
  keyEncryptionAvailable,
  removeApiKey,
  resetPositions,
  setApiKey,
  setBarPosition,
  setCustomMascot,
  setMascotPosition,
  updateSettings,
} from './settings.js';
import { createTray } from './tray.js';
import { Overlay } from './window.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(here, '..', '..', 'assets');
const PRELOAD = path.join(here, '..', 'preload', 'preload.cjs');
const APP_ID = 'io.github.klajdi00.askbar';

let overlay;
let tray;
let mascot = null; // only in mascot mode
let hotkeyErrors = [];

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId(APP_ID); // needed for Windows notifications
  app.on('second-instance', () => overlay?.show());
  app.on('window-all-closed', () => {}); // keep running in the tray
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.whenReady().then(start);
}

function start() {
  Menu.setApplicationMenu(null);
  initSettings();

  overlay = new Overlay({
    preload: PRELOAD,
    shouldHideOnBlur: () => getSettings().hideOnBlur,
    getAnchorRect: () => (mascot?.isVisible() ? mascot.getBounds() : null),
    // Bar-only mode remembers where the user dragged the bar; in mascot mode it opens beside the mascot.
    getSavedPosition: () => (getSettings().mode === 'mascot' ? null : getBarPosition()),
    onUserMove: (spot) => {
      if (getSettings().mode !== 'mascot') setBarPosition(spot);
    },
    onShow: () => {
      warmUpProxy(getSettings().provider);
      mascot?.barShown();
    },
  });

  if (!app.isPackaged) {
    // Development: F12 opens DevTools for the launcher page.
    overlay.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') overlay.webContents.toggleDevTools();
    });
  }

  registerIpc({
    overlay,
    app: {
      getSettings,
      getApiKey,
      runChat,
      publicState,
      saveSettings,
      lookAtScreen: () => askAboutScreen(),
      onActivity: setActivity,
      chooseCustomMascot: chooseCustomMascotNow,
      customMascotPreview,
      suspendHotkeys,
    },
  });
  // Never leave the hotkeys paused if the bar closes while a shortcut box is focused.
  overlay.win.on('hide', () => suspendHotkeys(false));

  registerMascotIpc({
    getMascot: () => mascot,
    onClick: () => overlay.toggle(), // the mascot never takes focus, so the bar keeps it
    onLook: () => askAboutScreen(),
    onMenu: showMascotMenu,
  });

  tray = createTray({
    iconPath: path.join(ASSETS, 'tray.png'),
    balloonIconPath: path.join(ASSETS, 'icon.png'),
    getSettings,
    actions: {
      open: () => overlay.show(),
      screen: () => askAboutScreen({ fromMenu: true }),
      clipboard: rewriteClipboardNow,
      settings: () => overlay.show({ view: 'settings' }),
      setMascotMode: (on) => setMode(on ? 'mascot' : 'bar'),
      resetPositions: () => {
        resetPositions();
        overlay.hide(); // reopens at the default spot
        mascot?.resetPosition();
      },
      setStartOnLogin: (enabled) => {
        updateSettings({ startOnLogin: enabled });
        applyLoginItem(enabled);
        tray.update();
      },
      quit: () => app.quit(),
    },
  });

  applyHotkeys({ notifyOnFailure: true });
  applyLoginItem(getSettings().startOnLogin);
  applyMode();

  // Started by hand in bar mode: show the bar so the user sees it is running.
  // In mascot mode the mascot is the visible sign. Started at login (--hidden): stay quiet.
  if (!process.argv.includes('--hidden') && getSettings().mode !== 'mascot') {
    overlay.webContents.once('did-finish-load', () => overlay.show());
  }
}

// ---------------------------------------------------------------------------

/**
 * Settings → Shortcuts: while a box is recording, AskBar's own global hotkeys
 * are unregistered so the keys reach the box (otherwise pressing the current
 * combination would trigger it instead of being recorded).
 */
let hotkeysSuspended = false;
function suspendHotkeys(on) {
  if (on === hotkeysSuspended) return;
  hotkeysSuspended = on;
  if (on) globalShortcut.unregisterAll();
  else applyHotkeys();
}

function applyHotkeys({ notifyOnFailure = false } = {}) {
  if (hotkeysSuspended) return; // re-applied when recording ends
  hotkeyErrors = registerHotkeys(getSettings().hotkeys, {
    toggle: () => overlay.toggle(),
    screen: () => askAboutScreen(),
    clipboard: rewriteClipboardNow,
  });
  if (notifyOnFailure && hotkeyErrors.length) {
    notify(
      'Some shortcuts are unavailable',
      hotkeyErrors.map((f) => `${prettyAccelerator(f.accelerator)}: ${f.reason}`).join('\n') +
        '\nYou can change them in Settings.'
    );
  }
  tray?.update();
}

/** Creates or removes the mascot to match the "mode" setting. */
function applyMode() {
  const wantMascot = getSettings().mode === 'mascot';
  if (wantMascot && !mascot) {
    mascot = new Mascot({
      position: getMascotPosition(),
      onMoved: setMascotPosition,
      onDragStart: () => overlay.hide(),
    });
    applyMascotCharacter();
  } else if (!wantMascot && mascot) {
    mascot.destroy();
    mascot = null;
  }
}

/** Shows the chosen character; "your own image" falls back to Mochi until an image is chosen. */
async function applyMascotCharacter() {
  if (!mascot) return;
  const { mascot: id } = getSettings();
  if (id === 'custom') {
    const images = await loadCustomImages(getCustomMascot());
    if (images.idle) return mascot?.setCharacter({ id: 'custom', images });
  }
  mascot?.setCharacter({ id: id === 'custom' ? 'mochi' : id });
}

/** Settings → Mascot → "Your own image…": pick one image, or idle / thinking / done. */
async function chooseCustomMascotNow() {
  overlay.suppressBlur = true; // the file dialog takes focus; keep the bar open behind it
  try {
    const res = await chooseCustomMascot(overlay.win);
    if (!res.ok) return res;
    const previous = getCustomMascot();
    setCustomMascot(res.record);
    await removeCustomFiles(previous, res.record);
    if (getSettings().mascot === 'custom') await applyMascotCharacter();
    return { ok: true, info: customMascotInfo(), preview: await customMascotPreview() };
  } catch (err) {
    return { ok: false, error: `Couldn't use that image: ${err.message}` };
  } finally {
    overlay.suppressBlur = false;
    overlay.focus();
  }
}

/** File names of your own mascot images, for the settings page. */
function customMascotInfo() {
  const record = getCustomMascot();
  if (!record?.idle) return null;
  return Object.fromEntries(Object.entries(record).map(([state, entry]) => [state, entry.original]));
}

async function customMascotPreview() {
  return (await loadCustomImages(getCustomMascot())).idle || null;
}

function setMode(mode) {
  updateSettings({ mode });
  applyMode();
  tray.update();
}

function setActivity(state) {
  mascot?.setState(state, { barVisible: overlay.isVisible() });
}

function showMascotMenu() {
  if (!mascot) return;
  const s = getSettings();
  Menu.buildFromTemplate([
    { label: `Ask    ${prettyAccelerator(s.hotkeys.toggle)}`, click: () => overlay.show() },
    { label: `Look at screen    ${prettyAccelerator(s.hotkeys.screen)}`, click: () => askAboutScreen({ fromMenu: true }) },
    { label: 'Settings…', click: () => overlay.show({ view: 'settings' }) },
    { type: 'separator' },
    { label: 'Switch to bar only', click: () => setMode('bar') },
    { label: 'Quit AskBar', click: () => app.quit() },
  ]).popup({ window: mascot.win });
}

/**
 * Look at the screen: the hotkey, the bar's button and the mascot's button
 * all land here. Captures the active display (with AskBar's own windows made
 * transparent so they are not in the picture), then opens the bar with the
 * screenshot attached to the next question. Never runs on its own.
 */
async function askAboutScreen({ fromMenu = false } = {}) {
  try {
    if (fromMenu) await new Promise((r) => setTimeout(r, 250)); // let the menu close
    const image = await withWindowsTransparent([overlay.win, mascot?.win], () => captureActiveDisplay());
    overlay.show();
    overlay.send('screen:attached', { image });
  } catch (err) {
    if (overlay.isVisible()) overlay.send('screen:error', err.message);
    else notify('Screen capture failed', err.message);
  }
}

function rewriteClipboardNow() {
  const settings = getSettings();
  return rewriteClipboard({
    settings,
    apiKey: getApiKey(settings.provider),
    notify,
    onMissingKey: () => overlay.show({ view: 'settings', notice: 'Add an API key to use clipboard rewrite.' }),
    setBusy: (busy, succeeded) => {
      tray.setBusy(busy);
      setActivity(busy ? 'thinking' : succeeded ? 'done' : 'idle');
    },
  });
}

function applyLoginItem(enabled) {
  // In development this would register electron.exe itself, so only the built app does it.
  if (!app.isPackaged) return;
  // The portable build runs from a temp folder; register the .exe the user actually launched.
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  app.setLoginItemSettings({ openAtLogin: enabled, path: exe, args: ['--hidden'] });
}

/** What the settings page may know. Never includes API keys. */
function publicState() {
  return {
    settings: getSettings(),
    hasKey: Object.fromEntries(PROVIDER_IDS.map((id) => [id, hasApiKey(id)])),
    providers: PROVIDERS,
    hotkeyLabels: HOTKEY_LABELS,
    hotkeyErrors,
    mascots: MASCOTS,
    customMascot: customMascotInfo(),
    encryptionAvailable: keyEncryptionAvailable(),
    isPackaged: app.isPackaged,
    version: app.getVersion(),
  };
}

function saveSettings(patch) {
  const errors = [];
  const { keys, ...rest } = patch;

  for (const id of PROVIDER_IDS) {
    const value = keys?.[id];
    if (value === null) removeApiKey(id);
    else if (typeof value === 'string' && value.trim()) {
      if (!setApiKey(id, value)) errors.push(`The ${PROVIDERS[id].shortLabel} key doesn't look valid.`);
    }
  }

  const before = getSettings();
  const after = updateSettings(rest);
  applyHotkeys();
  for (const f of hotkeyErrors) {
    errors.push(`${prettyAccelerator(f.accelerator)} (${HOTKEY_LABELS[f.name]}): ${f.reason}.`);
  }
  if (after.startOnLogin !== before.startOnLogin) applyLoginItem(after.startOnLogin);
  if (after.mode !== before.mode) applyMode();
  else if (after.mascot !== before.mascot) applyMascotCharacter();
  tray.update();

  return { ok: errors.length === 0, errors, state: publicState() };
}

function notify(title, body = '') {
  if (tray && process.platform === 'win32') return tray.notify(title, body);
  if (!Notification.isSupported()) return;
  new Notification({
    title,
    body,
    silent: true,
    icon: nativeImage.createFromPath(path.join(ASSETS, 'icon.png')),
  }).show();
}
