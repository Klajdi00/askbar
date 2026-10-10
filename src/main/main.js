// AskBar main process: tray app with a global-hotkey launcher window.
//
// Network: the only outgoing requests are the AI API calls in src/main/ai.js,
// to the provider the user picked. No telemetry, no analytics, no update checks.
// (Spellcheck is off in the window, which also stops Chromium from downloading
// dictionaries.)

import { app, globalShortcut, Menu, nativeImage, Notification } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HOTKEY_LABELS } from '../config/defaults.js';
import { PROVIDERS, PROVIDER_IDS } from '../config/providers.js';
import { runChat, warmUpProxy } from './ai.js';
import { captureActiveDisplay } from './capture.js';
import { rewriteClipboard } from './clipboard.js';
import { prettyAccelerator, registerHotkeys } from './hotkeys.js';
import { registerIpc } from './ipc.js';
import {
  getApiKey,
  getSettings,
  hasApiKey,
  initSettings,
  keyEncryptionAvailable,
  removeApiKey,
  setApiKey,
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
    onShow: () => warmUpProxy(getSettings().provider),
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
      captureScreen: () => overlay.whileTransparent(() => captureActiveDisplay()),
    },
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

  // Started by hand: show the bar so the user sees it is running.
  // Started at login (--hidden): stay in the tray.
  if (!process.argv.includes('--hidden')) {
    overlay.webContents.once('did-finish-load', () => overlay.show());
  }
}

// ---------------------------------------------------------------------------

function applyHotkeys({ notifyOnFailure = false } = {}) {
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

/**
 * Screen hotkey: capture the active display (with the launcher made
 * transparent so it is not in the picture), then show the launcher with the
 * screenshot attached. If the launcher was already open and focused, the
 * renderer sends right away with whatever question is typed.
 */
async function askAboutScreen({ fromMenu = false } = {}) {
  const wasFocused = overlay.isVisible() && overlay.win.isFocused();
  try {
    if (fromMenu) await new Promise((r) => setTimeout(r, 250)); // let the tray menu close
    const image = await overlay.whileTransparent(() => captureActiveDisplay());
    overlay.show();
    overlay.send('screen:attached', { image, autoSend: wasFocused });
  } catch (err) {
    notify('Screen capture failed', err.message);
  }
}

function rewriteClipboardNow() {
  const settings = getSettings();
  return rewriteClipboard({
    settings,
    apiKey: getApiKey(settings.provider),
    notify,
    onMissingKey: () => overlay.show({ view: 'settings', notice: 'Add an API key to use clipboard rewrite.' }),
    setBusy: (busy) => tray.setBusy(busy),
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
