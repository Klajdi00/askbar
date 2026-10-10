// Mascot page: shows the state from the main process and turns pointer input
// into click / drag / menu messages. Press the left button and move to drag:
// the main process then follows the mouse, so it stays smooth even for fast
// moves, and the mascot stays exactly where it is dropped.
(() => {
  'use strict';

  const api = window.mascot;
  const root = document.getElementById('mascot');
  const look = document.getElementById('look');
  const custom = document.getElementById('custom');
  const DRAG_THRESHOLD = 4; // px of movement before a press becomes a drag
  const CHARACTERS = ['mochi', 'bolt', 'boo', 'custom'];

  let press = null; // { x, y, offsetX, offsetY } while the left button is down
  let dragging = false;
  let customImages = {}; // your own mascot: { idle, thinking?, done? } as data: URLs

  api.onState((state) => {
    root.dataset.state = ['idle', 'thinking', 'done'].includes(state) ? state : 'idle';
    showCustomImage();
  });

  api.onCharacter((character) => {
    const id = CHARACTERS.includes(character?.id) ? character.id : 'mochi';
    customImages = {};
    if (id === 'custom') {
      for (const [state, url] of Object.entries(character.images || {})) {
        if (typeof url === 'string' && url.startsWith('data:image/')) customImages[state] = url;
      }
    }
    root.dataset.character = id === 'custom' && !customImages.idle ? 'mochi' : id;
    showCustomImage();
  });

  /** Your own mascot: the picture for the current state, or the idle one. */
  function showCustomImage() {
    if (root.dataset.character !== 'custom') return;
    const src = customImages[root.dataset.state] || customImages.idle;
    if (src && custom.src !== src) custom.src = src;
  }

  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    press = { x: e.screenX, y: e.screenY, offsetX: e.clientX, offsetY: e.clientY };
    root.setPointerCapture(e.pointerId);
  });

  root.addEventListener('pointermove', (e) => {
    if (!press || dragging) return;
    if (Math.hypot(e.screenX - press.x, e.screenY - press.y) > DRAG_THRESHOLD) {
      dragging = true;
      root.classList.add('dragging');
      api.dragStart(press.offsetX, press.offsetY);
    }
  });

  root.addEventListener('pointerup', () => {
    if (!press) return;
    if (dragging) {
      api.dragEnd();
    } else {
      squish();
      api.click();
    }
    reset();
  });

  root.addEventListener('lostpointercapture', () => {
    if (dragging) api.dragEnd();
    reset();
  });

  root.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    api.openMenu();
  });

  // The look button must not start a drag or count as a click on the mascot.
  look.addEventListener('pointerdown', (e) => e.stopPropagation());
  look.addEventListener('pointerup', (e) => e.stopPropagation());
  look.addEventListener('click', (e) => {
    e.stopPropagation();
    api.lookAtScreen();
  });

  function squish() {
    root.classList.remove('squish');
    void root.offsetWidth; // restart the animation on quick repeated clicks
    root.classList.add('squish');
    setTimeout(() => root.classList.remove('squish'), 450);
  }

  function reset() {
    press = null;
    dragging = false;
    root.classList.remove('dragging');
  }
})();
