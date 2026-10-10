// Pure geometry for placing the bar and the mascot. No Electron imports, so
// it can be unit tested. Rects are { x, y, width, height } in screen DIPs.

const clamp = (n, min, max) => Math.min(Math.max(n, min), Math.max(min, max));

/** Bar-only mode: horizontally centred, near the top of the work area (like Spotlight). */
export function placeTopCenter(workArea, { width, topRatio = 0.18, bottomMargin = 24 }) {
  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const top = Math.round(workArea.y + workArea.height * topRatio);
  return { x, top, growUp: false, maxHeight: workArea.y + workArea.height - top - bottomMargin };
}

/**
 * Mascot mode: put the bar beside the mascot, on the side with more room.
 * In the lower half of the screen the bar grows upwards from the mascot's
 * bottom edge (growUp), otherwise downwards from its top edge.
 */
export function placeNear(anchor, workArea, { width, gap = 6, margin = 12 }) {
  const onRightHalf = anchor.x + anchor.width / 2 > workArea.x + workArea.width / 2;
  const rawX = onRightHalf ? anchor.x - gap - width : anchor.x + anchor.width + gap;
  const x = Math.round(clamp(rawX, workArea.x, workArea.x + workArea.width - width));

  const growUp = anchor.y + anchor.height / 2 > workArea.y + workArea.height / 2;
  if (growUp) {
    const bottom = Math.min(anchor.y + anchor.height, workArea.y + workArea.height);
    return { x, bottom, growUp, maxHeight: bottom - workArea.y - margin };
  }
  const top = Math.max(anchor.y, workArea.y);
  return { x, top, growUp, maxHeight: workArea.y + workArea.height - top - margin };
}

/** Keeps a rect fully inside the work area. */
export function clampInto(rect, workArea) {
  return {
    x: Math.round(clamp(rect.x, workArea.x, workArea.x + workArea.width - rect.width)),
    y: Math.round(clamp(rect.y, workArea.y, workArea.y + workArea.height - rect.height)),
  };
}

/**
 * After the user drags the bar somewhere: in the lower half of the screen it
 * grows upwards from its current bottom edge, otherwise downwards from its top.
 */
export function anchorAfterMove(bounds, workArea, { margin = 12 } = {}) {
  const growUp = bounds.y + bounds.height / 2 > workArea.y + workArea.height / 2;
  if (growUp) {
    const bottom = bounds.y + bounds.height;
    return { x: bounds.x, bottom, growUp, maxHeight: bottom - workArea.y - margin };
  }
  return { x: bounds.x, top: bounds.y, growUp, maxHeight: workArea.y + workArea.height - bounds.y - margin };
}

/** Bar-only mode with a remembered spot: { x, top } or { x, bottom }, kept on screen. */
export function placeSaved(saved, workArea, { width, margin = 12, minHeight = 60 }) {
  const x = Math.round(clamp(saved.x, workArea.x, workArea.x + workArea.width - width));
  if (Number.isFinite(saved.bottom)) {
    const bottom = Math.round(clamp(saved.bottom, workArea.y + minHeight, workArea.y + workArea.height));
    return { x, bottom, growUp: true, maxHeight: bottom - workArea.y - margin };
  }
  const top = Math.round(clamp(saved.top, workArea.y, workArea.y + workArea.height - minHeight));
  return { x, top, growUp: false, maxHeight: workArea.y + workArea.height - top - margin };
}

/** Default mascot spot: bottom-right corner of the work area. */
export function defaultMascotPosition(workArea, size, margin = 24) {
  return {
    x: workArea.x + workArea.width - size - margin,
    y: workArea.y + workArea.height - size - margin,
  };
}

/** True when at least half of the rect is on one of the work areas (e.g. after a monitor was unplugged). */
export function isMostlyVisible(rect, workAreas) {
  return workAreas.some((a) => {
    const w = Math.min(rect.x + rect.width, a.x + a.width) - Math.max(rect.x, a.x);
    const h = Math.min(rect.y + rect.height, a.y + a.height) - Math.max(rect.y, a.y);
    return w > 0 && h > 0 && w * h >= (rect.width * rect.height) / 2;
  });
}
