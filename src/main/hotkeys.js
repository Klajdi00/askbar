import { globalShortcut } from 'electron';

/**
 * (Re)registers the global hotkeys. Returns the ones that could not be
 * registered, e.g. because another app (or a Windows input method) owns them.
 *
 * @param {Record<string, string>} hotkeys  name -> Electron accelerator ("Control+Space")
 * @param {Record<string, () => void>} handlers  name -> callback
 */
export function registerHotkeys(hotkeys, handlers) {
  globalShortcut.unregisterAll();
  const failed = [];
  for (const [name, accelerator] of Object.entries(hotkeys)) {
    if (!accelerator || !handlers[name]) continue;
    try {
      if (!globalShortcut.register(accelerator, handlers[name])) {
        failed.push({ name, accelerator, reason: 'already used by another app' });
      }
    } catch {
      failed.push({ name, accelerator, reason: 'not a valid shortcut' });
    }
  }
  return failed;
}

/** "Control+Shift+S" -> "Ctrl+Shift+S" for display. */
export function prettyAccelerator(accelerator = '') {
  return accelerator
    .replace(/CommandOrControl|CmdOrCtrl|Control/g, 'Ctrl')
    .replace(/Super|Meta/g, 'Win');
}
