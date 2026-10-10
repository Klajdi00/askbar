// Pure helpers for custom mascot images (no Electron imports; unit tested).
import path from 'node:path';

const MIME = {
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
};

export function mimeFor(file) {
  return MIME[path.extname(file).slice(1).toLowerCase()] || null;
}

/**
 * Decides which chosen file shows in which state, by file name:
 * "...think..." -> thinking, "...done/happy/ready..." -> done, "...idle..." -> idle.
 * A single file (or any unnamed one) becomes the idle picture, which is also
 * used for states without their own picture.
 */
export function assignStates(files) {
  const out = {};
  const rest = [];
  for (const file of files) {
    const name = path.basename(file, path.extname(file)).toLowerCase();
    if (!out.thinking && /think/.test(name)) out.thinking = file;
    else if (!out.done && /done|happy|ready/.test(name)) out.done = file;
    else if (!out.idle && /idle/.test(name)) out.idle = file;
    else rest.push(file);
  }
  if (!out.idle) out.idle = rest.shift() || out.thinking || out.done;
  return out;
}

/** Stored file names must be plain names inside the mascot folder. */
export function isSafeStoredName(name) {
  return typeof name === 'string' && name.length < 100 && /^[a-z]+-\d+\.[a-z]+$/.test(name) && mimeFor(name) !== null;
}
