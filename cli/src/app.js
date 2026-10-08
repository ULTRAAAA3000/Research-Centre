import readline from 'node:readline';
import chalk from 'chalk';
import * as defaultApi from './api.js';
import * as fmt from './formatter.js';
import { SessionLogger } from './logger.js';
import { PROMPT_TEXT, API_BASE_URL } from './config.js';

// ───────────────────────── Разбор строки ─────────────────────────

/**
 * Делит строку на слова с учётом кавычек: -s "zero trust" -> ['-s', 'zero trust'].
 * Слово в кавычках никогда не считается флагом (quoted = true).
 */
export function tokenize(line) {
  const tokens = [];
  let current = '';
  let quote = null;
  let quoted = false;
  let started = false;

  const push = () => {
    if (started) tokens.push({ text: current, quoted });
    current = '';
    quoted = false;
    started = false;
  };

  for (const ch of String(line)) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      quoted = true;
      started = true;
    } else if (/\s/.test(ch)) {
      push();
    } else {
      current += ch;
      started = true;
    }
  }
  push();
  return tokens;
}

const FLAGS = new Map([
  ['-s', 'search'], ['--search', 'search'],
  ['-c', 'categories'], ['--categories', 'categories'],
  ['-t', 'topic'], ['--topic', 'topic'],
  ['-i', 'id'], ['--id', 'id'],
  ['-h', 'help'], ['--help', 'help'],
]);
const VALUE_FLAGS = new Set(['search', 'topic', 'id']);
const FLAG_NAMES = { search: '-s', topic: '-t', id: '-i' };

/**
 * Разбирает введённую строку.
 * Строка без флага целиком считается поисковым запросом (-s). Значение флага: все слова до следующего флага.
 */
export function parseInput(line) {
  const result = { search: null, topic: null, id: null, categories: false, help: false, errors: [], extra: [] };
  const values = { search: [], topic: [], id: [] };
  const used = new Set();
  let current = 'search';

  for (const { text, quoted } of tokenize(line)) {
    if (!quoted && /^--?[A-Za-z]/.test(text)) {
      const name = FLAGS.get(text);
      if (!name) {
        result.errors.push(`Неизвестный флаг: ${text}`);
        continue;
      }
      if (VALUE_FLAGS.has(name)) {
        used.add(name);
        current = name;
      } else {
        result[name] = true;
        current = null;
      }
      continue;
    }
    if (current) values[current].push(text);
    else result.extra.push(text);
  }

  for (const key of VALUE_FLAGS) {
    const value = values[key].join(' ').trim();
    result[key] = value || null;
    if (used.has(key) && !value) result.errors.push(`Флагу ${FLAG_NAMES[key]} нужно значение`);
  }
  return result;
}

// ───────────────────────── Выполнение команд ─────────────────────────

async function execute(parsed, api) {
  if (parsed.errors.length) {
    return [...parsed.errors.map(fmt.formatError), chalk.gray('Справка: help')].join('\n');
  }
  let text;
  if (parsed.help) {
    text = fmt.formatHelp();
  } else if (parsed.categories) {
    text = fmt.formatCategories(await api.categories());
  } else if (parsed.id) {
    text = fmt.formatArticle((await api.article(parsed.id)).article);
  } else if (parsed.topic && parsed.search) {
    const [topic, found] = await Promise.all([api.topic(parsed.topic), api.search(parsed.search)]);
    const results = (found.results || []).filter((r) => r.category === topic.category.key);
    text = fmt.formatSearch({ ...found, results, count: results.length }, { topic: topic.category });
  } else if (parsed.topic) {
    text = fmt.formatTopic(await api.topic(parsed.topic));
  } else if (parsed.search) {
    text = fmt.formatSearch(await api.search(parsed.search));
  } else {
    text = chalk.yellow('Введите запрос или команду. Справка: help');
  }
  if (parsed.extra.length) {
    text += `\n${chalk.gray(`Лишние слова проигнорированы: ${parsed.extra.join(' ')}`)}`;
  }
  return text;
}

// ───────────────────────── REPL ─────────────────────────

/**
 * Запускает изолированный интерактивный цикл. Команды обрабатываются внутри процесса Node.js
 * и в историю оболочки (bash/zsh/PowerShell) не попадают: readline хранит историю только в памяти.
 * Возвращает промис, который завершается после сохранения лога.
 */
export function startRepl({
  input = process.stdin,
  output = process.stdout,
  api = defaultApi,
  logger = new SessionLogger(),
  handleSignals = true,
  banner = true,
} = {}) {
  const interactive = Boolean(input.isTTY && output.isTTY);
  const rl = readline.createInterface({
    input,
    output,
    prompt: chalk.bold.cyan(PROMPT_TEXT),
    terminal: interactive,
    historySize: 200,
  });

  const print = (text) => {
    output.write(`${text}\n`);
    logger.output(text);
  };

  let closing = false;
  let queue = Promise.resolve();

  return new Promise((resolve) => {
    const onSignal = (name) => () => finish(name);
    const handlers = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'].map((name) => [name, onSignal(name)]);

    async function finish(reason) {
      if (closing) return;
      closing = true;
      for (const [name, fn] of handlers) process.off(name, fn);
      logger.system(`Завершение сессии (${reason})`);
      try {
        rl.close();
      } catch {
        // уже закрыт
      }
      let saved = null;
      try {
        saved = logger.save();
        output.write(`\n${chalk.green('[✓]')} Сессия завершена. Лог сохранен в ${saved.display}\n`);
      } catch (err) {
        output.write(`\n${chalk.red('[✖]')} Сессия завершена, но лог сохранить не удалось: ${err.message}\n`);
      }
      resolve({ reason, logPath: saved?.path ?? null });
    }

    async function handleLine(rawLine) {
      const line = rawLine.trim();
      if (!line) return;
      logger.input(line);
      const command = line.toLowerCase();

      if (command === 'exit' || command === 'quit') return finish('exit');
      if (command === 'help' || command === '-h' || command === '--help') return print(fmt.formatHelp());
      if (command === 'clear' || command === 'cls') {
        if (output === process.stdout) console.clear(); // буфер лога сессии при этом сохраняется
        return;
      }
      if (command === 'status') {
        try {
          const info = await api.status();
          return print(fmt.formatStatus({ ok: true, url: API_BASE_URL, ...info }));
        } catch (err) {
          return print(fmt.formatStatus({ ok: false, url: API_BASE_URL, error: err.message }));
        }
      }

      try {
        print(await execute(parseInput(line), api));
      } catch (err) {
        print(fmt.formatApiError(err));
      }
    }

    rl.on('line', (line) => {
      queue = queue
        .then(() => handleLine(line))
        .catch((err) => print(fmt.formatError(err?.message || String(err))))
        .then(() => {
          if (!closing) rl.prompt();
        });
    });

    // Ctrl+D или конец ввода (канал): дожидаемся уже принятых команд, затем сохраняем лог
    rl.on('close', () => {
      queue.then(() => finish('EOF'));
    });
    // Ctrl+C в интерактивном режиме приходит как событие readline
    rl.on('SIGINT', () => finish('SIGINT'));
    if (handleSignals) {
      for (const [name, fn] of handlers) process.on(name, fn);
    }

    logger.system(`Старт сессии, API: ${API_BASE_URL}`);
    if (banner) output.write(`${fmt.formatBanner()}\n`);
    rl.prompt();
  });
}
