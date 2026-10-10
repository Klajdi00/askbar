// AskBar launcher page. It runs sandboxed: everything privileged (AI calls,
// screenshots, settings, clipboard) goes through window.askbar, defined in
// src/preload/preload.cjs. Conversations live in memory only.
(() => {
  'use strict';

  const api = window.askbar;
  const $ = (id) => document.getElementById(id);

  const el = {
    card: $('card'),
    prompt: $('prompt'),
    btnScreen: $('btn-screen'),
    btnSettings: $('btn-settings'),
    attachment: $('attachment'),
    shotThumb: $('shot-thumb'),
    shotLabel: $('shot-label'),
    shotRemove: $('shot-remove'),
    shotWarning: $('shot-warning'),
    screenHint: $('screen-hint'),
    chat: $('chat'),
    settings: $('settings'),
    footer: $('footer'),
    status: $('status'),
    setMode: $('set-mode'),
    setMascot: $('set-mascot'),
    customRow: $('custom-row'),
    customPreview: $('custom-preview'),
    customNames: $('custom-names'),
    customChoose: $('custom-choose'),
    customHelp: $('custom-help'),
    setProvider: $('set-provider'),
    setModel: $('set-model'),
    modelList: $('model-list'),
    setKey: $('set-key'),
    keyRemove: $('key-remove'),
    keyStatus: $('key-status'),
    keyGet: $('key-get'),
    setRedact: $('set-redact'),
    setBlur: $('set-blur'),
    setLogin: $('set-login'),
    loginHint: $('login-hint'),
    hotkeys: $('hotkeys'),
    setInstruction: $('set-instruction'),
    settingsNotice: $('settings-notice'),
    settingsErrors: $('settings-errors'),
    setCancel: $('set-cancel'),
    setSave: $('set-save'),
    appVersion: $('app-version'),
    privacyLine: $('privacy-line'),
  };

  // Reopening the launcher after this much idle time starts a fresh chat.
  const IDLE_RESET_MS = 5 * 60 * 1000;

  const state = {
    app: null, // public state from the main process: settings, which keys exist, provider list…
    view: 'chat', // 'chat' | 'settings'
    turns: [], // { id, question, image, answer, status, error, code, redacted, truncated, stopped, dom }
    pendingImage: null, // screenshot waiting to be sent: { mime, base64, width, height, bytes }
    streaming: null, // the turn currently streaming
    lastActivity: Date.now(),
    draft: null, // settings form state while the settings view is open
  };

  // ---------------------------------------------------------------- chat

  async function send() {
    const text = el.prompt.value.trim();
    const image = state.pendingImage;
    if (!text && !image) return;
    if (state.view !== 'chat') closeSettings();

    const provider = state.app.settings.provider;
    if (!state.app.hasKey[provider]) {
      openSettings(`Add your ${state.app.providers[provider].shortLabel} API key to start.`);
      return;
    }

    cancelStreaming();
    const turn = { id: newId(), question: text, image, answer: '', status: 'streaming' };
    const messages = buildMessages(turn);
    state.turns.push(turn);
    state.streaming = turn;
    state.pendingImage = null;
    state.lastActivity = Date.now();
    el.prompt.value = '';
    autoGrow();
    renderTurn(turn);
    updateChrome();
    scrollToBottom();

    const res = await api.ask(turn.id, messages);
    if (turn.stopped) return; // replaced by a newer question or a new chat
    if (state.streaming === turn) state.streaming = null;
    state.lastActivity = Date.now();

    if (res.ok) {
      Object.assign(turn, { answer: res.text, truncated: res.truncated, redacted: res.redacted, status: 'done' });
    } else if (res.code === 'CANCELLED') {
      turn.status = turn.answer ? 'done' : 'cancelled';
    } else {
      Object.assign(turn, { status: 'error', error: res.error, code: res.code, httpStatus: res.status });
    }
    renderTurn(turn);
    updateChrome();
  }

  /** History for the API: finished turns plus the new question. */
  function buildMessages(newTurn) {
    const messages = [];
    for (const t of state.turns) {
      if (t.status !== 'done' || !t.answer) continue;
      messages.push({ role: 'user', text: t.question, ...(t.image ? { image: t.image } : {}) });
      messages.push({ role: 'assistant', text: t.answer });
    }
    messages.push({ role: 'user', text: newTurn.question, ...(newTurn.image ? { image: newTurn.image } : {}) });
    return messages;
  }

  function cancelStreaming() {
    const t = state.streaming;
    if (!t) return;
    api.cancel(t.id);
    t.stopped = true;
    t.status = t.answer ? 'done' : 'cancelled';
    state.streaming = null;
    renderTurn(t);
  }

  function newChat() {
    cancelStreaming();
    state.turns = [];
    state.pendingImage = null;
    el.chat.replaceChildren();
    updateChrome();
  }

  function attachImage(image) {
    state.pendingImage = image;
    if (state.view === 'settings') closeSettings();
    updateChrome();
  }

  /** Shows an error in the chat area that is not part of the conversation. */
  function showLocalError(title, message) {
    const turn = { id: newId(), question: title, answer: '', status: 'error', error: message, local: true };
    state.turns.push(turn);
    renderTurn(turn);
    updateChrome();
  }

  // ------------------------------------------------------------- rendering

  let renderQueued = 0;
  function scheduleRender(turn) {
    if (renderQueued) return;
    renderQueued = requestAnimationFrame(() => {
      renderQueued = 0;
      renderTurn(turn);
    });
  }

  function renderTurn(turn) {
    if (!turn.dom) {
      const root = div('turn');
      const question = div('question');
      if (turn.image) {
        const img = document.createElement('img');
        img.src = dataUrl(turn.image);
        img.alt = 'Screenshot';
        question.append(img);
      }
      const q = document.createElement('span');
      if (turn.question) q.textContent = turn.question;
      else {
        q.textContent = 'About this screenshot';
        q.className = 'implicit';
      }
      question.append(q);
      const answer = div('answer');
      const meta = div('meta');
      root.append(question, answer, meta);
      el.chat.append(root);
      turn.dom = { answer, meta };
    }

    const stick = isNearBottom();
    const { answer, meta } = turn.dom;

    if (turn.status === 'streaming' && !turn.answer) {
      answer.innerHTML = '<div class="thinking"><span></span><span></span><span></span></div>';
    } else if (turn.status === 'cancelled') {
      answer.innerHTML = '<span class="hint">Stopped.</span>';
    } else {
      // renderMarkdown escapes all text; see markdown.js
      answer.innerHTML = window.renderMarkdown(turn.answer);
    }

    if (turn.status === 'error') {
      const box = div('error');
      box.textContent = turn.error || 'Something went wrong.';
      if (turn.code === 'NO_KEY' || turn.code === 'CONFIG' || [400, 401, 403, 404].includes(turn.httpStatus)) {
        box.append(button('Open settings', 'ghost', () => openSettings()));
      }
      answer.append(box);
    }

    if (turn.status === 'done') {
      for (const pre of answer.querySelectorAll('pre')) {
        pre.append(button('Copy', 'copy-code', (e) => copyText(pre.querySelector('code').textContent, e.target)));
      }
    }

    meta.replaceChildren();
    if (turn.status === 'done' && turn.answer) {
      meta.append(button('Copy answer', '', (e) => copyText(turn.answer, e.target)));
    }
    if (turn.redacted) meta.append(span(`${turn.redacted} value${turn.redacted === 1 ? '' : 's'} redacted before sending`));
    if (turn.truncated) meta.append(span('Cut off at the length limit'));
    if (turn.stopped && turn.answer) meta.append(span('Stopped'));
    meta.hidden = meta.childElementCount === 0;

    if (stick) scrollToBottom();
  }

  function renderWelcome(show) {
    let welcome = $('welcome');
    if (!show) return welcome?.remove();
    if (welcome) return;
    welcome = div('welcome');
    welcome.id = 'welcome';
    welcome.innerHTML =
      '<p><strong>Welcome to AskBar.</strong> Add a Claude, OpenAI or Gemini API key to start. ' +
      'It stays on this PC.</p>';
    welcome.append(button('Open settings', 'ghost', () => openSettings()));
    el.chat.prepend(welcome);
  }

  /** Everything around the conversation: which sections show, placeholder, chip, footer. */
  function updateChrome() {
    const s = state.app?.settings;
    if (!s) return;
    const provider = state.app.providers[s.provider];
    const chatView = state.view === 'chat';
    const needsKey = !state.app.hasKey[s.provider];

    el.prompt.placeholder = state.pendingImage
      ? 'Ask about this screenshot, or press Enter'
      : `Ask ${provider.shortLabel} anything…`;
    el.btnScreen.title = `Look at screen (${pretty(s.hotkeys.screen) || 'no shortcut'}): attach a screenshot to your next question`;
    updateScreenHint();

    const img = state.pendingImage;
    el.attachment.hidden = !(chatView && img);
    if (img) {
      const src = dataUrl(img);
      if (el.shotThumb.src !== src) el.shotThumb.src = src;
      el.shotLabel.textContent = `Screenshot · ${img.width}×${img.height} · ${Math.round(img.bytes / 1024)} KB`;
      el.shotWarning.hidden = !s.redact;
    } else {
      el.shotThumb.removeAttribute('src');
    }

    renderWelcome(needsKey && state.turns.length === 0);
    el.chat.hidden = !chatView || (state.turns.length === 0 && !needsKey);
    el.settings.hidden = chatView;
    el.footer.hidden = !chatView || state.turns.length === 0;

    el.status.textContent = `${provider.shortLabel} · ${s.models[s.provider]}`;
    if (s.redact) el.status.append(span('Redact on', 'pill'));
  }

  /**
   * One-line hint when the typed question is about the screen but nothing is
   * attached. Only a hint: capturing always needs the button or the hotkey.
   */
  function updateScreenHint() {
    const s = state.app?.settings;
    const show =
      Boolean(s) &&
      state.view === 'chat' &&
      !state.pendingImage &&
      window.looksLikeScreenQuestion(el.prompt.value);
    el.screenHint.hidden = !show;
    if (show) {
      const key = pretty(s.hotkeys.screen);
      el.screenHint.textContent = key
        ? `Press the screen button or ${key} so I can see it.`
        : 'Press the screen button so I can see it.';
    }
  }

  // -------------------------------------------------------------- settings

  function openSettings(notice) {
    const s = state.app.settings;
    state.view = 'settings';
    state.draft = { provider: s.provider, models: { ...s.models }, keys: {}, hotkeys: { ...s.hotkeys } };

    el.setMode.value = s.mode;
    el.setMascot.replaceChildren(...state.app.mascots.map((m) => new Option(m.label, m.id)));
    el.setMascot.value = s.mascot;
    el.setMascot.dataset.previous = s.mascot;
    el.customPreview.removeAttribute('src');
    if (state.app.customMascot) {
      api.getCustomMascotPreview().then((url) => {
        if (url) el.customPreview.src = url;
      });
    }
    fillCustomMascot();
    el.setProvider.replaceChildren(...Object.values(state.app.providers).map((p) => new Option(p.label, p.id)));
    el.setProvider.value = s.provider;
    fillProviderFields();

    el.setRedact.checked = s.redact;
    el.setBlur.checked = s.hideOnBlur;
    el.setLogin.checked = s.startOnLogin;
    el.loginHint.textContent = state.app.isPackaged ? '' : '(only in the built app, not with npm start)';
    el.setInstruction.value = s.clipboardInstruction;
    renderHotkeyInputs();

    el.settingsNotice.hidden = !notice;
    el.settingsNotice.textContent = notice || '';
    showErrors(
      state.app.hotkeyErrors.map((f) => `${pretty(f.accelerator)} (${state.app.hotkeyLabels[f.name]}): ${f.reason}.`)
    );
    el.appVersion.textContent = `v${state.app.version}`;
    el.privacyLine.textContent = state.app.encryptionAvailable
      ? 'Keys are encrypted by Windows and never leave this PC except to their provider.'
      : 'Keys are stored on this PC only (OS encryption is not available).';

    updateChrome();
    (state.app.hasKey[s.provider] ? el.setProvider : el.setKey).focus();
  }

  function closeSettings() {
    state.view = 'chat';
    state.draft = null;
    el.setKey.value = '';
    updateChrome();
    el.prompt.focus();
  }

  function fillProviderFields() {
    const id = state.draft.provider;
    const p = state.app.providers[id];
    el.setModel.value = state.draft.models[id];
    el.modelList.replaceChildren(...p.models.map((m) => new Option(m, m)));

    const draftKey = state.draft.keys[id];
    el.setKey.value = typeof draftKey === 'string' ? draftKey : '';
    el.setKey.placeholder = `Paste your ${p.shortLabel} key (${p.keyHint})`;

    const saved = state.app.hasKey[id];
    const removing = draftKey === null;
    el.keyStatus.textContent = removing
      ? 'The saved key will be removed when you save.'
      : saved
        ? 'A key is saved. Paste a new one to replace it.'
        : 'No key saved yet.';
    el.keyRemove.hidden = !saved || removing;
  }

  /** Settings → Mascot: the custom-image row shows only for "Your own image…". */
  function fillCustomMascot() {
    const isCustom = el.setMascot.value === 'custom';
    const info = state.app.customMascot;
    el.customRow.hidden = !isCustom;
    el.customHelp.hidden = !isCustom;
    if (!info) {
      el.customNames.textContent = 'No image chosen yet';
    } else {
      const extra = ['thinking', 'done'].filter((k) => info[k]).map((k) => `${k}: ${info[k]}`);
      el.customNames.textContent = [info.idle, ...extra].join(' · ');
    }
  }

  async function chooseCustomMascot() {
    const res = await api.chooseCustomMascot();
    if (res.ok) {
      state.app.customMascot = res.info;
      if (res.preview) el.customPreview.src = res.preview;
      el.setMascot.value = 'custom';
      showErrors([]);
    } else if (res.error) {
      showErrors([res.error]);
    }
    fillCustomMascot();
    return res.ok;
  }

  async function saveSettings() {
    const d = state.draft;
    const keys = Object.fromEntries(Object.entries(d.keys).filter(([, v]) => v === null || (v && v.trim())));
    const res = await api.saveSettings({
      mode: el.setMode.value,
      mascot: el.setMascot.value,
      provider: d.provider,
      models: d.models,
      keys,
      hotkeys: d.hotkeys,
      redact: el.setRedact.checked,
      hideOnBlur: el.setBlur.checked,
      startOnLogin: el.setLogin.checked,
      clipboardInstruction: el.setInstruction.value,
    });
    state.app = res.state || state.app;
    if (res.ok) {
      closeSettings();
    } else {
      openSettings(); // reload the form from what was actually saved
      showErrors(res.errors);
    }
  }

  function showErrors(errors) {
    el.settingsErrors.hidden = !errors.length;
    el.settingsErrors.textContent = errors.join('\n');
  }

  // Hotkey boxes record a key combination instead of accepting typed text.
  const CODE_KEYS = {
    Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
    Comma: ',', Period: '.', Slash: '/', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left',
    ArrowRight: 'Right', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    Insert: 'Insert', Delete: 'Delete',
  };

  function keyFromCode(code) {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^F\d{1,2}$/.test(code)) return code;
    if (/^Numpad\d$/.test(code)) return `num${code.slice(6)}`;
    return CODE_KEYS[code] || null;
  }

  function renderHotkeyInputs() {
    el.hotkeys.replaceChildren();
    for (const [name, label] of Object.entries(state.app.hotkeyLabels)) {
      const input = document.createElement('input');
      input.readOnly = true;
      input.value = pretty(state.draft.hotkeys[name]) || 'None';
      input.addEventListener('focus', () => input.classList.add('recording'));
      input.addEventListener('blur', () => {
        input.classList.remove('recording');
        input.value = pretty(state.draft.hotkeys[name]) || 'None';
      });
      input.addEventListener('keydown', (e) => recordHotkey(e, input, name));
      el.hotkeys.append(span(label), input);
    }
  }

  function recordHotkey(e, input, name) {
    if (e.key === 'Tab') return; // keep keyboard navigation
    e.preventDefault();
    e.stopPropagation(); // Esc here must not close the launcher
    if (e.key === 'Escape') return input.blur();

    const mods = [];
    if (e.ctrlKey) mods.push('Control');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (e.metaKey) mods.push('Super');

    if ((e.key === 'Backspace' || e.key === 'Delete') && mods.length === 0) {
      state.draft.hotkeys[name] = '';
      input.value = 'None';
      return;
    }
    const key = keyFromCode(e.code);
    if (!key) {
      input.value = mods.length ? `${pretty(mods.join('+'))}+…` : 'Press keys…';
      return;
    }
    if (!mods.some((m) => m !== 'Shift') && !/^F\d+$/.test(key)) {
      input.value = 'Add Ctrl, Alt or Win';
      return;
    }
    const accelerator = [...mods, key].join('+');
    state.draft.hotkeys[name] = accelerator;
    input.value = pretty(accelerator);
  }

  // --------------------------------------------------------------- helpers

  function div(className) {
    const d = document.createElement('div');
    d.className = className;
    return d;
  }

  function span(text, className) {
    const s = document.createElement('span');
    s.textContent = text;
    if (className) s.className = className;
    return s;
  }

  function button(text, className, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    if (className) b.className = className;
    b.addEventListener('click', onClick);
    return b;
  }

  function copyText(text, buttonEl) {
    api.copy(text);
    if (!buttonEl) return;
    const original = buttonEl.textContent;
    buttonEl.textContent = 'Copied';
    setTimeout(() => (buttonEl.textContent = original), 1200);
  }

  function pretty(accelerator = '') {
    return accelerator.replace(/CommandOrControl|CmdOrCtrl|Control/g, 'Ctrl').replace(/Super|Meta/g, 'Win');
  }

  function dataUrl(image) {
    return `data:${image.mime};base64,${image.base64}`;
  }

  function newId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  }

  function isNearBottom() {
    return el.chat.scrollHeight - el.chat.scrollTop - el.chat.clientHeight < 48;
  }

  function scrollToBottom() {
    el.chat.scrollTop = el.chat.scrollHeight;
  }

  function autoGrow() {
    el.prompt.style.height = 'auto';
    el.prompt.style.height = `${Math.min(el.prompt.scrollHeight, 160)}px`;
  }

  /**
   * Moving the bar: press the left button on the badge, the bar's empty edges
   * or the footer and move. The main process then makes the window follow the
   * mouse until the button is released.
   */
  function enableDragging() {
    const DRAG_THRESHOLD = 4;
    let press = null;
    let dragging = false;

    const isHandle = (target) =>
      Boolean(target.closest('#bar, #footer')) && !target.closest('textarea, input, select, button, a');

    const finish = () => {
      if (dragging) {
        api.dragEnd();
        if (state.view === 'chat') el.prompt.focus();
      }
      press = null;
      dragging = false;
      document.body.classList.remove('dragging');
    };

    el.card.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !isHandle(e.target)) return;
      e.preventDefault(); // keep focus in the input
      press = { x: e.screenX, y: e.screenY, offsetX: e.clientX, offsetY: e.clientY };
      el.card.setPointerCapture(e.pointerId);
    });

    el.card.addEventListener('pointermove', (e) => {
      if (!press || dragging) return;
      if (Math.hypot(e.screenX - press.x, e.screenY - press.y) > DRAG_THRESHOLD) {
        dragging = true;
        document.body.classList.add('dragging');
        api.dragStart(press.offsetX, press.offsetY);
      }
    });

    el.card.addEventListener('pointerup', finish);
    el.card.addEventListener('lostpointercapture', finish);
  }

  /** Tells the main process how tall the window must be to fit the card. */
  function observeSize() {
    const report = () => {
      const body = getComputedStyle(document.body);
      const padding = parseFloat(body.paddingTop) + parseFloat(body.paddingBottom);
      api.resize(el.card.getBoundingClientRect().height + padding);
    };
    new ResizeObserver(report).observe(el.card);
    report();
  }

  // ---------------------------------------------------------------- events

  function bindEvents() {
    el.prompt.addEventListener('input', () => {
      autoGrow();
      updateScreenHint();
    });
    el.prompt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send();
      } else if (e.key === 'ArrowUp' && !el.prompt.value) {
        const last = [...state.turns].reverse().find((t) => t.question && !t.local);
        if (last) {
          e.preventDefault();
          el.prompt.value = last.question;
          autoGrow();
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (state.view === 'settings') closeSettings();
        else api.hide();
      } else if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        newChat();
        el.prompt.focus();
      } else if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        if (state.view === 'settings') closeSettings();
        else openSettings();
      }
    });

    // Links in answers open in the default browser (http/https only, checked again in main).
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      if (a.dataset.href) api.openExternal(a.dataset.href);
    });

    el.btnSettings.addEventListener('click', () => (state.view === 'settings' ? closeSettings() : openSettings()));

    // Same as the hotkey: the main process captures and sends 'screen:attached'.
    el.btnScreen.addEventListener('click', () => api.lookAtScreen());

    el.shotRemove.addEventListener('click', () => {
      state.pendingImage = null;
      updateChrome();
      el.prompt.focus();
    });

    // Settings form
    el.setMascot.addEventListener('change', async () => {
      // Picking "Your own image…" for the first time opens the file picker right away.
      if (el.setMascot.value === 'custom' && !state.app.customMascot) {
        const chosen = await chooseCustomMascot();
        if (!chosen) el.setMascot.value = el.setMascot.dataset.previous;
      }
      el.setMascot.dataset.previous = el.setMascot.value;
      fillCustomMascot();
    });
    el.customChoose.addEventListener('click', chooseCustomMascot);
    el.setProvider.addEventListener('change', () => {
      state.draft.provider = el.setProvider.value;
      fillProviderFields();
    });
    el.setModel.addEventListener('input', () => {
      state.draft.models[state.draft.provider] = el.setModel.value;
    });
    el.setKey.addEventListener('input', () => {
      state.draft.keys[state.draft.provider] = el.setKey.value;
    });
    el.keyRemove.addEventListener('click', () => {
      state.draft.keys[state.draft.provider] = null;
      fillProviderFields();
    });
    el.keyGet.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      api.openExternal(state.app.providers[state.draft.provider].keyUrl);
    });
    el.setCancel.addEventListener('click', closeSettings);
    el.setSave.addEventListener('click', saveSettings);
    el.settings.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.target.readOnly) {
        e.preventDefault();
        saveSettings();
      }
    });

    // Streaming
    api.onChunk(({ requestId, text }) => {
      const t = state.streaming;
      if (!t || t.id !== requestId) return;
      t.answer += text;
      state.lastActivity = Date.now();
      scheduleRender(t);
    });
    api.onMeta(({ requestId, redacted }) => {
      const t = state.turns.find((x) => x.id === requestId);
      if (!t) return;
      t.redacted = redacted;
      scheduleRender(t);
    });

    // Where the window is decides how tall it may grow and in which direction.
    const applyLayout = ({ maxHeight, growUp }) => {
      document.body.classList.toggle('grow-up', Boolean(growUp));
      if (maxHeight) {
        const body = getComputedStyle(document.body);
        const padding = parseFloat(body.paddingTop) + parseFloat(body.paddingBottom);
        document.documentElement.style.setProperty('--max-card', `${Math.floor(maxHeight - padding)}px`);
      }
    };

    // The user dragged the bar to a new spot.
    api.onLayout(applyLayout);

    // Window shown (hotkey, tray, mascot, second launch)
    api.onShown(({ maxHeight, view, notice, growUp } = {}) => {
      applyLayout({ maxHeight, growUp });
      if (!state.streaming && state.turns.length && Date.now() - state.lastActivity > IDLE_RESET_MS) newChat();

      if (view === 'settings') {
        openSettings(notice);
      } else {
        if (state.view === 'settings') closeSettings();
        el.prompt.focus();
        el.prompt.select(); // leftover text gets replaced as soon as you type
      }

      // Refresh in the background (keys may have changed from the tray flow).
      api.getState().then((s) => {
        state.app = s;
        updateChrome();
      });
    });

    // Screenshot from the hotkey, the eye buttons or a menu: attach it to the next question.
    api.onScreenshot(({ image }) => {
      attachImage(image);
      el.prompt.focus();
    });
    api.onScreenError((message) => showLocalError('Screenshot', message));
  }

  async function init() {
    state.app = await api.getState();
    bindEvents();
    enableDragging();
    updateChrome();
    observeSize();
    el.prompt.focus();
  }

  init();
})();
