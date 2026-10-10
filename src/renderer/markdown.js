// Minimal, safe Markdown renderer for AI answers.
//
// The input is never trusted: every piece of text is HTML-escaped, and only a
// small set of constructs becomes markup (paragraphs, headings, lists, code,
// quotes, tables, emphasis, links). Links are http(s) only and are opened in
// the default browser by renderer.js, never inside the app.
(function () {
  'use strict';

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

  const LIST_RE = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
  const FENCE_RE = /^[ \t]*(`{3,}|~{3,})[ \t]*([\w#+.-]*)/;
  const HEADING_RE = /^[ \t]{0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
  const HR_RE = /^[ \t]{0,3}([-*_])([ \t]*\1){2,}[ \t]*$/;
  const QUOTE_RE = /^[ \t]{0,3}>/;
  const TABLE_SEP_RE = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

  function expandTabs(ws) {
    return ws.replace(/\t/g, '    ');
  }

  function indentOf(line) {
    return expandTabs(line.match(/^[ \t]*/)[0]).length;
  }

  function dedent(line, n) {
    const expanded = line.replace(/^[ \t]+/, expandTabs);
    return expanded.slice(Math.min(n, indentOf(expanded)));
  }

  function link(url, labelHtml) {
    const u = esc(url);
    return `<a href="${u}" data-href="${u}" title="${u}">${labelHtml}</a>`;
  }

  /** Inline formatting. Code spans and links are set aside first so emphasis can't break them. */
  function inline(text) {
    const tokens = [];
    const stash = (html) => `\u0000${tokens.push(html) - 1}\u0000`;

    let s = text;
    s = s.replace(/`([^`\n]+)`/g, (_m, code) => stash(`<code>${esc(code)}</code>`));
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => stash(link(url, esc(label))));
    s = s.replace(/\bhttps?:\/\/[^\s<>()\u0000]*[^\s<>().,;:!?'"*_\u0000]/g, (url) => stash(link(url, esc(url))));

    s = esc(s);
    s = s.replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__(?=\S)([^_\n]*?\S)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?![*\w])/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_\w])_(?=\S)([^_\n]*?\S)_(?![_\w])/g, '$1<em>$2</em>');
    s = s.replace(/~~(?=\S)([^~\n]*?\S)~~/g, '<del>$1</del>');

    return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => tokens[Number(i)]);
  }

  function isTableStart(lines, i) {
    return lines[i].includes('|') && i + 1 < lines.length && lines[i + 1].includes('|') && TABLE_SEP_RE.test(lines[i + 1]);
  }

  function startsBlock(lines, i) {
    const line = lines[i];
    return (
      FENCE_RE.test(line) ||
      HEADING_RE.test(line) ||
      HR_RE.test(line) ||
      QUOTE_RE.test(line) ||
      LIST_RE.test(line) ||
      isTableStart(lines, i)
    );
  }

  function splitRow(row) {
    return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  }

  function parseList(lines, start) {
    const first = lines[start].match(LIST_RE);
    const baseIndent = indentOf(first[1]);
    const ordered = /\d/.test(first[2]);
    const startNumber = ordered ? parseInt(first[2], 10) : 1;
    const isSibling = (m) => m && indentOf(m[1]) <= baseIndent + 1 && /\d/.test(m[2]) === ordered;

    const items = [];
    let i = start;
    while (i < lines.length) {
      const line = lines[i];
      const m = line.match(LIST_RE);
      if (m && indentOf(m[1]) <= baseIndent + 1) {
        if (!isSibling(m)) break; // switched between - and 1.: a new list
        items.push([m[3]]);
        i++;
      } else if (!line.trim()) {
        // Blank lines stay inside the list only if the list continues after them.
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j < lines.length && (isSibling(lines[j].match(LIST_RE)) || indentOf(lines[j]) > baseIndent)) {
          for (let k = i; k < j; k++) items[items.length - 1].push('');
          i = j;
        } else break;
      } else if (indentOf(line) > baseIndent) {
        items[items.length - 1].push(line); // continuation, nested list or code inside the item
        i++;
      } else break;
    }

    const tag = ordered ? 'ol' : 'ul';
    const startAttr = ordered && startNumber !== 1 ? ` start="${startNumber}"` : '';
    const body = items.map((itemLines) => `<li>${renderItem(itemLines)}</li>`).join('');
    return { html: `<${tag}${startAttr}>${body}</${tag}>`, next: i };
  }

  function renderItem([firstLine, ...rest]) {
    const nonBlank = rest.filter((l) => l.trim());
    const minIndent = nonBlank.length ? Math.min(...nonBlank.map(indentOf)) : 0;
    const html = render([firstLine, ...rest.map((l) => dedent(l, minIndent))].join('\n'));
    return html.replace(/^<p>([\s\S]*?)<\/p>/, '$1'); // tight lists: no paragraph margin on the first line
  }

  /** Markdown string -> safe HTML string. */
  function render(markdown) {
    const lines = String(markdown || '')
      .replace(/\u0000/g, '')
      .replace(/\r\n?/g, '\n')
      .split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (!line.trim()) {
        i++;
        continue;
      }

      // Fenced code. While an answer streams in, an unclosed fence still renders as code.
      const fence = line.match(FENCE_RE);
      if (fence) {
        const marker = fence[1];
        const code = [];
        i++;
        while (i < lines.length) {
          const t = lines[i].trim();
          if (t.startsWith(marker[0].repeat(marker.length)) && /^[`~]+$/.test(t)) break;
          code.push(lines[i]);
          i++;
        }
        i++;
        const lang = fence[2] ? ` data-lang="${esc(fence[2])}"` : '';
        out.push(`<pre${lang}><code>${esc(code.join('\n'))}</code></pre>`);
        continue;
      }

      const heading = line.match(HEADING_RE);
      if (heading) {
        const level = Math.min(heading[1].length + 2, 6); // # -> h3: answers stay compact
        out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        i++;
        continue;
      }

      if (HR_RE.test(line)) {
        out.push('<hr>');
        i++;
        continue;
      }

      if (QUOTE_RE.test(line)) {
        const quote = [];
        while (i < lines.length && QUOTE_RE.test(lines[i])) {
          quote.push(lines[i].replace(/^[ \t]{0,3}>[ \t]?/, ''));
          i++;
        }
        out.push(`<blockquote>${render(quote.join('\n'))}</blockquote>`);
        continue;
      }

      if (isTableStart(lines, i)) {
        const header = splitRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
          rows.push(splitRow(lines[i]));
          i++;
        }
        const head = header.map((c) => `<th>${inline(c)}</th>`).join('');
        const body = rows
          .map((r) => `<tr>${header.map((_c, j) => `<td>${inline(r[j] ?? '')}</td>`).join('')}</tr>`)
          .join('');
        out.push(`<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`);
        continue;
      }

      if (LIST_RE.test(line)) {
        const { html, next } = parseList(lines, i);
        out.push(html);
        i = next;
        continue;
      }

      const para = [line.trim()];
      i++;
      while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) {
        para.push(lines[i].trim());
        i++;
      }
      out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    }

    return out.join('');
  }

  globalThis.renderMarkdown = render;
})();
