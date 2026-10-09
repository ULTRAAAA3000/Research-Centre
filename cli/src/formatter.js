import chalk from 'chalk';
import { theme } from './theme.js';
import { API_BASE_URL, APP_NAME, APP_VERSION } from './config.js';
import { ApiError } from './api.js';

const ESC = '\u001b';

// ───────────────────────── Кликабельные ссылки (OSC 8) ─────────────────────────

/**
 * Поддерживает ли терминал гиперссылки OSC 8.
 * Принудительно: KB_LINKS=on|off. Иначе: только интерактивный терминал, не dumb/linux,
 * а в Windows только современные терминалы (Windows Terminal, VS Code, ConEmu и т. п.).
 */
export function supportsHyperlinks(env = process.env, stream = process.stdout, platform = process.platform) {
  const forced = String(env.KB_LINKS || '').toLowerCase();
  if (forced === 'on') return true;
  if (forced === 'off') return false;
  if (!stream?.isTTY) return false;
  if (env.TERM === 'dumb' || env.TERM === 'linux') return false;
  if (platform === 'win32') {
    return Boolean(env.WT_SESSION || env.TERM_PROGRAM || env.ConEmuANSI === 'ON' || env.ANSICON);
  }
  return true;
}

/**
 * Кликабельная ссылка: ESC ] 8 ; ; URL ESC \ ТЕКСТ ESC ] 8 ; ; ESC \
 * В терминале без поддержки показывается «ТЕКСТ (URL)», чтобы адрес не терялся.
 */
export function link(url, text = url) {
  if (supportsHyperlinks()) {
    return `${ESC}]8;;${url}${ESC}\\${text}${ESC}]8;;${ESC}\\`;
  }
  return text === url ? url : `${text} (${url})`;
}

// ───────────────────────── Markdown → цветной текст ─────────────────────────

const INLINE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;

/** Строчная разметка: [текст](url) ссылка, `код`, **жирный**. */
export function inline(text) {
  return String(text).replace(INLINE, (_, label, url, code, bold) => {
    if (url) return link(url, theme.link(label));
    if (code) return theme.cyan(code);
    return chalk.bold(bold);
  });
}

const SHELL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'console']);
const strings = (s) => s.replace(/("(?:\\.|[^"\\])*"|'[^']*')/g, (m) => theme.green(m));

/** Лёгкая подсветка одной строки кода. */
export function highlight(line, lang) {
  if (lang === 'json') {
    return line.replace(
      /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?\b)/g,
      (_m, str, colon, kw, num) =>
        str ? (colon ? theme.cyan(str) + colon : theme.green(str)) : kw ? theme.magenta(kw) : theme.yellow(num),
    );
  }
  if (/^\s*(#|\/\/)/.test(line)) return theme.muted(line);
  if (SHELL_LANGS.has(lang)) {
    const m = line.match(/^(\s*(?:sudo\s+)?)([\w./-]+)(.*)$/);
    const head = m ? m[1] + chalk.bold.cyanBright(m[2]) : '';
    const rest = m ? m[3] : line;
    return (
      head +
      rest.replace(
        /("(?:\\.|[^"\\])*"|'[^']*')|(\s--?[A-Za-z][\w-]*)|(\$\{?\w+\}?)|(\s#.*$)/g,
        (_x, str, flag, variable, comment) => {
          if (str) return theme.green(str);
          if (flag) {
            const trimmed = flag.trimStart();
            return flag.slice(0, flag.length - trimmed.length) + theme.yellow(trimmed);
          }
          if (variable) return theme.magenta(variable);
          return theme.muted(comment);
        },
      )
    );
  }
  if (/^\s*\[.+\]\s*$/.test(line)) return chalk.bold.magentaBright(line);
  const kv = line.match(/^(\s*-?\s*)([A-Za-z_][\w.-]*)(\s*[:=])(.*)$/);
  if (kv) return kv[1] + theme.cyan(kv[2]) + kv[3] + strings(kv[4]);
  return strings(line);
}

const width = () => Math.min(process.stdout.columns || 80, 100);
const rule = (char = '─') => theme.muted(char.repeat(width()));

