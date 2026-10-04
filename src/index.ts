// Research Centre — Cloudflare Worker
// Роуты: POST /telegram-webhook (Telegram), GET /cli?q=<query> (терминал, ANSI)

export interface Env {
  KB_KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  WEBHOOK_SECRET?: string;
  ALLOWED_USERS?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  KB_PATH: string;
}

interface Source { title: string; url: string }
interface Article {
  id: string;
  title: string;
  category: string;
  tags: string[];
  sources: Source[];
  body: string;
}
type Block =
  | { t: "h"; level: number; text: string }
  | { t: "p"; text: string }
  | { t: "li"; text: string }
  | { t: "code"; lang: string; code: string };

const CACHE_TTL_MS = 5 * 60 * 1000;
const TG_LIMIT = 3800;

// ───────────────────────── Frontmatter + Markdown ─────────────────────────

function clean(v: string): string {
  let s = v.trim().replace(/^["']|["']$/g, "");
  const link = s.match(/^\[[^\]]*\]\((https?:\/\/[^)\s]+)\)$/); // "[url](url)" → url
  if (link) s = link[1];
  return s;
}

function parseFrontmatter(raw: string): { meta: Record<string, any>; body: string } {
  const m = raw.replace(/\r/g, "").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const lines = m[1].split("\n");
  const meta: Record<string, any> = {};
  let i = 0;
  while (i < lines.length) {
    const kv = lines[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) { i++; continue; }
    const [, key, val] = kv;
    i++;
    if (val === "") {
      const items: any[] = [];
      let cur: Record<string, string> | null = null;
      while (i < lines.length && (/^\s+\S/.test(lines[i]) || /^-\s/.test(lines[i]))) {
        const l = lines[i].trim();
        if (l.startsWith("- ")) {
          const rest = l.slice(2);
          const inner = rest.match(/^([\w-]+):\s*(.*)$/);
          if (inner) { cur = { [inner[1]]: clean(inner[2]) }; items.push(cur); }
          else { cur = null; items.push(clean(rest)); }
        } else if (cur) {
          const inner = l.match(/^([\w-]+):\s*(.*)$/);
          if (inner) cur[inner[1]] = clean(inner[2]);
        }
        i++;
      }
      meta[key] = items;
    } else if (val.startsWith("[")) {
      meta[key] = val.replace(/^\[|\]$/g, "").split(",").map(clean).filter(Boolean);
    } else {
      meta[key] = clean(val);
    }
  }
  return { meta, body: m[2] };
}

function parseBlocks(body: string): Block[] {
  const out: Block[] = [];
  const lines = body.replace(/\r/g, "").split("\n");
  let para: string[] = [];
  const flush = () => {
    if (para.length) { out.push({ t: "p", text: para.join(" ") }); para = []; }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
    if (fence) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { code.push(lines[i]); i++; }
      out.push({ t: "code", lang: (fence[1] || "").toLowerCase(), code: code.join("\n") });
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flush(); out.push({ t: "h", level: h[1].length, text: h[2].trim() }); continue; }
    const li = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (li) { flush(); out.push({ t: "li", text: li[1] }); continue; }
    if (!line.trim()) { flush(); continue; }
    para.push(line.trim());
  }
  flush();
  return out;
}

// ───────────────────────── Загрузка базы знаний (GitHub) ─────────────────────────

let cache: { at: number; items: Article[] } | null = null;

