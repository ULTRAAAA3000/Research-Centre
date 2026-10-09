import chalk from 'chalk';
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
    if (url) return link(url, chalk.blue.underline(label));
    if (code) return chalk.cyan(code);
    return chalk.bold(bold);
  });
}

const SHELL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'console']);
const strings = (s) => s.replace(/("(?:\\.|[^"\\])*"|'[^']*')/g, (m) => chalk.green(m));

/** Лёгкая подсветка одной строки кода. */
export function highlight(line, lang) {
  if (lang === 'json') {
    return line.replace(
      /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?\b)/g,
      (_m, str, colon, kw, num) =>
        str ? (colon ? chalk.cyan(str) + colon : chalk.green(str)) : kw ? chalk.magenta(kw) : chalk.yellow(num),
    );
  }
  if (/^\s*(#|\/\/)/.test(line)) return chalk.gray(line);
  if (SHELL_LANGS.has(lang)) {
    const m = line.match(/^(\s*(?:sudo\s+)?)([\w./-]+)(.*)$/);
    const head = m ? m[1] + chalk.bold.cyan(m[2]) : '';
    const rest = m ? m[3] : line;
    return (
      head +
      rest.replace(
        /("(?:\\.|[^"\\])*"|'[^']*')|(\s--?[A-Za-z][\w-]*)|(\$\{?\w+\}?)|(\s#.*$)/g,
        (_x, str, flag, variable, comment) => {
          if (str) return chalk.green(str);
          if (flag) {
            const trimmed = flag.trimStart();
            return flag.slice(0, flag.length - trimmed.length) + chalk.yellow(trimmed);
          }
          if (variable) return chalk.magenta(variable);
          return chalk.gray(comment);
        },
      )
    );
  }
  if (/^\s*\[.+\]\s*$/.test(line)) return chalk.bold.magenta(line);
  const kv = line.match(/^(\s*-?\s*)([A-Za-z_][\w.-]*)(\s*[:=])(.*)$/);
  if (kv) return kv[1] + chalk.cyan(kv[2]) + kv[3] + strings(kv[4]);
  return strings(line);
}

const width = () => Math.min(process.stdout.columns || 80, 100);
const rule = (char = '─') => chalk.gray(char.repeat(width()));

