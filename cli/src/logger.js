import fs from 'node:fs';
import path from 'node:path';
import { LOG_DIR, DEFAULT_LOG_DIR, API_BASE_URL, APP_NAME } from './config.js';

// Последовательности управления терминалом (ANSI): цвета, курсор, OSC (в т.ч. гиперссылки OSC 8).
const OSC8_LINK = /\u001b\]8;[^;\u0007\u001b]*;([^\u0007\u001b]*)(?:\u0007|\u001b\\)([\s\S]*?)\u001b\]8;;(?:\u0007|\u001b\\)/g;
const OSC_ANY = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
const CSI = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const ESC_SHORT = /\u001b[@-Z\\-_]/g;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/**
 * Убирает все ANSI-коды и escape-последовательности.
 * Кликабельные ссылки не теряются: «ESC]8;;URL ... ТЕКСТ ... ESC]8;;» превращается в «ТЕКСТ (URL)».
 */
export function stripAnsi(text) {
  return String(text)
    .replace(OSC8_LINK, (_, url, label) => (!url || label === url ? label : `${label} (${url})`))
    .replace(OSC_ANY, '')
    .replace(CSI, '')
    .replace(ESC_SHORT, '')
    .replace(CONTROL, '');
}

const pad = (n, len = 2) => String(n).padStart(len, '0');
const datePart = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timePart = (d, sep = ':') => [pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds())].join(sep);

/** Имя файла: kb_session_YYYY-MM-DD_HH-mm-ss.log */
export const sessionFileName = (d) => `kb_session_${datePart(d)}_${timePart(d, '-')}.log`;

/**
 * Буфер сессии в оперативной памяти. Ничего не пишет на диск, пока не вызван save().
 * Тексты в лог попадают уже очищенными от ANSI.
 */
export class SessionLogger {
  #entries = [];
  #saved = null;

  constructor({ dir = LOG_DIR, api = API_BASE_URL, now = () => new Date() } = {}) {
    this.dir = dir;
    this.api = api;
    this.now = now;
    this.startedAt = now();
  }

  get size() {
    return this.#entries.length;
  }

  /** Строка, введённая пользователем (вместе с флагами). */
  input(text) {
    this.#push('ВВОД', text);
  }

  /** Ответ программы (цвета и escape-коды вырезаются). */
  output(text) {
    this.#push('ОТВЕТ', text);
  }

  /** Служебное событие (старт, сигнал и т. д.). */
  system(text) {
    this.#push('СИСТЕМА', text);
  }

  #push(kind, text) {
    this.#entries.push({ at: this.now(), kind, text: stripAnsi(text) });
  }

  /** Чистый текст всей сессии. */
  render(endedAt = this.now()) {
    const rule = '='.repeat(64);
    const head = [
      rule,
      `${APP_NAME}: лог сессии`,
      `Начало: ${datePart(this.startedAt)} ${timePart(this.startedAt)}`,
      `Конец:  ${datePart(endedAt)} ${timePart(endedAt)}`,
      `API:    ${this.api}`,
      `Записей: ${this.#entries.length}`,
      rule,
      '',
    ];
    const body = this.#entries.map(({ at, kind, text }) => {
      const stamp = `[${timePart(at)}] ${kind.padEnd(7)}`;
      if (kind === 'ВВОД') return `${stamp}: ${text}`;
      const lines = text.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
      if (lines.length === 1) return `${stamp}: ${lines[0]}`;
      return `${stamp}:\n${lines.map((l) => `    ${l}`).join('\n')}`;
    });
    return `${head.join('\n')}${body.join('\n')}\n`;
  }

  /**
   * Создаёт папку логов (если её нет) и записывает файл сессии. Повторный вызов ничего не пишет.
   * Возвращает { path, display }: display это то, что показываем пользователю (logs/kb_session_...log).
   */
  save() {
    if (this.#saved) return this.#saved;
    const ended = this.now();
    fs.mkdirSync(this.dir, { recursive: true });
    const base = sessionFileName(ended).replace(/\.log$/, '');
    const content = this.render(ended);

    for (let n = 0; n < 100; n++) {
      const name = `${base}${n ? `-${n + 1}` : ''}.log`;
      const filePath = path.join(this.dir, name);
      try {
        fs.writeFileSync(filePath, content, { encoding: 'utf8', flag: 'wx' });
        const isDefault = path.resolve(this.dir) === path.resolve(DEFAULT_LOG_DIR);
        this.#saved = { path: filePath, display: isDefault ? `logs/${name}` : filePath };
        return this.#saved;
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
    }
    throw new Error('Не удалось подобрать свободное имя файла лога');
  }
}
