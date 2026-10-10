// Provider catalogue: labels, default models and where users get a key.
// Request building and stream parsing live in src/api/providers.js.

export const PROVIDERS = {
  claude: {
    id: 'claude',
    label: 'Claude (Anthropic)',
    shortLabel: 'Claude',
    apiOrigin: 'https://api.anthropic.com',
    defaultModel: 'claude-opus-5-5',
    // Suggestions only: the model field accepts any model id the API knows.
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
    keyHint: 'sk-ant-…',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    shortLabel: 'OpenAI',
    apiOrigin: 'https://api.openai.com',
    defaultModel: 'gpt-5.5',
    models: ['gpt-5.5', 'gpt-4.1', 'gpt-4o'],
    keyHint: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    shortLabel: 'Gemini',
    apiOrigin: 'https://generativelanguage.googleapis.com',
    // Google's moving alias for the current Flash model.
    defaultModel: 'gemini-flash-latest',
    models: ['gemini-flash-latest', 'gemini-3.6-flash'],
    keyHint: 'AIza…',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);