function renderCode({ lang, lines }) {
  const label = lang || 'text';
  const rows = lines.map((l) => l.replace(/\t/g, '  '));
  const longest = Math.max(label.length + 4, 24, ...rows.map((l) => [...l].length));
  const boxed = longest + 4 <= (process.stdout.columns || 100);
  const out = [];
  if (boxed) {
    out.push(chalk.gray(`┌─ ${label} ${'─'.repeat(longest + 2 - label.length - 3)}┐`));
    for (const row of rows) {
      out.push(`${chalk.gray('│')} ${highlight(row, lang)}${' '.repeat(longest - [...row].length)} ${chalk.gray('│')}`);
    }
    out.push(chalk.gray(`└${'─'.repeat(longest + 2)}┘`));
  } else {
    // длинные строки: без правой границы, чтобы рамка не ломалась при переносе
    out.push(chalk.gray(`┌─ ${label}`));
    for (const row of rows) out.push(`${chalk.gray('│')} ${highlight(row, lang)}`);
    out.push(chalk.gray('└─'));
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
      out.push('', chalk.bold.magenta(`▌ ${heading[2].trim()}`));
      continue;
    }
    const item = raw.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (item) {
      out.push(`  ${chalk.cyan('•')} ${inline(item[1])}`);
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

const tagLine = (tags = []) => (tags.length ? chalk.gray(tags.map((t) => `#${t}`).join(' ')) : '');

export function formatBanner() {
  return [
    chalk.bold(`🔬 ${APP_NAME}`) + chalk.gray(`  v${APP_VERSION}`),
    chalk.gray(`API: ${API_BASE_URL}`),
    chalk.gray('help: справка по флагам · exit: выход (лог сессии сохранится в logs/)'),
    '',
  ].join('\n');
}

export function formatHelp() {
  const row = (flag, text) => `  ${chalk.cyan(flag.padEnd(28))} ${text}`;
  return [
    chalk.bold('Поиск и навигация'),
    row('-s, --search <запрос>', 'поиск по ключевым словам: -s docker, -s "zero trust"'),
    row('-c, --categories', 'список всех разделов'),
    row('-t, --topic <раздел>', 'статьи раздела: -t security (ключ или название)'),
    row('-i, --id <id>', 'полная статья по точному id: -i wireguard-vpn'),
    row('-h, --help', 'эта справка'),
    '',
    `Без флага строка считается поиском: ${chalk.cyan('docker')} то же, что ${chalk.cyan('-s docker')}.`,
    `Флаги ${chalk.cyan('-t')} и ${chalk.cyan('-s')} можно совместить: ${chalk.cyan('-t security -s ssh')} ищет внутри раздела.`,
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
    return `${chalk.red('✖ Нет подключения')} ${chalk.gray(url)}\n  ${error}`;
  }
  return [
    `${chalk.green('✔ Подключено')} ${chalk.gray(url)}`,
    `  ответ за ${ms} мс · статей: ${articles} · разделов: ${categories}`,
  ].join('\n');
}

export function formatSearch(data, { topic = null } = {}) {
  const results = data.results || [];
  const scope = topic ? ` в разделе «${topic.title}»` : '';
  if (!results.length) {
    return `${chalk.yellow(`Ничего не найдено по запросу «${data.query}»${scope}.`)}\n${chalk.gray('Список разделов: -c')}`;
  }
  const shown = data.count > results.length ? ` (показано ${results.length})` : '';
  const lines = [chalk.bold(`🔎 «${data.query}»${scope}: найдено ${topic ? results.length : data.count}${shown}`), ''];
  results.forEach((r, i) => {
    lines.push(`${chalk.gray(String(i + 1).padStart(2) + '.')} ${chalk.bold.yellow(r.title)} ${chalk.gray(`[${r.category}]`)}`);
    lines.push(`    ${chalk.cyan('id:')} ${r.id}`);
    if (r.summary) lines.push(`    ${chalk.gray(r.summary)}`);
  });
  lines.push('', chalk.gray('Открыть статью: -i <id>'));
  return lines.join('\n');
}

export function formatCategories(data) {
  const list = data.categories || [];
  const lines = [chalk.bold(`📚 Разделы базы знаний (${list.length})`), ''];
  const keyWidth = Math.max(...list.map((c) => c.key.length), 8);
  for (const c of list) {
    lines.push(`  ${c.emoji} ${chalk.cyan(c.key.padEnd(keyWidth))} ${c.title} ${chalk.gray(`(${c.count})`)}`);
  }
  lines.push('', chalk.gray('Статьи раздела: -t <раздел>, например -t security'));
  return lines.join('\n');
}

export function formatTopic(data) {
  const { category, articles = [] } = data;
  const lines = [chalk.bold(`${category.emoji} ${category.title}`) + chalk.gray(` (${category.key}, статей: ${category.count})`), ''];
  articles.forEach((a, i) => {
    lines.push(`${chalk.gray(String(i + 1).padStart(2) + '.')} ${chalk.bold.yellow(a.title)}`);
    lines.push(`    ${chalk.cyan('id:')} ${a.id}`);
    if (a.summary) lines.push(`    ${chalk.gray(a.summary)}`);
  });
  lines.push('', chalk.gray('Открыть статью: -i <id>'));
  return lines.join('\n');
}

export function formatArticle(article) {
  const out = [
    chalk.bold.yellow(`📌 ${article.title}`),
    `${chalk.green(article.category)} ${tagLine(article.tags)}`.trim(),
    rule(),
    renderMarkdown(article.body),
  ];
  if (article.sources?.length) {
    out.push('', chalk.bold('🔗 Первоисточники:'));
    article.sources.forEach((s, i) => {
      out.push(`  ${chalk.gray(String(i + 1).padStart(2) + '.')} ${link(s.url, chalk.blue.underline(s.title))}`);
    });
  }
  return out.join('\n');
}

export function formatError(message) {
  return `${chalk.red('✖')} ${chalk.red(message)}`;
}

/** Ошибки API: сообщение плюс полезные подсказки от сервера (похожие статьи, список разделов). */
export function formatApiError(err) {
  if (!(err instanceof ApiError)) return formatError(err?.message || String(err));
  const out = [formatError(err.message)];
  const suggestions = err.body?.suggestions;
  if (suggestions?.length) {
    out.push(chalk.gray('Возможно, вы искали:'));
    for (const s of suggestions) out.push(`  ${chalk.cyan(s.id)} ${chalk.gray('—')} ${s.title}`);
  }
  const categories = err.body?.categories;
  if (categories?.length) {
    out.push(chalk.gray('Доступные разделы:'));
    const keyWidth = Math.max(...categories.map((c) => c.key.length), 8);
    for (const c of categories) out.push(`  ${c.emoji} ${chalk.cyan(c.key.padEnd(keyWidth))} ${c.title}`);
  }
  return out.join('\n');
}