async function loadArticles(env: Env): Promise<Article[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.items;
  const headers: Record<string, string> = {
    "User-Agent": "research-centre-worker",
    Accept: "application/vnd.github+json",
  };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;

  const listUrl = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${env.KB_PATH}?ref=${env.GITHUB_BRANCH}`;
  const res = await fetch(listUrl, { headers });
  if (!res.ok) throw new Error(`GitHub list failed: ${res.status}`);
  const files = (await res.json()) as { name: string; type: string; download_url: string | null }[];

  const items = await Promise.all(
    files
      .filter((f) => f.type === "file" && f.name.endsWith(".md") && f.download_url)
      .map(async (f): Promise<Article> => {
        const r = await fetch(f.download_url!, { headers });
        const { meta, body } = parseFrontmatter(await r.text());
        const h1 = body.match(/^#\s+(.+)$/m);
        const id = String(meta.id || f.name.replace(/\.md$/, ""));
        return {
          id,
          title: String(meta.title || h1?.[1] || id),
          category: String(meta.category || "general"),
          tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
          sources: (Array.isArray(meta.sources) ? meta.sources : [])
            .filter((s: any) => s && s.url)
            .map((s: any) => ({ title: String(s.title || s.url), url: String(s.url) })),
          body,
        };
      })
  );
  items.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  cache = { at: Date.now(), items };
  return items;
}

// ───────────────────────── Поиск ─────────────────────────

const tokenize = (q: string) =>
  q.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter(Boolean);

// Подстрочное совпадение + грубое «отрезание» окончания для длинных слов (русская морфология)
const hit = (hay: string, t: string) => hay.includes(t) || (t.length > 5 && hay.includes(t.slice(0, -2)));

function score(a: Article, terms: string[]): number {
  const title = a.title.toLowerCase();
  const body = a.body.toLowerCase();
  const tags = a.tags.map((t) => t.toLowerCase());
  let s = 0;
  for (const t of terms) {
    if (a.id.toLowerCase().includes(t)) s += 6;
    if (hit(title, t)) s += 5;
    if (tags.includes(t)) s += 8;
    else if (tags.some((g) => g.includes(t))) s += 4;
    if (a.category.toLowerCase() === t) s += 3;
    if (hit(body, t)) s += 1;
  }
  return s;
}

function search(items: Article[], q: string): Article[] {
  const exact = items.find((a) => a.id.toLowerCase() === q.trim().toLowerCase());
  const terms = tokenize(q);
  const ranked = items
    .map((a) => ({ a, s: score(a, terms) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .map((x) => x.a);
  return exact ? [exact, ...ranked.filter((a) => a.id !== exact.id)] : ranked;
}

function similar(items: Article[], base: Article): Article[] {
  return items
    .filter((a) => a.id !== base.id)
    .map((a) => ({
      a,
      s: a.tags.filter((t) => base.tags.includes(t)).length * 3 + (a.category === base.category ? 1 : 0),
    }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, 3)
    .map((x) => x.a);
}

// ───────────────────────── CLI: ANSI-вывод ─────────────────────────

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", underline: "\x1b[4m",
  green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m",
  magenta: "\x1b[35m", cyan: "\x1b[36m", gray: "\x1b[90m",
};
type Painter = (code: string, s: string) => string;
const painter = (color: boolean): Painter => (code, s) => (color ? code + s + C.reset : s);

function inlineAnsi(s: string, p: Painter): string {
  return s
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, t, u) => `${t} (${p(C.underline + C.blue, u)})`)
    .replace(/`([^`]+)`/g, (_, c) => p(C.cyan, c))
    .replace(/\*\*([^*]+)\*\*/g, (_, b) => p(C.bold, b));
}

function highlightLine(line: string, lang: string, p: Painter): string {
  const strs = (s: string) => s.replace(/("(?:\\.|[^"\\])*"|'[^']*')/g, (m) => p(C.green, m));
  if (lang === "json") {
    return line.replace(
      /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?\b)/g,
      (_m, s, colon, kw, num) =>
        s ? (colon ? p(C.cyan, s) + colon : p(C.green, s)) : kw ? p(C.magenta, kw) : p(C.yellow, num)
    );
  }
  if (/^\s*#/.test(line)) return p(C.gray, line);
  if (["bash", "sh", "shell", "zsh", "console"].includes(lang)) {
    const m = line.match(/^(\s*(?:sudo\s+)?)([\w./-]+)(.*)$/);
    const head = m ? m[1] + p(C.bold + C.cyan, m[2]) : "";
    const rest = m ? m[3] : line;
    return (
      head +
      rest.replace(
        /("(?:\\.|[^"\\])*"|'[^']*')|(\s--?[A-Za-z][\w-]*)|(\$\{?\w+\}?)|(\s#.*$)/g,
        (_m, s, flag, v, cm) => {
          if (s) return p(C.green, s);
          if (flag) { const t = flag.trimStart(); return flag.slice(0, flag.length - t.length) + p(C.yellow, t); }
          if (v) return p(C.magenta, v);
          return p(C.gray, cm);
        }
      )
    );
  }
  if (/^\s*\[.+\]\s*$/.test(line)) return p(C.bold + C.magenta, line);
  const kv = line.match(/^(\s*-?\s*)([A-Za-z_][\w.-]*)(\s*[:=])(.*)$/);
  if (kv) return kv[1] + p(C.cyan, kv[2]) + kv[3] + strs(kv[4]);
  return strs(line);
}

