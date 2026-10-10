import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// markdown.js is a classic browser script that sets globalThis.renderMarkdown.
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../src/renderer/markdown.js', import.meta.url), 'utf8'), context);
const md = context.renderMarkdown;

test('escapes raw HTML everywhere', () => {
  const out = md('<script>alert(1)</script> **<img src=x onerror=alert(1)>** `<b>`');
  assert.ok(!out.includes('<script>'));
  assert.ok(!out.includes('<img'));
  assert.ok(out.includes('&lt;script&gt;'));
  assert.ok(out.includes('<code>&lt;b&gt;</code>'));
});

test('only http(s) links become links', () => {
  const out = md('[ok](https://example.com/a_b_c) [bad](javascript:alert(1)) see https://x.dev/path.');
  assert.ok(out.includes('<a href="https://example.com/a_b_c" data-href="https://example.com/a_b_c"'));
  assert.ok(!out.includes('href="javascript'));
  assert.ok(out.includes('data-href="https://x.dev/path"'));
  assert.ok(out.includes('</a>.'));
});

test('attribute values cannot be broken out of', () => {
  const out = md('[x](https://e.com/"onmouseover="alert(1))');
  assert.ok(!/href="[^"]*"onmouseover/.test(out));
});

test('code fences, including an unclosed one while streaming', () => {
  assert.equal(md('```js\nconst a = 1 < 2;\n```'), '<pre data-lang="js"><code>const a = 1 &lt; 2;</code></pre>');
  assert.equal(md('```\npartial'), '<pre><code>partial</code></pre>');
});

test('lists, nesting and code inside list items', () => {
  const out = md('1. First\n2. Second\n   - nested *one*\n3. Third\n   ```\n   npm i\n   ```');
  assert.equal(
    out,
    '<ol><li>First</li><li>Second<ul><li>nested <em>one</em></li></ul></li><li>Third<pre><code>npm i</code></pre></li></ol>'
  );
});

test('headings, quotes, tables and paragraphs', () => {
  assert.equal(md('# Title'), '<h3>Title</h3>');
  assert.equal(md('> quoted'), '<blockquote><p>quoted</p></blockquote>');
  assert.equal(
    md('| A | B |\n|---|:-:|\n| 1 | **2** |'),
    '<div class="table-wrap"><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td><strong>2</strong></td></tr></tbody></table></div>'
  );
  assert.equal(md('line one\nline two\n\nnext'), '<p>line one<br>line two</p><p>next</p>');
});

test('snake_case words are not turned into emphasis', () => {
  assert.equal(md('use my_var_name here'), '<p>use my_var_name here</p>');
});
