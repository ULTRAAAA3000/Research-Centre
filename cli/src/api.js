import { API_BASE_URL, REQUEST_TIMEOUT_MS } from './config.js';

/** Ошибка обращения к API: status = HTTP-код (если был ответ), body = разобранный JSON ответа. */
export class ApiError extends Error {
  constructor(message, { status = null, body = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request(path, params = {}) {
  const url = new URL(path, `${API_BASE_URL}/`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: 'application/json', 'user-agent': 'research-kb-cli' },
    });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new ApiError(`Превышено время ожидания ответа (${REQUEST_TIMEOUT_MS / 1000} с)`);
    }
    const reason = err?.cause?.code || err?.cause?.message || err?.message || 'неизвестная ошибка';
    throw new ApiError(`Не удалось подключиться к ${API_BASE_URL}: ${reason}`);
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // ответ не JSON: обработаем ниже по статусу
  }

  if (!response.ok) {
    throw new ApiError(body?.error || `Сервер ответил кодом ${response.status}`, { status: response.status, body });
  }
  if (body === null) {
    throw new ApiError('Сервер вернул ответ не в формате JSON');
  }
  return body;
}

/** Проверка подключения: возвращает данные /api/status и время ответа в мс. */
export async function status() {
  const started = performance.now();
  const data = await request('api/status');
  return { ...data, ms: Math.round(performance.now() - started) };
}

/** -s: поиск по ключевым словам. */
export const search = (query) => request('api/search', { q: query });

/** -c: список разделов. */
export const categories = () => request('api/categories');

/** -t: статьи раздела (по ключу, названию или началу ключа). */
export const topic = (name) => request('api/topic', { name });

/** -i: полная статья по точному id. */
export const article = (id) => request('api/article', { id });