function codeFrame(lang: string, code: string, p: Painter): string[] {
  const label = lang || "text";
  const lines = code.replace(/\t/g, "  ").split("\n");
  const len = (l: string) => [...l].length;
  const width = Math.max(label.length + 4, 24, ...lines.map(len));
  const inner = width + 2;
  const out = [p(C.gray, `┌─ ${label} ${"─".repeat(inner - label.length - 3)}┐`)];
  for (const line of lines) {
    out.push(`${p(C.gray, "│")} ${highlightLine(line, lang, p)}${" ".repeat(width - len(line))} ${p(C.gray, "│")}`);
  }
  out.push(p(C.gray, `└${"─".repeat(inner)}┘`));
  return out;
}

function renderArticleAnsi(a: Article, color: boolean): string {
  const p = painter(color);
  const out: string[] = [];
  out.push(`${p(C.bold + C.blue, "🔬 RESEARCH CENTRE")} ${p(C.gray, "//")} ${p(C.bold + C.green, "KNOWLEDGE BASE")} ${p(C.gray, "|")} ${p(C.green, a.category)}`);
  out.push(p(C.gray, "═".repeat(60)));
  out.push(`📌 ${p(C.bold + C.yellow, a.title)}`);
  if (a.tags.length) out.push(p(C.gray, a.tags.map((t) => "#" + t).join(" ")));
  out.push("");
  let summary = false;
  let codeLabel = false;
  for (const b of parseBlocks(a.body)) {
    if (b.t === "h") {
      if (b.level === 1) continue;
      out.push(p(C.bold + C.magenta, `▌ ${b.text}`));
    } else if (b.t === "p") {
      out.push((summary ? "" : "📝 ") + inlineAnsi(b.text, p));
      summary = true;
      out.push("");
    } else if (b.t === "li") {
      out.push(`  • ${inlineAnsi(b.text, p)}`);
    } else {
      if (!codeLabel) { out.push(p(C.bold, "💻 Команды / конфигурация")); codeLabel = true; }
      out.push(...codeFrame(b.lang, b.code, p), "");
    }
  }
  if (a.sources.length) {
    out.push(p(C.bold, "🔗 Первоисточники:"));
    for (const s of a.sources) out.push(`  • ${s.title}`, `    ${p(C.underline + C.blue, s.url)}`);
  }
  return out.join("\n");
}

function renderIndexAnsi(items: Article[], color: boolean, note = ""): string {
  const p = painter(color);
  const out = [
    `${p(C.bold + C.blue, "🔬 RESEARCH CENTRE")} ${p(C.gray, "//")} ${p(C.bold + C.green, "KNOWLEDGE BASE")}`,
    p(C.gray, "═".repeat(60)),
  ];
  if (note) out.push(note, "");
  let cat = "";
  for (const a of items) {
    if (a.category !== cat) { cat = a.category; out.push(p(C.bold + C.magenta, `▌ ${cat}`)); }
    out.push(`  ${p(C.cyan, a.id)} — ${a.title}`);
  }
  out.push("", p(C.gray, "Использование: kb <запрос>  |  kb <id>  |  kb list"));
  return out.join("\n");
}

