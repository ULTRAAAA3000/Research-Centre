import test from 'node:test';
import assert from 'node:assert/strict';

process.env.FORCE_COLOR = '1';
const { link, renderMarkdown, inline, supportsHyperlinks, formatArticle } = await import('../src/formatter.js');
const { stripAnsi } = await import('../src/logger.js');
const ESC = '\u001b';

test('link: точная последовательность OSC 8, когда поддержка включена', () => {
  process.env.KB_LINKS = 'on';
  assert.equal(link('https://example.com', 'Текст'), `${ESC}]8;;https://example.com${ESC}\\Текст${ESC}]8;;${ESC}\\`);
});

test('link: без поддержки показывает «текст (url)»', () => {
  process.env.KB_LINKS = 'off';
  assert.equal(link('https://example.com', 'Текст'), 'Текст (https://example.com)');
  assert.equal(link('https://example.com'), 'https://example.com');
});

test('supportsHyperlinks: эвристики по окружению', () => {
  const tty = { isTTY: true };
  assert.equal(supportsHyperlinks({}, { isTTY: false }, 'linux'), false);
  assert.equal(supportsHyperlinks({ TERM: 'xterm-256color' }, tty, 'linux'), true);
  assert.equal(supportsHyperlinks({ TERM: 'dumb' }, tty, 'linux'), false);
  assert.equal(supportsHyperlinks({}, tty, 'win32'), false);
  assert.equal(supportsHyperlinks({ WT_SESSION: 'x' }, tty, 'win32'), true);
  assert.equal(supportsHyperlinks({ KB_LINKS: 'on' }, { isTTY: false }, 'win32'), true);
});

test('renderMarkdown: заголовки, списки, код в рамке, без h1', () => {
  process.env.KB_LINKS = 'off';
  const md = '# Заголовок статьи\n\nАбзац с `кодом` и **жирным**.\n\n## Раздел\n\n- пункт\n\n```bash\nsudo apt install curl # комментарий\n```\n';
  const plain = stripAnsi(renderMarkdown(md));
  assert.ok(!plain.includes('Заголовок статьи'), 'h1 пропускается');
  assert.match(plain, /▌ Раздел/);
  assert.match(plain, /• пункт/);
  assert.match(plain, /┌─ bash/);
  assert.match(plain, /sudo apt install curl # комментарий/);
  assert.match(plain, /└─+┘/);
});

test('inline: ссылки markdown становятся кликабельными', () => {
  process.env.KB_LINKS = 'on';
  assert.ok(inline('см. [док](https://x.test/a)').includes(`${ESC}]8;;https://x.test/a${ESC}\\`));
});

test('formatArticle: источники со ссылками, чистый текст сохраняет URL', () => {
  process.env.KB_LINKS = 'on';
  const text = formatArticle({
    id: 'a', title: 'Тест', category: 'devops', tags: ['x'], body: '# Тест\n\nТекст.',
    sources: [{ title: 'Офиц. документация', url: 'https://docs.example.com' }],
  });
  assert.ok(text.includes(`${ESC}]8;;https://docs.example.com${ESC}\\`));
  assert.match(stripAnsi(text), /Офиц\. документация \(https:\/\/docs\.example\.com\)/);
});
