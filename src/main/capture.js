import { desktopCapturer, screen } from 'electron';
import { LIMITS } from '../config/defaults.js';

/**
 * Captures the display the mouse is on, downscaled and JPEG-encoded.
 *
 * PRIVACY: the screenshot exists only in memory. It is never written to disk,
 * never cached, and only ever leaves the machine inside a request to the AI
 * provider the user picked (see src/api/providers.js).
 *
 * @returns {Promise<{ mime: string, base64: string, width: number, height: number, bytes: number }>}
 */
export async function captureActiveDisplay({
  maxWidth = LIMITS.screenshotMaxWidth,
  quality = LIMITS.screenshotJpegQuality,
} = {}) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const pxWidth = Math.round(display.size.width * display.scaleFactor);
  const pxHeight = Math.round(display.size.height * display.scaleFactor);
  const scale = Math.min(1, maxWidth / pxWidth);
  const thumbnailSize = { width: Math.round(pxWidth * scale), height: Math.round(pxHeight * scale) };

  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
  const source = pickSource(sources, display);
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error('Could not capture the screen.');
  }

  let image = source.thumbnail;
  if (image.getSize().width > maxWidth) image = image.resize({ width: maxWidth, quality: 'good' });

  const jpeg = image.toJPEG(quality); // Buffer in memory only
  const { width, height } = image.getSize();
  return { mime: 'image/jpeg', base64: jpeg.toString('base64'), width, height, bytes: jpeg.length };
}

/**
 * Makes AskBar's own visible windows (bar, mascot) fully transparent while
 * `fn` runs, so a screenshot shows what is underneath them. Opacity (rather
 * than hide()) keeps keyboard focus where it was. This is only for our own
 * capture; the windows are not hidden from screen sharing or recording.
 */
export async function withWindowsTransparent(windows, fn) {
  const visible = windows.filter((w) => w && !w.isDestroyed() && w.isVisible());
  for (const w of visible) w.setOpacity(0);
  if (visible.length) await new Promise((r) => setTimeout(r, 150)); // let the compositor draw a frame without us
  try {
    return await fn();
  } finally {
    for (const w of visible) if (!w.isDestroyed()) w.setOpacity(1);
  }
}

function pickSource(sources, display) {
  const byId = sources.find((s) => s.display_id === String(display.id));
  if (byId) return byId;
  // Some multi-monitor setups report empty display ids; screen sources are
  // usually listed in the same order as screen.getAllDisplays().
  const index = screen.getAllDisplays().findIndex((d) => d.id === display.id);
  return sources[index] || sources[0];
}