async function handleCli(url: URL, env: Env): Promise<Response> {
  const q = (url.searchParams.get("q") || "").trim();
  const color = !["1", "true"].includes(url.searchParams.get("plain") || "");
  const p = painter(color);
  const headers = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" };
  try {
    const items = await loadArticles(env);
    if (!q || q.toLowerCase() === "list") {
      return new Response(renderIndexAnsi(items, color) + "\n", { headers });
    }
    const found = search(items, q);
    if (!found.length) {
      const msg = `${p(C.bold, "Ничего не найдено по запросу")} "${q}".`;
      return new Response(renderIndexAnsi(items, color, msg) + "\n", { status: 404, headers });
    }
    let text = renderArticleAnsi(found[0], color);
    if (found.length > 1) {
      text += `\n\n${p(C.bold, "Ещё по запросу:")}\n` +
        found.slice(1, 5).map((a) => `  ${p(C.cyan, "kb " + a.id)} — ${a.title}`).join("\n");
    }
    return new Response(text + "\n", { headers });
  } catch (e) {
    return new Response(`🔬 RESEARCH CENTRE: ошибка загрузки базы знаний (${(e as Error).message})\n`, { status: 502, headers });
  }
}

// ───────────────────────── Telegram ─────────────────────────

const BRAND = "🔬 <b>Research Centre</b>";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inlineHtml(s: string): string {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

async function tg(env: Env, method: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!data.ok) console.error("Telegram error", method, JSON.stringify(data));
  return data;
}

const send = (env: Env, chatId: number, text: string, reply_markup?: unknown) =>
  tg(env, "sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4090),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup,
  });

type Kb = { text: string; callback_data: string }[][];

const menuKb = (): Kb => [
  [{ text: "📚 Все статьи", callback_data: "all" }, { text: "📌 Избранное", callback_data: "fav" }],
  [{ text: "💻 Терминал (CLI)", callback_data: "cli" }],
];

function codeParts(code: string, lang: string): string[] {
  const safeLang = lang.replace(/[^\w+-]/g, "");
  const open = `<pre><code${safeLang ? ` class="language-${safeLang}"` : ""}>`;
  const close = "</code></pre>";
  const max = TG_LIMIT - open.length - close.length - 50;
  const chunks: string[] = [];
  let cur = "";
  for (const line of code.split("\n")) {
    const l = esc(line).slice(0, max);
    if (cur && cur.length + l.length + 1 > max) { chunks.push(cur); cur = ""; }
    cur += l + "\n";
  }
  if (cur) chunks.push(cur);
  return chunks.map((c) => open + c.replace(/\n$/, "") + close);
}

function paginate(parts: string[]): string[] {
  const pages: string[] = [];
  let cur = "";
  for (const part of parts) {
    if (cur && cur.length + part.length + 1 > TG_LIMIT) { pages.push(cur); cur = ""; }
    cur += (cur ? "\n" : "") + part;
  }
  if (cur) pages.push(cur);
  return pages;
}

function articleParts(a: Article): string[] {
  const parts = [`${BRAND}\n📌 <b>${esc(a.title)}</b> · <i>${esc(a.category)}</i>`];
  if (a.tags.length) parts.push(esc(a.tags.map((t) => "#" + t.replace(/\W/g, "_")).join(" ")));
  parts.push("");
  for (const b of parseBlocks(a.body)) {
    if (b.t === "h") { if (b.level > 1) parts.push(`\n<b>${esc(b.text)}</b>`); }
    else if (b.t === "p") parts.push(inlineHtml(b.text) + "\n");
    else if (b.t === "li") parts.push(`• ${inlineHtml(b.text)}`);
    else parts.push(...codeParts(b.code, b.lang));
  }
  if (a.sources.length) {
    parts.push("\n🔗 <b>Первоисточники / Официальная документация</b>");
    for (const s of a.sources) parts.push(`• <a href="${esc(s.url)}">${esc(s.title)}</a>`);
  }
  return parts;
}

const hasCode = (a: Article) => parseBlocks(a.body).some((b) => b.t === "code");

function actionBar(a: Article, isFav: boolean): Kb {
  const row1 = [];
  if (hasCode(a)) row1.push({ text: "📋 Скопировать код", callback_data: `c:${a.id}` });
  row1.push({ text: isFav ? "✅ В избранном" : "📌 В Избранное", callback_data: `f:${a.id}` });
  return [row1, [
    { text: "🏷️ Похожие темы", callback_data: `r:${a.id}` },
    { text: "⬅️ Назад", callback_data: "b" },
  ]];
}

const favKey = (uid: number) => `fav:${uid}`;
async function getFavs(env: Env, uid: number): Promise<string[]> {
  return ((await env.KB_KV.get(favKey(uid), "json")) as string[] | null) || [];
}

