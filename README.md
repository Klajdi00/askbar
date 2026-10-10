# AskBar

A Spotlight-style AI launcher for Windows. Press **Ctrl+Space**, type a question, and the answer
streams in below a compact bar. Works with **Claude**, **OpenAI** or **Gemini** using your own API
key. It can also look at your screen when you ask it to, and rewrite text you copied. If you like,
a small mascot can sit in a corner of your screen: click it to ask.

AskBar is openly an AI assistant. The bar carries an "AI" badge, and both the bar and the mascot
are normal windows: they show up in screen shares and recordings like any other app.

- No account, no backend. Your API key stays on your PC.
- No telemetry, no analytics, no update checks. The only network traffic is your request to the
  AI provider you picked.
- Two Windows builds: a regular installer and a **portable single .exe** for PCs where you can't
  install software.

License: [AGPL-3.0](LICENSE).

---

## Contents

- [Install](#install)
- [Run from source](#run-from-source)
- [First run](#first-run)
- [Hotkeys](#hotkeys)
- [Features](#features)
- [Privacy guarantees](#privacy-guarantees)
- [Building](#building)
- [Project structure](#project-structure)
- [Known limitations](#known-limitations)

## Install

Download one of the two files from `dist/` (see [Building](#building)):

| File | When to use it |
|---|---|
| `AskBar-Setup-<version>.exe` | Normal install. Per-user (no admin rights needed), Start menu shortcut, uninstall from *Settings → Apps*. |
| `AskBar-Portable-<version>.exe` | No installation at all. See below. |

### The portable build

Many work PCs block installers. The portable build is a single `.exe` you can run from any
folder you're allowed to write to (Downloads, Documents, a USB stick):

- Double-click it and AskBar starts in the tray. Nothing is installed and no admin rights are
  needed.
- At each launch it unpacks itself to a temporary folder, so it starts a few seconds slower than
  the installed version.
- Settings and your (encrypted) API key are stored in `%APPDATA%\AskBar`, the same place as the
  installed version, not next to the `.exe`.
- **Start on login** registers the `.exe` at its current location. If you move the file, launch
  it once from the new place (it updates the entry) or toggle the option off and on.
- To remove it: turn off *Start on login*, quit from the tray icon, delete the `.exe`, and
  optionally delete `%APPDATA%\AskBar`.

Both builds are unsigned, so Windows SmartScreen may say "Windows protected your PC". Choose
**More info → Run anyway**. Some company policies block unsigned programs entirely; see
[Known limitations](#known-limitations).

## Run from source

Requires Node.js 22.12 or later, on Windows.

```bash
npm install
npm start
```

The first `npm start` downloads the Electron binary (about 100 MB) if npm didn't already.
`npm start` shows the bar right away. Press **F12** while it is focused to open DevTools
(development only).

Run the unit tests (no API key needed):

```bash
npm test
```

## First run

1. AskBar opens with a welcome message. Click **Open settings** (or the gear icon, or **Ctrl+,**).
2. Pick a provider, paste your API key, and click **Save**.
   - Claude: <https://console.anthropic.com/settings/keys>
   - OpenAI: <https://platform.openai.com/api-keys>
   - Gemini: <https://aistudio.google.com/apikey>
3. Press **Esc** to close the bar and **Ctrl+Space** to bring it back from any app.

The model field accepts any model id the provider supports; the suggestions are only a starting
point. Defaults: `claude-opus-5-5`, `gpt-5.5`, `gemini-flash-latest`. All three support images,
which screen questions need.

## Hotkeys

Global (work from any app; change them in Settings):

| Default | Action |
|---|---|
| **Ctrl+Space** | Open / close the launcher |
| **Ctrl+Shift+S** | Look at screen: capture the display under the mouse and attach it to your next question |
| **Ctrl+Shift+J** | Rewrite the text on the clipboard, then paste it with Ctrl+V |

Inside the launcher:

| Key | Action |
|---|---|
| **Enter** | Send |
| **Shift+Enter** | New line |
| **↑** (empty input) | Recall your last question |
| **Ctrl+N** | New chat |
| **Ctrl+,** | Open / close Settings |
| **Esc** | Close Settings, or close the launcher |

Clicking outside the launcher closes it too (you can turn that off in Settings). A response that
is still streaming keeps going while the bar is hidden; reopen it to read it. After 5 minutes of
inactivity, reopening starts a fresh chat.

The tray icon has the same actions, plus **Mascot mode**, **Reset positions**, **Start on login**
and **Quit**.

## Features

### Chat

The bar is compact (440 px wide). Answers stream in below it and are rendered as simple Markdown:
paragraphs, lists, code blocks with a copy button, tables and links. The answer area shows about
four lines and then scrolls, following the answer as it streams. Links open in your default
browser. Follow-up questions keep the context of the current chat; up to the last 20 messages are
sent.

### Look at the screen

Press **Ctrl+Shift+S**, or click the **eye** button on the bar or on the mascot. All three do
exactly the same thing. AskBar:

1. makes its own windows (bar and mascot) transparent for a moment so they are not in the picture,
2. captures the display under your mouse,
3. downscales it to at most 1600 px wide, as a JPEG at quality 70, **in memory**,
4. attaches it to your next question, shown as a chip with a thumbnail and its size so you can see
   exactly what will be sent (✕ removes it).

Type your question and press Enter. If you press Enter without typing anything, AskBar asks the
model to explain what's on screen and suggest a next step.

Capture only ever happens when you press the hotkey or an eye button. If you type a question that
is about the screen ("what am I looking at", "see my screen", also in French and Albanian) and no
screenshot is attached, a one-line hint appears: *"Press the screen button or Ctrl+Shift+S so I
can see it."* It never captures by itself.

The screenshot stays attached to that question, so follow-ups can refer to it. Only the most
recent screenshot is re-sent with follow-ups.

### Mascot mode (optional)

Off by default. Turn it on in **Settings → Mode → Mascot**, or with **Mascot mode** in the tray
menu. A small character (about 96 px; Mochi the kitten by default) then sits on top of your other
windows:

- **Click** it (or press **Ctrl+Space**) to open the compact bar right next to it. Click it again
  to close the bar. In the lower half of the screen, the bar opens upwards so the input stays next
  to the mascot.
- **Hold the left button and drag** it anywhere; it stays exactly where you drop it (only pulled
  back if part of it would be off screen). The spot is remembered across restarts; if that spot is
  no longer on a screen (monitor unplugged), it goes back to the bottom-right corner.
- **Hover** it to show its eye button (look at the screen).
- **Right-click** it for a menu: Ask, Look at screen, Settings, Switch to bar only, Quit.
- It shows what AskBar is doing: **idle** (Mochi blinks, wags its tail, twitches an ear, sticks
  its tongue out now and then), **thinking** while an answer streams or a clipboard rewrite runs
  (eyes up, thought bubbles), and **done** when the answer is ready (happy eyes, sparkles). "Done" stays
  until you open the bar, so you can tell an answer is waiting. It squishes when you click it and
  looks surprised while you carry it.

The mascot never takes keyboard focus, so clicking it doesn't disturb the app you're typing in.

### Choosing your mascot

Pick one in **Settings → Mascot**; the change shows immediately:

| Mascot | |
|---|---|
| **Mochi, the kitten** | round ginger kitten: tail wag, ear twitch, tongue "blep" |
| **Bolt, the robot** | blob robot: antenna glows while thinking, raises an arm when done |
| **Boo, the ghost** | little ghost: floats and waves |
| **Your own image…** | any picture you like |

All of them react the same way: thought bubbles while thinking, sparkles when done, a squish when
clicked, and a surprised look (or a wiggle, for your own image) while you carry them.

**Your own image.** Choose **Your own image…** and pick a file: PNG, GIF (animated GIFs work),
WebP, JPG or SVG, up to 5 MB. A transparent background looks best. To give each state its own
picture, select up to three files at once whose names contain **idle**, **thinking** and **done**
(for example `frog-idle.gif`, `frog-thinking.gif`, `frog-done.gif`); states without their own
picture use the idle one. AskBar copies the files into `%APPDATA%\AskBar\mascot`, so moving or
deleting the originals doesn't break your mascot. They are only shown on your screen and never
uploaded anywhere. Use pictures you have the right to use.

**Adding a built-in character (contributors).** Draw a 96×96 SVG and add it to
`src/renderer/mascot.html` with `class="art art-<id>"`. Reuse the shared class names
(`figure`, `eyes`/`eye`, `happy-eyes`, `mouth-idle`, `mouth-thinking`, `mouth-done`,
`mouth-surprised`, optional `tongue`) and the shared state animations in `mascot.css` work
automatically; add its colours and any special moves under `.art-<id>`. Then list it in
`src/config/mascots.js` and in `CHARACTERS` in `src/renderer/mascot.js`.

The built-in mascots are original artwork made for this project and are covered by the same
AGPL-3.0 licence.

### Moving the bar

Hold the left button on the bar's **AI badge**, its empty edges or the footer, and drag it
anywhere. In bar-only mode the spot is remembered and the bar reopens there (in the lower half of
the screen it grows upwards). In mascot mode the bar always opens next to the mascot. **Reset
positions** in the tray menu puts both back to their defaults.

### Clipboard rewrite

Copy some text, press **Ctrl+Shift+J**, wait for the "Rewritten text copied" notification, then
press **Ctrl+V**. The default instruction fixes grammar and clarity in the original language; you
can change it in Settings (for example "Translate to French" or "Make this more formal"). If you
copy something else while it's working, AskBar leaves your clipboard alone.

### Redact mode

When on, AskBar masks obvious personal data on your PC **before** anything is sent:

| Pattern | Example | Sent as |
|---|---|---|
| Email addresses | `jane@corp.com` | `[EMAIL_1]` |
| IBAN-like strings | `AL47 2121 1009 0000 0002 3569 8741` | `[IBAN_1]` |
| Numbers with 9+ digits (cards, phones, accounts, IDs) | `4111 1111 1111 1111` | `[NUMBER_1]` |

The model is told to keep the placeholders as they are, and AskBar puts the real values back into
the answer on your screen (and into rewritten clipboard text). So you can ask "write a reply to
jane@corp.com" and the provider never sees the address. A note under each answer says how many
values were masked.

Redact mode applies to **text only**: screenshots are sent as they are, and the screenshot chip
says so when redact mode is on.

## Privacy guarantees

**Network.** AskBar has no server. The only requests it makes are to the API of the provider
you selected:

| Provider | Endpoint |
|---|---|
| Claude | `https://api.anthropic.com/v1/messages` |
| OpenAI | `https://api.openai.com/v1/chat/completions` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/models/<model>:streamGenerateContent` |

No telemetry, analytics, crash reports, auto-update, remote fonts or CDNs. The launcher page runs
sandboxed with a Content Security Policy of `connect-src 'none'`, so it cannot make requests; all
API calls are made by the main process (`src/main/ai.js`) through Chromium's network stack, which
respects your Windows proxy settings. Spellcheck is disabled, which also stops Chromium from
downloading dictionaries. When the bar opens, AskBar asks Windows to resolve the proxy for your
provider's address, so the first answer isn't delayed by proxy auto-detection; nothing is sent to
the provider by that.

Links only open when you click them (links in answers, or "Get a key" in Settings), and they open
in your own browser.

**Screenshots** are captured only when you press the hotkey or click an eye button. They exist
**only in memory**: never written to disk, never cached, never logged, and only ever sent inside
the request to the provider you chose. They are dropped when you start a new chat, when an idle
chat is reset, or when AskBar quits. See `src/main/capture.js`.

**API keys** are encrypted with Windows DPAPI (Electron `safeStorage`), so only your Windows
account on this PC can decrypt them. They are stored in `%APPDATA%\AskBar\settings.json` and used
only in the main process; the launcher page never sees them. If Windows encryption isn't
available, the key is stored unencrypted in that same per-user file, and Settings tells you so.

**Conversations** live in memory only and are never saved.

**Your own mascot images** are copied to `%APPDATA%\AskBar\mascot` and only displayed locally.

**Clipboard** is read only when you press the clipboard-rewrite hotkey.

What the provider receives: your question, the earlier turns of the current chat, the screenshot
if you attached one, and the system prompt. With redact mode on, detected values are replaced by
placeholders. The provider's own data policy applies to what you send.

## Building

On Windows:

```bash
npm install
npm run dist             # installer + portable
npm run dist:installer   # NSIS installer only
npm run dist:portable    # portable .exe only
```

Output goes to `dist/`:

- `AskBar-Setup-<version>.exe`: NSIS installer (per-user, folder can be changed)
- `AskBar-Portable-<version>.exe`: portable single executable
- `win-unpacked/`: the unpacked app, handy for testing

Code signing is not configured. To sign, set `CSC_LINK` and `CSC_KEY_PASSWORD` (see the
electron-builder docs). Icons are generated by `npm run icons` (`scripts/make-icons.mjs`) into
`assets/` and `build/`.

To rename the app, change `name`, `productName` and `build.appId` in `package.json`, then search
the source for `AskBar`.

## Project structure

```
src/
  main/               Electron main process
    main.js           app lifecycle, single instance, wiring, mode, login item, notifications
    window.js         the launcher window: frameless, transparent, always on top
    mascot.js         the optional mascot window: drag, states, character, position memory
    mascot-custom.js  your own mascot images: file picker, local copies, loading
    mascot-files.js   which picture goes with which state (unit tested)
    layout.js         placement geometry (bar next to mascot, remembered spots; unit tested)
    hotkeys.js        global shortcuts
    ipc.js            IPC handlers (validated, only from our window)
    ai.js             chat and clipboard requests via net.fetch, redaction, proxy warm-up
    capture.js        in-memory screenshot of the active display
    clipboard.js      clipboard rewrite action
    settings.js       electron-store settings + safeStorage-encrypted API keys
    tray.js           tray icon and menu
  preload/
    preload.cjs       the small API exposed to the launcher page (contextBridge)
    mascot-preload.cjs  the even smaller API for the mascot page
  renderer/           the pages (sandboxed, no Node)
    index.html, styles.css
    renderer.js       chat, screenshot chip, screen hint, settings form
    markdown.js       minimal Markdown renderer that escapes all HTML
    screen-hint.js    detects questions about the screen (for the hint only)
    mascot.html, mascot.css, mascot.js   the mascots (Mochi, Bolt, Boo, your own image) and their states
  api/                provider-independent logic (no Electron imports; unit tested)
    ask.js            askAI(): the single entry point, text or text + image, streaming
    providers.js      per-provider request builders and stream parsers
    sse.js            Server-Sent Events reader
    conversation.js   history trimming, screenshot handling, redaction across turns
    redact.js         redact mode: mask and restore
  config/
    providers.js      provider list, default models, key links
    mascots.js        mascot list and custom-image limits
    defaults.js       default settings, hotkeys, limits, prompts
test/                 node:test unit tests (npm test)
scripts/make-icons.mjs
```

Security defaults: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a
strict CSP, navigation and new windows blocked, only `http(s)` links opened externally, and IPC
messages accepted only from the launcher window, with payloads validated.

## Known limitations

- **Windows only.** The code is mostly cross-platform Electron, but only Windows is built and
  tested.
- **Ctrl+Space may already be taken**, for example by input-method switching on Chinese or
  Japanese keyboard layouts. AskBar shows a notification if a shortcut can't be registered;
  pick another one in Settings (AskBar's own shortcuts pause while you record a new one).
- **Unsigned builds** trigger SmartScreen, and some managed PCs block unsigned executables even
  in the portable form.
- **Screen capture** uses the display under the mouse pointer. Protected content (DRM video,
  some apps that opt out of capture) comes out black.
- **Mascot window** is a 96 px square: its transparent corners still catch clicks. Dragging the
  mascot or the bar between monitors with different scaling can make it jump slightly before it
  settles.
- **The screen hint** recognises common phrasings in English, French and Albanian only.
- **Redact mode is pattern-based.** It catches obvious emails, IBAN-like strings and 9+ digit
  numbers. It misses names, addresses and short numbers, may mask some product codes, and doesn't
  touch screenshots.
- **No history.** Chats are memory-only by design: Ctrl+N, 5 idle minutes, or quitting clears
  them.
- **Answer length.** Claude answers are capped at 4,096 output tokens; OpenAI and Gemini use
  their defaults. A note appears if an answer was cut off.
- **Model names change.** If you get "Model not found", pick a current model in Settings.
- **Minimal Markdown.** No syntax highlighting, images or math.
- **Clipboard rewrite** works on copied text only. It doesn't read your selection, so press
  Ctrl+C first.
- **Start on login** only works in the built app, not with `npm start`.
- **Electron** keeps the app simple to build and package (screen capture, global shortcuts, tray,
  installers), at the cost of size (~100 MB). A future lean rewrite could use Tauri/Rust.
