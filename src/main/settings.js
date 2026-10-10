import Store from 'electron-store';
import { safeStorage } from 'electron';
import { DEFAULT_SETTINGS } from '../config/defaults.js';
import { PROVIDER_IDS } from '../config/providers.js';

// Settings live in %APPDATA%\AskBar\settings.json (electron-store).
// API keys are encrypted with Electron's safeStorage (Windows DPAPI: only this
// Windows user on this machine can decrypt them) and stored under `keys`.
// Keys are only ever read in the main process; the renderer just learns
// whether a key exists.

let store;

export function initSettings() {
  store = new Store({ name: 'settings', clearInvalidConfig: true });
}

/** Stored settings merged over the defaults, so new options get sane values. */
export function getSettings() {
  const saved = store.get('settings') || {};
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    models: { ...DEFAULT_SETTINGS.models, ...(saved.models || {}) },
    hotkeys: { ...DEFAULT_SETTINGS.hotkeys, ...(saved.hotkeys || {}) },
  };
}

/** Validates a partial update from the settings form and saves it. */
export function updateSettings(patch = {}) {
  const next = getSettings();

  if (PROVIDER_IDS.includes(patch.provider)) next.provider = patch.provider;
  if (patch.mode === 'bar' || patch.mode === 'mascot') next.mode = patch.mode;

  for (const id of PROVIDER_IDS) {
    const model = patch.models?.[id];
    if (typeof model === 'string') {
      const clean = model.trim();
      if (/^[A-Za-z0-9._:/-]{1,100}$/.test(clean)) next.models[id] = clean;
    }
  }

  for (const name of Object.keys(DEFAULT_SETTINGS.hotkeys)) {
    const accel = patch.hotkeys?.[name];
    if (typeof accel === 'string' && accel.length <= 60) next.hotkeys[name] = accel.trim();
  }

  for (const flag of ['redact', 'hideOnBlur', 'startOnLogin']) {
    if (typeof patch[flag] === 'boolean') next[flag] = patch[flag];
  }

  if (typeof patch.clipboardInstruction === 'string') {
    const clean = patch.clipboardInstruction.trim().slice(0, 2000);
    next.clipboardInstruction = clean || DEFAULT_SETTINGS.clipboardInstruction;
  }

  store.set('settings', next);
  return next;
}

/** Where the mascot was last dropped. Set by the main process only, never by the page. */
export function getMascotPosition() {
  const p = store.get('mascotPosition');
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
}

export function setMascotPosition({ x, y }) {
  if (Number.isFinite(x) && Number.isFinite(y)) store.set('mascotPosition', { x: Math.round(x), y: Math.round(y) });
}

/** Where the user last dropped the bar (bar-only mode): { x, top } or { x, bottom }. */
export function getBarPosition() {
  const p = store.get('barPosition');
  if (!p || !Number.isFinite(p.x)) return null;
  return Number.isFinite(p.bottom) ? { x: p.x, bottom: p.bottom } : Number.isFinite(p.top) ? { x: p.x, top: p.top } : null;
}

export function setBarPosition({ x, top, bottom }) {
  if (!Number.isFinite(x)) return;
  if (Number.isFinite(bottom)) store.set('barPosition', { x: Math.round(x), bottom: Math.round(bottom) });
  else if (Number.isFinite(top)) store.set('barPosition', { x: Math.round(x), top: Math.round(top) });
}

export function resetPositions() {
  store.delete('barPosition');
  store.delete('mascotPosition');
}

export function keyEncryptionAvailable() {
  return safeStorage.isEncryptionAvailable();
}

export function hasApiKey(provider) {
  return Boolean(store.get(`keys.${provider}`)?.data);
}

export function getApiKey(provider) {
  const entry = store.get(`keys.${provider}`);
  if (!entry?.data) return '';
  if (!entry.encrypted) return entry.data;
  try {
    return safeStorage.decryptString(Buffer.from(entry.data, 'base64'));
  } catch {
    return ''; // e.g. settings copied from another Windows account: ask for the key again
  }
}

export function setApiKey(provider, key) {
  if (!PROVIDER_IDS.includes(provider)) return false;
  const clean = String(key || '').trim();
  if (!clean || clean.length > 500 || /\s/.test(clean)) return false;
  if (keyEncryptionAvailable()) {
    store.set(`keys.${provider}`, { encrypted: true, data: safeStorage.encryptString(clean).toString('base64') });
  } else {
    // Fallback when the OS offers no encryption: plain text in the user's own profile.
    store.set(`keys.${provider}`, { encrypted: false, data: clean });
  }
  return true;
}

export function removeApiKey(provider) {
  if (PROVIDER_IDS.includes(provider)) store.delete(`keys.${provider}`);
}