async function showArticle(env: Env, chatId: number, uid: number, a: Article) {
  const pages = paginate(articleParts(a));
  const favs = await getFavs(env, uid);
  for (let i = 0; i < pages.length; i++) {
    await send(env, chatId, pages[i], i === pages.length - 1 ? { inline_keyboard: actionBar(a, favs.includes(a.id)) } : undefined);
  }
}

function listKb(list: Article[]): Kb {
  return [
    ...list.map((a) => [{ text: `📌 ${a.title}`.slice(0, 60), callback_data: `a:${a.id}` }]),
    [{ text: "🏠 Меню", callback_data: "menu" }],
  ];
}

async function doSearch(env: Env, chatId: number, q: string) {
  const items = await loadArticles(env);
  const found = search(items, q).slice(0, 8);
  await env.KB_KV.put(`last:${chatId}`, q, { expirationTtl: 86400 });
  if (!found.length) {
    await send(env, chatId, `${BRAND}\n\nПо запросу «${esc(q)}» ничего не найдено.\nПопробуйте другое слово или откройте список статей.`, { inline_keyboard: menuKb() });
    return;
  }
  const lines = found.map((a, i) => `${i + 1}. <b>${esc(a.title)}</b> · <i>${esc(a.category)}</i>`);
  await send(env, chatId, `${BRAND}\n🔎 Результаты по «${esc(q)}»:\n\n${lines.join("\n")}`, { inline_keyboard: listKb(found) });
}

function aliasLine(origin: string): string {
  return `alias kb='f() { curl -sG --data-urlencode "q=$*" "${origin}/cli"; }; f'`;
}

async function sendCliHelp(env: Env, chatId: number, origin: string) {
  const text = [
    BRAND,
    "💻 <b>Терминал (CLI)</b>",
    "",
    "<b>1. Быстрый запрос без установки:</b>",
    `<pre><code class="language-bash">curl -s "${esc(origin)}/cli?q=docker"</code></pre>`,
    "<b>2. Короткая команда <code>kb</code>.</b> Добавьте в <code>~/.bashrc</code> или <code>~/.zshrc</code>:",
    `<pre><code class="language-bash">${esc(aliasLine(origin))}</code></pre>`,
    "Затем: <code>source ~/.bashrc</code> и пользуйтесь:",
    "<pre><code class=\"language-bash\">kb vless\nkb docker-compose\nkb iptables\nkb list</code></pre>",
  ].join("\n");
  await send(env, chatId, text, { inline_keyboard: [[{ text: "📋 Скопировать команду алиаса", callback_data: "alias" }], [{ text: "🏠 Меню", callback_data: "menu" }]] });
}

async function sendFavs(env: Env, chatId: number, uid: number) {
  const items = await loadArticles(env);
  const favs = (await getFavs(env, uid)).map((id) => items.find((a) => a.id === id)).filter(Boolean) as Article[];
  if (!favs.length) {
    await send(env, chatId, `${BRAND}\n📌 Избранное пока пусто. Откройте статью и нажмите «В Избранное».`, { inline_keyboard: menuKb() });
    return;
  }
  await send(env, chatId, `${BRAND}\n📌 <b>Избранное</b>`, { inline_keyboard: listKb(favs) });
}

async function sendAll(env: Env, chatId: number) {
  const items = await loadArticles(env);
  await send(env, chatId, `${BRAND}\n📚 <b>Все статьи</b> (${items.length})`, { inline_keyboard: listKb(items.slice(0, 30)) });
}

async function sendWelcome(env: Env, chatId: number) {
  await send(env, chatId, [
    BRAND,
    "",
    "База знаний по Linux, DevOps, сетям, виртуализации и безопасности.",
    "Отправьте любое слово для поиска, например <code>docker</code>, или используйте <code>/search &lt;запрос&gt;</code>.",
    "",
    "Команды: /search · /fav · /all · /cli · /help",
  ].join("\n"), { inline_keyboard: menuKb() });
}

