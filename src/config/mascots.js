// Mascots you can pick in Settings. The built-in ones are original artwork
// (inline SVG in src/renderer/mascot.html); "custom" uses your own image(s).

export const MASCOTS = [
  { id: 'mochi', label: 'Mochi, the kitten' },
  { id: 'bolt', label: 'Bolt, the robot' },
  { id: 'boo', label: 'Boo, the ghost' },
  { id: 'custom', label: 'Your own image…' },
];

export const MASCOT_IDS = MASCOTS.map((m) => m.id);

export const CUSTOM_MASCOT = {
  maxFiles: 3, // one picture for every state, or idle / thinking / done
  maxBytes: 5 * 1024 * 1024,
  extensions: ['png', 'gif', 'webp', 'jpg', 'jpeg', 'svg'],
};
