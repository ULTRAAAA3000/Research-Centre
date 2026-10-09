import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

process.env.FORCE_COLOR = '1';
process.env.KB_LINKS = 'on';
const { startRepl } = await import('../src/app.js');
const { SessionLogger } = await import('../src/logger.js');
const { ApiError } = await import('../src/api.js');
const ESC = '\u001b';

const article = {
  id: 'demo', title: 'Демо-статья', category: 'devops', tags: ['demo'],
  summary: 'Краткое описание', body: '# Демо\n\nТекст.\n\n```bash\ndocker ps\n```',
  sources: [{ title: 'Док', url: 'https://docs.example.com' }],
};
const calls = [];
const api = {
  async status() { calls.push('status'); return { ok: true, articles: 50, categories: 5, ms: 12 }; },
  async search(q) { calls.push(`search:${q}`); return { query: q, count: 1, results: [article] }; },
  async categories() { calls.push('categories'); return { categories: [{ key: 'devops', title: 'DevOps', emoji: '🚀', count: 17 }] }; },
  async topic(n) { calls.push(`topic:${n}`); return { category: { key: 'devops', title: 'DevOps', emoji: '🚀', count: 17 }, articles: [article] }; },
  async article(id) {
    calls.push(`article:${id}`);
    if (id !== 'demo') throw new ApiError(`Статья «${id}» не найдена`, { status: 404, body: { suggestions: [article] } });
    return { article };
  },
};

async function session(lines) {
  const input = new PassThrough();
  const output = new PassThrough();
  let shown = '';
  output.on('data', (c) => (shown += c));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-app-'));
  const logger = new SessionLogger({ dir, api: 'https://test' });
  const done = startRepl({ input, output, api, logger, handleSignals: false });
  input.end(lines.join('\n') + '\n');
  const result = await done;
  return { shown, result, dir, log: fs.readFileSync(result.logPath, 'utf8') };
}

test('REPL: флаги вызывают нужные методы API', async () => {
  calls.length = 0;
  const { shown } = await session(['docker', '-s "zero trust"', '-c', '-t devops', '-i demo', '-t devops -s ssh', 'status', 'exit']);
  assert.deepEqual(calls, ['search:docker', 'search:zero trust', 'categories', 'topic:devops', 'article:demo', 'topic:devops', 'search:ssh', 'status']);
  assert.match(shown, /Демо-статья/);
  assert.match(shown, /\[Research-KB\] > /);
  assert.match(shown, /\[✓\].*Сессия завершена\. Лог сохранен в /);
});

test('REPL: лог чистый, без ANSI, ссылки сохраняют URL', async () => {
  const { log, shown, result } = await session(['-i demo', 'exit']);
  assert.ok(shown.includes(ESC), 'на экране есть ANSI-коды');
  assert.ok(shown.includes(`${ESC}]8;;https://docs.example.com`), 'на экране кликабельная ссылка');
  assert.ok(!log.includes(ESC), 'в логе нет ESC');
  assert.match(log, /ВВОД\s*: -i demo/);
  assert.match(log, /Док \(https:\/\/docs\.example\.com\)/);
  assert.match(path.basename(result.logPath), /^kb_session_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.log$/);
});

test('REPL: ошибки API показываются с подсказками, сессия не падает', async () => {
  const { shown, log } = await session(['-i nope', '-x', '-s', 'help', 'exit']);
  assert.match(shown, /Статья «nope» не найдена/);
  assert.match(shown, /Возможно, вы искали/);
  assert.match(shown, /Неизвестный флаг: -x/);
  assert.match(shown, /нужно значение/);
  assert.match(shown, /Локальные команды/);
  assert.match(log, /Статья «nope» не найдена/);
});

test('REPL: конец ввода (Ctrl+D) тоже сохраняет лог; quit работает как exit', async () => {
  const eof = await session(['docker']);
  assert.equal(eof.result.reason, 'EOF');
  assert.ok(fs.existsSync(eof.result.logPath));
  const quit = await session(['QUIT']);
  assert.equal(quit.result.reason, 'exit');
});

test('REPL: clear не сбрасывает буфер лога', async () => {
  const { log } = await session(['docker', 'clear', 'status', 'exit']);
  assert.match(log, /ВВОД\s*: docker/);
  assert.match(log, /ВВОД\s*: clear/);
  assert.match(log, /ВВОД\s*: status/);
});

test('REPL: -i <номер> открывает статью из последнего списка, id по-прежнему работает', async () => {
  calls.length = 0;
  const { shown } = await session(['-i 1', 'docker', '-i 1', '-i wire', '-t devops', '-i 1', '-i 9', 'exit']);
  assert.deepEqual(calls, ['search:docker', 'article:demo', 'article:wire', 'topic:devops', 'article:demo']);
  assert.match(shown, /сначала выполните поиск/);
  assert.match(shown, /Нет статьи с номером 9: в списке статей от 1 до 1/);
});

test('REPL: баннер показывает расширенный список команд', async () => {
  const { shown } = await session(['exit']);
  for (const word of ['-s <запрос>', '-c', '-t <раздел>', '-i <номер | id>', 'status', 'clear', 'exit, quit']) {
    assert.ok(shown.includes(word), `в баннере есть ${word}`);
  }
});
