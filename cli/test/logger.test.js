import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripAnsi, sessionFileName, SessionLogger } from '../src/logger.js';

const ESC = '\u001b';

test('stripAnsi: цвета и курсор удаляются', () => {
  assert.equal(stripAnsi(`${ESC}[1m${ESC}[31mошибка${ESC}[0m`), 'ошибка');
  assert.equal(stripAnsi(`${ESC}[2J${ESC}[Hтекст`), 'текст');
});

test('stripAnsi: ссылка OSC 8 превращается в «текст (url)»', () => {
  const link = `${ESC}]8;;https://example.com${ESC}\\Сайт${ESC}]8;;${ESC}\\`;
  assert.equal(stripAnsi(`см. ${link}.`), 'см. Сайт (https://example.com).');
  const same = `${ESC}]8;;https://a.b${ESC}\\https://a.b${ESC}]8;;${ESC}\\`;
  assert.equal(stripAnsi(same), 'https://a.b');
});

test('stripAnsi: BEL-терминатор и оставшихся ESC нет', () => {
  const out = stripAnsi(`${ESC}]0;заголовок\u0007${ESC}[32mok${ESC}[0m`);
  assert.equal(out, 'ok');
  assert.ok(!out.includes(ESC));
});

test('имя файла: kb_session_YYYY-MM-DD_HH-mm-ss.log', () => {
  const name = sessionFileName(new Date(2026, 9, 7, 9, 5, 3));
  assert.equal(name, 'kb_session_2026-10-07_09-05-03.log');
});

test('save: создаёт папку, пишет чистый лог, повторный вызов ничего не меняет', () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-')), 'nested', 'logs');
  const fixed = new Date(2026, 9, 7, 12, 0, 0);
  const logger = new SessionLogger({ dir, api: 'https://x.test', now: () => fixed });
  logger.input('-s docker');
  logger.output(`${ESC}[1mЗаголовок${ESC}[0m\nстрока 2 ${ESC}]8;;https://e.com${ESC}\\ссылка${ESC}]8;;${ESC}\\`);
  const saved = logger.save();
  assert.ok(fs.existsSync(saved.path));
  assert.match(path.basename(saved.path), /^kb_session_2026-10-07_12-00-00\.log$/);
  const text = fs.readFileSync(saved.path, 'utf8');
  assert.ok(!text.includes(ESC), 'в логе не должно быть ESC');
  assert.match(text, /ВВОД\s*: -s docker/);
  assert.match(text, /Заголовок/);
  assert.match(text, /ссылка \(https:\/\/e\.com\)/);
  assert.equal(logger.save(), saved);
  assert.equal(fs.readdirSync(dir).length, 1);
});

test('save: два лога в одну секунду не перезаписывают друг друга', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-'));
  const fixed = new Date(2026, 9, 7, 12, 0, 0);
  const a = new SessionLogger({ dir, now: () => fixed });
  const b = new SessionLogger({ dir, now: () => fixed });
  const pa = a.save().path;
  const pb = b.save().path;
  assert.notEqual(pa, pb);
  assert.equal(fs.readdirSync(dir).length, 2);
});
