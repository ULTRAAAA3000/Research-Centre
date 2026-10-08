import path from 'node:path';

/**
 * Адрес Cloudflare Worker с базой знаний.
 * Поменять можно здесь или переменной окружения KB_API_URL (без слеша на конце).
 */
export const API_BASE_URL = (process.env.KB_API_URL || 'https://research-centre.mrcru96.workers.dev').replace(/\/+$/, '');

/** Таймаут одного запроса к API, миллисекунды (KB_TIMEOUT_MS). */
export const REQUEST_TIMEOUT_MS = Number(process.env.KB_TIMEOUT_MS) || 10_000;

/** Приглашение ввода. */
export const PROMPT_TEXT = '[Research-KB] > ';

/**
 * Папка логов по умолчанию: папка logs в текущей директории запуска терминала (process.cwd()).
 * Это гарантирует корректную запись файлов даже в скомпилированном pkg бинарнике.
 */
export const DEFAULT_LOG_DIR = path.resolve(process.cwd(), 'logs');

/** Папка логов (переопределяется переменной KB_LOG_DIR). */
export const LOG_DIR = process.env.KB_LOG_DIR || DEFAULT_LOG_DIR;

export const APP_NAME = 'Research Centre KB';

/** Версия приложения */
export const APP_VERSION = '1.0.0';