async function handleCallback(cb: any, env: Env, origin: string) {
  const data: string = cb.data || "";
  const chatId: number = cb.message.chat.id;
  const uid: number = cb.from.id;
  const sep = data.indexOf(":");
  const kind = sep === -1 ? data : data.slice(0, sep);
  const id = sep === -1 ? "" : data.slice(sep + 1);
  let toast: string | undefined;

  if (kind === "f") {
    const favs = await getFavs(env, uid);
    const has = favs.includes(id);
    const next = has ? favs.filter((x) => x !== id) : [...favs, id];
    await env.KB_KV.put(favKey(uid), JSON.stringify(next));
    toast = has ? "Удалено из избранного" : "Добавлено в избранное";
    const a = (await loadArticles(env)).find((x) => x.id === id);
    if (a) await tg(env, "editMessageReplyMarkup", { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: actionBar(a, !has) } });
  }
  await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: toast });

  switch (kind) {
    case "a": {
      const a = (await loadArticles(env)).find((x) => x.id === id);
      if (a) await showArticle(env, chatId, uid, a);
      break;
    }
    case "c": {
      const a = (await loadArticles(env)).find((x) => x.id === id);
      if (!a) break;
      const blocks = parseBlocks(a.body).filter((b): b is Extract<Block, { t: "code" }> => b.t === "code");
      for (let i = 0; i < blocks.length; i++) {
        const parts = codeParts(blocks[i].code, blocks[i].lang);
        await send(env, chatId, `📋 Блок ${i + 1}/${blocks.length} — нажмите на код, чтобы скопировать\n${parts[0]}`);
        for (const extra of parts.slice(1)) await send(env, chatId, extra);
      }
      break;
    }
    case "r": {
      const items = await loadArticles(env);
      const base = items.find((x) => x.id === id);
      const rel = base ? similar(items, base) : [];
      await send(env, chatId, rel.length ? `${BRAND}\n🏷️ Похожие темы:` : `${BRAND}\nПохожих статей пока нет.`, { inline_keyboard: listKb(rel) });
      break;
    }
    case "b": {
      const last = await env.KB_KV.get(`last:${chatId}`);
      if (last) await doSearch(env, chatId, last);
      else await sendWelcome(env, chatId);
      break;
    }
    case "menu": await sendWelcome(env, chatId); break;
    case "all": await sendAll(env, chatId); break;
    case "fav": await sendFavs(env, chatId, uid); break;
    case "cli": await sendCliHelp(env, chatId, origin); break;
    case "alias":
      await send(env, chatId, `📋 Нажмите на команду, чтобы скопировать:\n<pre><code class="language-bash">${esc(aliasLine(origin))}</code></pre>`);
      break;
  }
}

async function handleUpdate(u: any, env: Env, origin: string) {
  if (u.callback_query) return handleCallback(u.callback_query, env, origin);
  const m = u.message;
  if (!m?.text) return;
  const chatId: number = m.chat.id;
  const uid: number = m.from?.id ?? chatId;
  const text: string = m.text.trim();
  const cmd = text.match(/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  if (!cmd) return doSearch(env, chatId, text);
  const arg = (cmd[2] || "").trim();
  switch (cmd[1].toLowerCase()) {
    case "start":
    case "help": return sendWelcome(env, chatId);
    case "search":
      return arg ? doSearch(env, chatId, arg) : send(env, chatId, `${BRAND}\nУкажите запрос: <code>/search docker</code>`);
    case "cli": return sendCliHelp(env, chatId, origin);
    case "fav": return sendFavs(env, chatId, uid);
    case "all": return sendAll(env, chatId);
    default: return sendWelcome(env, chatId);
  }
}

// ───────────────────────── Роутинг ─────────────────────────

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/cli") return handleCli(url, env);
    if (req.method === "POST" && url.pathname === "/telegram-webhook") {
      if (env.WEBHOOK_SECRET && req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }
      const update: any = await req.json();
      const allowed = (env.ALLOWED_USERS || "").split(",").map((x) => x.trim()).filter(Boolean);
      const from = update?.message?.from?.id ?? update?.callback_query?.from?.id;
      if (allowed.length && !allowed.includes(String(from))) return new Response("ok");
      ctx.waitUntil(handleUpdate(update, env, url.origin).catch((e) => console.error("update failed", e)));
      return new Response("ok");
    }
    if (url.pathname === "/") return new Response("🔬 Research Centre API is running\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
