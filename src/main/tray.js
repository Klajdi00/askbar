import { Menu, Tray, nativeImage } from 'electron';
import { prettyAccelerator } from './hotkeys.js';

/** Tray icon with the main actions. Left click opens the launcher. */
export function createTray({ iconPath, balloonIconPath, getSettings, actions }) {
  const tray = new Tray(nativeImage.createFromPath(iconPath));
  const balloonIcon = nativeImage.createFromPath(balloonIconPath);
  let busy = false;

  const label = (text, accelerator) => (accelerator ? `${text}    ${prettyAccelerator(accelerator)}` : text);

  function update() {
    const s = getSettings();
    tray.setToolTip(busy ? 'AskBar: working…' : `AskBar: ${prettyAccelerator(s.hotkeys.toggle)} to open`);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: label('Open AskBar', s.hotkeys.toggle), click: actions.open },
        { label: label('Ask about screen', s.hotkeys.screen), click: actions.screen },
        { label: label('Rewrite clipboard text', s.hotkeys.clipboard), click: actions.clipboard },
        { type: 'separator' },
        { label: 'Settings…', click: actions.settings },
        {
          label: 'Start on login',
          type: 'checkbox',
          checked: s.startOnLogin,
          click: (item) => actions.setStartOnLogin(item.checked),
        },
        { type: 'separator' },
        { label: 'Quit AskBar', click: actions.quit },
      ])
    );
  }

  tray.on('click', actions.open);
  update();

  return {
    update,
    setBusy(value) {
      busy = value;
      update();
    },
    /** Windows notification from the tray icon; unlike toasts, needs no Start menu shortcut. */
    notify(title, content) {
      tray.displayBalloon({ title, content: content || ' ', icon: balloonIcon, noSound: true });
    },
  };
}
