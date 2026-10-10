import { PROVIDERS } from './providers.js';

// Everything the user can change in Settings. API keys are stored separately
// (encrypted) by src/main/settings.js and never appear in this object.
export const DEFAULT_SETTINGS = {
  provider: 'claude',
  models: Object.fromEntries(Object.values(PROVIDERS).map((p) => [p.id, p.defaultModel])),
  hotkeys: {
    toggle: 'Control+Space',
    screen: 'Control+Shift+S',
    clipboard: 'Control+Shift+J',
  },
  mode: 'bar', // 'bar' (bar only) or 'mascot' (opt-in helper character)
  redact: false,
  hideOnBlur: true,
  startOnLogin: false,
  clipboardInstruction:
    'Rewrite the text below so it is clear, correct and natural. Keep the original language, meaning and tone.',
};

export const HOTKEY_LABELS = {
  toggle: 'Open / close the launcher',
  screen: 'Ask about the screen',
  clipboard: 'Rewrite clipboard text',
};

export const LIMITS = {
  maxTokens: 4096, // Claude requires an explicit cap; the others use their defaults
  maxHistoryMessages: 20, // older turns are dropped when sending
  maxMessageChars: 100_000,
  maxClipboardChars: 20_000,
  screenshotMaxWidth: 1600,
  screenshotJpegQuality: 70,
};

export const PROMPTS = {
  chat:
    'You are a helpful assistant inside a desktop quick-ask launcher. Answer directly and concisely. ' +
    'Use Markdown sparingly: short lists, and fenced code blocks for code. ' +
    'If a screenshot is attached, it shows the user\'s current screen; use it to answer.',
  clipboard:
    'You transform text for the user. Follow the instruction exactly. ' +
    'Reply with the transformed text only: no preamble, no explanations, no quotes, no code fences.',
  redaction:
    'Some values in the user\'s messages were replaced with placeholders such as [EMAIL_1], [IBAN_1] or [NUMBER_1] ' +
    'before sending. When you refer to one of those values, write its placeholder exactly as it appears.',
  // Used when the user asks about a screenshot without typing a question.
  defaultScreenQuestion:
    'Look at my screen and help with what I am working on: briefly explain what is shown and suggest the next step.',
};
