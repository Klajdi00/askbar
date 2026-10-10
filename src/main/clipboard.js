import { clipboard } from 'electron';
import { runTransform } from './ai.js';
import { LIMITS } from '../config/defaults.js';

let busy = false;

/**
 * Clipboard quick action: rewrites whatever text is on the clipboard with the
 * instruction from Settings and puts the result back, ready for Ctrl+V.
 */
export async function rewriteClipboard({ settings, apiKey, notify, onMissingKey, setBusy }) {
  if (busy) return notify('Still rewriting', 'The previous clipboard rewrite has not finished yet.');

  const original = clipboard.readText();
  if (!original.trim()) return notify('Clipboard is empty', 'Copy some text first, then press the shortcut again.');
  if (original.length > LIMITS.maxClipboardChars) {
    return notify('Text too long', `Clipboard rewrite handles up to ${LIMITS.maxClipboardChars.toLocaleString('en')} characters.`);
  }
  if (!apiKey) return onMissingKey();

  busy = true;
  let succeeded = false;
  setBusy?.(true);
  try {
    const { text, truncated } = await runTransform({
      settings,
      apiKey,
      instruction: settings.clipboardInstruction,
      text: original,
    });
    if (!text.trim()) throw new Error('The AI returned an empty result.');

    // Don't clobber something the user copied while we were waiting.
    if (clipboard.readText() !== original) {
      return notify('Clipboard changed', 'You copied something else in the meantime, so the result was not pasted in.');
    }
    clipboard.writeText(text);
    succeeded = true;
    notify(
      'Rewritten text copied',
      truncated ? 'The result hit the length limit and may be cut off. Press Ctrl+V to paste.' : 'Press Ctrl+V to paste.'
    );
  } catch (err) {
    notify('Rewrite failed', err.message);
  } finally {
    busy = false;
    setBusy?.(false, succeeded);
  }
}
