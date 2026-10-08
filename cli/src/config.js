import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Адрес Cloudflare Worker с базой знаний.
 * Поменять можно здесь или переменной окружения KB_API_URL (без слеша на конце).
 */
export const API_BASE_URL = (process.env.KB_API_URL || 'https://research-centre.mrcru96.workers.dev').replace(/\/+$/, '');

/** Таймаут одного запроса к API, миллисекунды (KB_TIMEOUT_MS). */
export const REQUEST_TIMEOUT_MS = Number(process.env.KB_TIMEOUT_MS) || 10_000;

/** Приглашение ввода. */
export const PROMPT_TEXT = '[Research-KB] > ';

/** Папка логов по умолчанию: logs/ рядом с проектом (не зависит от текущей директории). */
export const DEFAULT_LOG_DIR = fileURLToPath(new URL('../logs/', import.meta.url));

/** Папка логов (переопределяется переменной KB_LOG_DIR). */
export const LOG_DIR = process.env.KB_LOG_DIR || DEFAULT_LOG_DIR;

export const APP_NAME = 'Research Centre KB';

export const APP_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  } catch {
    return '1.0.0';
  }
})();
