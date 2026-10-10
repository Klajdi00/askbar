// Detects questions that are about the screen ("what am I looking at",
// "see my screen") so the bar can suggest attaching a screenshot. It only
// shows a hint; capturing always needs the button or the hotkey.
(function () {
  'use strict';

  const PATTERNS = [
    // English
    /\b(?:my|the|this|on|at)\s+screens?\b/i,
    /\bmy\s+(?:display|monitor|desktop)\b/i,
    /\bscreen\s?shots?\b/i,
    /\bwhat\s+(?:am\s+i|i'?m)\s+(?:looking\s+at|seeing|viewing)\b/i,
    /\b(?:see|look\s+at|check|read)\s+(?:my|this|the)\s+(?:screen|display|window|desktop)\b/i,
    // French: écran, "ce que je vois"
    /(?:^|[^a-zà-ÿ])[ée]crans?(?![a-zà-ÿ])/i,
    /\bce\s+que\s+je\s+vois\b/i,
    // Albanian: ekran, ekrani, ekranin, ekranit…
    /\bekran/i,
  ];

  globalThis.looksLikeScreenQuestion = (text) => {
    const t = String(text || '');
    return t.trim().length > 0 && PATTERNS.some((re) => re.test(t));
  };
})();