function renderCode({ lang, lines }) {
  const label = lang || 'text';
  const rows = lines.map((l) => l.replace(/\t/g, '  '));
  const longest = Math.max(label.length + 4, 24, ...rows.map((l) => [...l].length));
  const boxed = longest + 4 <= (process.stdout.columns || 100);
  const out = [];
  if (boxed) {
    out.push(theme.muted(`┌─ ${label} ${'─'.repeat(longest + 2 - label.length - 3)}┐`));
    for (const row of rows) {
      out.push(`${theme.muted('│')} ${highlight(row, lang)}${' '.repeat(longest - [...row].length)} ${theme.muted('│')}`);
    }
    out.push(theme.muted(`└${'─'.repeat(longest + 2)}┘`));
  } else {
    // длинные строки: без правой границы, чтобы рамка не ломалась при переносе
    out.push(theme.muted(`┌─ ${label}`));
    for (const row of rows) out.push(`${theme.muted('│')} ${highlight(row, lang)}`);
    out.push(theme.muted('└─'));
  }
  return out;
}

/** Markdown статьи в цветной текст терминала. */
export function renderMarkdown(markdown) {
  const out = [];
  let code = null;
  for (const raw of String(markdown).replace(/\r/g, '').split('\n')) {
    const fence = raw.match(/^\s*```\s*([\w+-]*)\s*$/);
    if (code) {
      if (fence && !fence[1]) {
        out.push(...renderCode(code), '');
        code = null;
      } else {
        code.lines.push(raw);
      }
      continue;
    }
    if (fence) {
      code = { lang: fence[1].toLowerCase(), lines: [] };
      continue;
    }
    const heading = raw.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      if (heading[1].length === 1) continue; // заголовок статьи уже показан отдельно
      out.push('', chalk.bold.magentaBright(`▌ ${heading[2].trim()}`));
      continue;
    }
    const item = raw.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (item) {
      out.push(`  ${theme.cyan('•')} ${inline(item[1])}`);
      continue;
    }
    if (!raw.trim()) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    out.push(inline(raw.trim()));
  }
  if (code) out.push(...renderCode(code));
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ───────────────────────── Экраны ─────────────────────────

const tagLine = (tags = []) => (tags.length ? theme.muted(tags.map((t) => `#${t}`).join(' ')) : '');

export function formatBanner() {
  const row = (cmd, text) => `  ${theme.cyan(cmd.padEnd(18))} ${theme.muted(text)}`;
  return [
    chalk.bold(`🔬 ${APP_NAME}`) + theme.muted(`  v${APP_VERSION}`),
    theme.muted(`API: ${API_BASE_URL}`),
    '',
    chalk.bold('Команды'),
    row('-s <запрос>', 'поиск по ключевым словам (или просто введите слова)'),
    row('-c', 'список разделов базы знаний'),
    row('-t <раздел>', 'статьи раздела: -t security'),
    row('-t <раздел> -s ..', 'поиск только внутри раздела'),
    row('-i <номер | id>', 'открыть статью: номер из списка или её id'),
    row('status', 'проверить подключение к Worker'),
    row('clear', 'очистить экран (лог не сбрасывается)'),
    row('help, -h', 'полная справка по флагам'),
    row('exit, quit', 'выйти (лог сессии сохранится в logs/)'),
    '',
    theme.muted('Пример: docker → в списке найдите нужную статью → -i 3'),
    '',
  ].join('\n');
}

export function formatHelp() {
  const row = (flag, text) => `  ${theme.cyan(flag.padEnd(28))} ${text}`;
  return [
    chalk.bold('Поиск и навигация'),
    row('-s, --search <запрос>', 'поиск по ключевым словам: -s docker, -s "zero trust"'),
    row('-c, --categories', 'список всех разделов'),
    row('-t, --topic <раздел>', 'статьи раздела: -t security (ключ или название)'),
    row('-i, --id <номер | id>', 'полная статья: номер из списка (-i 3) или точный id (-i wireguard-vpn)'),
    row('-h, --help', 'эта справка'),
    '',
    `Без флага строка считается поиском: ${theme.cyan('docker')} то же, что ${theme.cyan('-s docker')}.`,
    `Флаги ${theme.cyan('-t')} и ${theme.cyan('-s')} можно совместить: ${theme.cyan('-t security -s ssh')} ищет внутри раздела.`,
    `Номер статьи берётся из последнего показанного списка (поиск или раздел): после ${theme.cyan('docker')} команда ${theme.cyan('-i 2')} откроет вторую статью.`,
    `Если указано несколько флагов, приоритет такой: -h, -c, -i, -t/-s.`,
    `Запрос из нескольких слов можно писать без кавычек или в кавычках.`,
    '',
    chalk.bold('Локальные команды'),
    row('help', 'справка'),
    row('clear', 'очистить экран (лог сессии не сбрасывается)'),
    row('status', 'проверить подключение к Cloudflare Worker'),
    row('exit, quit', 'выйти и сохранить лог сессии в logs/'),
  ].join('\n');
}

export function formatStatus({ ok, url, error, ms, articles, categories }) {
  if (!ok) {
    return `${theme.red('✖ Нет подключения')} ${theme.muted(url)}\n  ${error}`;
  }
  return [
    `${theme.green('✔ Подключено')} ${theme.muted(url)}`,
    `  ответ за ${ms} мс · статей: ${articles} · разделов: ${categories}`,
  ].join('\n');
}

export function formatSearch(data, { topic = null } = {}) {
  const results = data.results || [];
  const scope = topic ? ` в разделе «${topic.title}»` : '';
  if (!results.length) {
    return `${theme.yellow(`Ничего не найдено по запросу «${data.query}»${scope}.`)}\n${theme.muted('Список разделов: -c')}`;
  }
  const shown = data.count > results.length ? ` (показано ${results.length})` : '';
  const lines = [chalk.bold(`🔎 «${data.query}»${scope}: найдено ${topic ? results.length : data.count}${shown}`), ''];
  results.forEach((r, i) => {
    lines.push(`${theme.muted(String(i + 1).padStart(2) + '.')} ${chalk.bold.yellowBright(r.title)} ${theme.muted(`[${r.category}]`)}`);
    lines.push(`    ${theme.cyan('id:')} ${r.id}`);
    if (r.summary) lines.push(`    ${theme.muted(r.summary)}`);
  });
  lines.push('', theme.muted('Открыть статью: -i <номер> (например -i 1) или -i <id>'));
  return lines.join('\n');
}

export function formatCategories(data) {
  const list = data.categories || [];
  const lines = [chalk.bold(`📚 Разделы базы знаний (${list.length})`), ''];
  const keyWidth = Math.max(...list.map((c) => c.key.length), 8);
  for (const c of list) {
    lines.push(`  ${c.emoji} ${theme.cyan(c.key.padEnd(keyWidth))} ${c.title} ${theme.muted(`(${c.count})`)}`);
  }
  lines.push('', theme.muted('Статьи раздела: -t <раздел>, например -t security'));
  return lines.join('\n');
}

export function formatTopic(data) {
  const { category, articles = [] } = data;
  const lines = [chalk.bold(`${category.emoji} ${category.title}`) + theme.muted(` (${category.key}, статей: ${category.count})`), ''];
  articles.forEach((a, i) => {
    lines.push(`${theme.muted(String(i + 1).padStart(2) + '.')} ${chalk.bold.yellowBright(a.title)}`);
    lines.push(`    ${theme.cyan('id:')} ${a.id}`);
    if (a.summary) lines.push(`    ${theme.muted(a.summary)}`);
  });
  lines.push('', theme.muted('Открыть статью: -i <номер> (например -i 1) или -i <id>'));
  return lines.join('\n');
}

export function formatArticle(article) {
  const out = [
    chalk.bold.yellowBright(`📌 ${article.title}`),
    `${theme.green(article.category)} ${tagLine(article.tags)}`.trim(),
    rule(),
    renderMarkdown(article.body),
  ];
  if (article.sources?.length) {
    out.push('', chalk.bold('🔗 Первоисточники:'));
    article.sources.forEach((s, i) => {
      out.push(`  ${theme.muted(String(i + 1).padStart(2) + '.')} ${link(s.url, theme.link(s.title))}`);
    });
  }
  return out.join('\n');
}

export function formatError(message) {
  return `${theme.red('✖')} ${theme.red(message)}`;
}

/** Ошибки API: сообщение плюс полезные подсказки от сервера (похожие статьи, список разделов). */
export function formatApiError(err) {
  if (!(err instanceof ApiError)) return formatError(err?.message || String(err));
  const out = [formatError(err.message)];
  const suggestions = err.body?.suggestions;
  if (suggestions?.length) {
    out.push(theme.muted('Возможно, вы искали:'));
    for (const s of suggestions) out.push(`  ${theme.cyan(s.id)} ${theme.muted('—')} ${s.title}`);
  }
  const categories = err.body?.categories;
  if (categories?.length) {
    out.push(theme.muted('Доступные разделы:'));
    const keyWidth = Math.max(...categories.map((c) => c.key.length), 8);
    for (const c of categories) out.push(`  ${c.emoji} ${theme.cyan(c.key.padEnd(keyWidth))} ${c.title}`);
  }
  return out.join('\n');
}
