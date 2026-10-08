// Research Centre — Cloudflare Worker
// Роуты: POST /telegram-webhook (Telegram), GET /cli?q=<query> (терминал, ANSI)

export interface Env {
  KB_KV?: KVNamespace;
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

const TG_LIMIT = 3800;
const PAGE_SIZE = 8;

// Разделы базы знаний: ключ = значение category во frontmatter статьи
const CATEGORIES: Record<string, { title: string; emoji: string }> = {
  networking: { title: "Сети и прокси", emoji: "🌐" },
  security: { title: "Безопасность", emoji: "🛡️" },
  databases: { title: "Базы данных", emoji: "🗄️" },
  devops: { title: "DevOps и CI/CD", emoji: "🚀" },
  linux: { title: "Linux и системы", emoji: "🐧" },
};
const catInfo = (c: string) => CATEGORIES[c] ?? { title: c, emoji: "📁" };

// ───────────────────────── Frontmatter + Markdown ─────────────────────────

function clean(v: string): string {
  let s = v.trim().replace(/^["']|["']$/g, "");
  const link = s.match(/^\[[^\]]*\]\((https?:\/\/[^)\s]+)\)$/);
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

// ───────────────────────── Загрузка базы знаний из GitHub ─────────────────────────

async function loadArticles(env: Env): Promise<Article[]> {
  // Пробуем взять из Cloudflare KV, если он подтянутый
  if (env.KB_KV) {
    const cached = await env.KB_KV.get("kb_articles_cache", "json");
    if (cached) return cached as Article[];
  }

  const headers: Record<string, string> = {
    "User-Agent": "Research-Centre-Worker",
    Accept: "application/vnd.github.v3+json",
  };
  
  if (env.GITHUB_TOKEN) {
    const tok = env.GITHUB_TOKEN.trim();
    headers.Authorization = tok.startsWith("github_pat_") || tok.startsWith("ghp_")
      ? `token ${tok}`
      : `Bearer ${tok}`;
  }

  const listUrl = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${env.KB_PATH}?ref=${env.GITHUB_BRANCH}`;
  const res = await fetch(listUrl, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 160)}`);
  
  const files = (await res.json()) as { name: string; type: string; download_url: string | null }[];

  const items = await Promise.all(
    files
      .filter((f) => f.type === "file" && f.name.endsWith(".md") && f.download_url)
      .map(async (f): Promise<Article> => {
        const r = await fetch(f.download_url!, { headers });
        if (!r.ok) throw new Error(`GitHub raw ${r.status}: ${f.name}`);
        const rawText = await r.text();
        const { meta, body } = parseFrontmatter(rawText);
        const h1 = body.match(/^#\s+(.+)$/m);
        const id = String(meta.id || f.name.replace(/\.md$/, ""));
        return {
          id,
          title: String(meta.title || h1?.[1] || id),
          category: String(meta.category || "general"),
          tags: Array.isArray(meta.tags) ? meta.tags.map((t) => String(t).toLowerCase()) : [],
          sources: (Array.isArray(meta.sources) ? meta.sources : [])
            .filter((s: any) => s && s.url)
            .map((s: any) => ({ title: String(s.title || s.url), url: String(s.url) })),
          body,
        };
      })
  );

  items.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));

  if (env.KB_KV) {
    await env.KB_KV.put("kb_articles_cache", JSON.stringify(items), { expirationTtl: 300 }); // TTL 5 минут
  }

  return items;
}

// ───────────────────────── Улучшенный поиск ─────────────────────────

const tokenize = (q: string) =>
  q.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter(Boolean);

function score(a: Article, terms: string[], fullQuery: string): number {
  const title = a.title.toLowerCase();
  const body = a.body.toLowerCase();
  const tags = a.tags;
  const id = a.id.toLowerCase();
  let s = 0;

  if (id === fullQuery) s += 20;
  if (title.includes(fullQuery)) s += 15;

  for (const t of terms) {
    if (id.includes(t)) s += 10;
    if (title.includes(t)) s += 8;
    if (tags.some((tag) => tag.includes(t))) s += 12;
    if (a.category.toLowerCase().includes(t)) s += 5;
    if (body.includes(t)) s += 2;
  }
  return s;
}

function search(items: Article[], q: string): Article[] {
  const cleanQ = q.trim().toLowerCase();
  const terms = tokenize(cleanQ);
  if (!terms.length) return [];

  return items
    .map((a) => ({ a, s: score(a, terms, cleanQ) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .map((x) => x.a);
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

// ───────────────────────── CLI Output ─────────────────────────

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

// ───────────────────────── JSON API (для утилиты kb на Node.js) ─────────────────────────

const stripMd = (s: string) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[`*]/g, "");

/** Краткое описание: первый абзац статьи без разметки, не длиннее max символов */
function summaryOf(a: Article, max = 180): string {
  const p = parseBlocks(a.body).find((b) => b.t === "p");
  const t = p && p.t === "p" ? stripMd(p.text).trim() : "";
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

const briefOf = (a: Article) => ({ id: a.id, title: a.title, category: a.category, tags: a.tags, summary: summaryOf(a) });

function findCategory(items: Article[], name: string): string | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const cats = [...new Set(items.map((a) => a.category))];
  return (
    cats.find((c) => c.toLowerCase() === n || catInfo(c).title.toLowerCase() === n) ??
    cats.find((c) => n.length >= 2 && c.toLowerCase().startsWith(n)) ??
    cats.find((c) => n.length >= 3 && catInfo(c).title.toLowerCase().includes(n)) ??
    null
  );
}

async function handleApi(url: URL, env: Env): Promise<Response> {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
    });
  try {
    const items = await loadArticles(env);
    const categories = () => [...new Set(items.map((a) => a.category))].map((c) => ({
      key: c, title: catInfo(c).title, emoji: catInfo(c).emoji, count: items.filter((a) => a.category === c).length,
    }));
    const q = (url.searchParams.get("q") || "").trim();

    switch (url.pathname) {
      case "/api/status":
        return json({ ok: true, service: "research-centre", articles: items.length, categories: categories().length });
      case "/api/categories":
        return json({ categories: categories() });
      case "/api/search": {
        if (!q) return json({ error: "Параметр q обязателен" }, 400);
        const found = search(items, q);
        return json({ query: q, count: found.length, results: found.slice(0, 20).map(briefOf) });
      }
      case "/api/topic": {
        const name = (url.searchParams.get("name") || "").trim();
        if (!name) return json({ error: "Параметр name обязателен", categories: categories() }, 400);
        const key = findCategory(items, name);
        if (!key) return json({ error: `Раздел «${name}» не найден`, categories: categories() }, 404);
        const list = items.filter((a) => a.category === key);
        return json({ category: { key, title: catInfo(key).title, emoji: catInfo(key).emoji, count: list.length }, articles: list.map(briefOf) });
      }
      case "/api/article": {
        const id = (url.searchParams.get("id") || "").trim().toLowerCase();
        if (!id) return json({ error: "Параметр id обязателен" }, 400);
        const a = items.find((x) => x.id.toLowerCase() === id);
        if (!a) return json({ error: `Статья «${id}» не найдена`, suggestions: search(items, id).slice(0, 3).map(briefOf) }, 404);
        return json({ article: { ...briefOf(a), sources: a.sources, body: a.body } });
      }
      default:
        return json({ error: "Неизвестный адрес API", endpoints: ["/api/status", "/api/categories", "/api/search?q=", "/api/topic?name=", "/api/article?id="] }, 404);
    }
  } catch (e) {
    return json({ error: `Не удалось загрузить базу знаний: ${(e as Error).message}` }, 502);
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
  return res.json().catch(() => ({}));
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
  [{ text: "📚 Разделы", callback_data: "all" }, { text: "📌 Избранное", callback_data: "fav" }],
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
  const code = hasCode(a);
  const row1 = [];
  if (code) row1.push({ text: "⚡ Только команды", callback_data: `k:${a.id}` });
  row1.push({ text: isFav ? "✅ В избранном" : "📌 В Избранное", callback_data: `f:${a.id}` });
  const row2 = [];
  if (code) row2.push({ text: "📋 Скопировать код", callback_data: `c:${a.id}` });
  row2.push({ text: "🏷️ Похожие темы", callback_data: `r:${a.id}` });
  return [row1, row2, [
    { text: "⬅️ Назад", callback_data: "b" },
    { text: "📚 Разделы", callback_data: "all" },
  ]];
}

const favKey = (uid: number) => `fav:${uid}`;

async function kvGet(env: Env, key: string): Promise<string | null> {
  try { return env.KB_KV ? await env.KB_KV.get(key) : null; } catch { return null; }
}
async function kvPut(env: Env, key: string, value: string, ttl?: number): Promise<boolean> {
  try {
    if (!env.KB_KV) return false;
    await env.KB_KV.put(key, value, ttl ? { expirationTtl: ttl } : undefined);
    return true;
  } catch { return false; }
}
async function getFavs(env: Env, uid: number): Promise<string[]> {
  try { return JSON.parse((await kvGet(env, favKey(uid))) || "[]"); } catch { return []; }
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
  await kvPut(env, `last:${chatId}`, q, 86400);
  if (!found.length) {
    await send(env, chatId, `${BRAND}\n\nПо запросу «${esc(q)}» ничего не найдено.\nПопробуйте другое слово или откройте список статей.`, { inline_keyboard: menuKb() });
    return;
  }
  const lines = found.map((a, i) => `${i + 1}. <b>${esc(a.title)}</b> · <i>${esc(a.category)}</i>`);
  await send(env, chatId, `${BRAND}\n🔎 Результаты по «${esc(q)}»:\n\n${lines.join("\n")}`, { inline_keyboard: listKb(found) });
}

const pre = (lang: string, code: string) => `<pre><code class="language-${lang}">${esc(code)}</code></pre>`;

function aliasLine(origin: string): string {
  return `alias kb='f() { curl -sG --data-urlencode "q=$*" "${origin}/cli"; }; f'`;
}
const psFunction = (origin: string) =>
  `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\nfunction kb { curl.exe -sG --data-urlencode "q=$args" "${origin}/cli" }`;
const fishFunction = (origin: string) =>
  `function kb\n    curl -sG --data-urlencode "q=$argv" "${origin}/cli"\nend\nfuncsave kb`;

/** Текст для кнопки «Скопировать»: topic = nix | win | fish */
function copySnippet(topic: string, origin: string): { lang: string; code: string; note: string } {
  if (topic === "win") return { lang: "powershell", code: psFunction(origin), note: "вставьте в файл профиля PowerShell (notepad $PROFILE)" };
  if (topic === "fish") return { lang: "fish", code: fishFunction(origin), note: "вставьте в терминал fish" };
  return { lang: "bash", code: aliasLine(origin), note: "добавьте в ~/.bashrc или ~/.zshrc" };
}

const cliMainKb = (): Kb => [
  [{ text: "🐧 Linux / macOS", callback_data: "cli:nix" }, { text: "🪟 Windows", callback_data: "cli:win" }],
  [{ text: "🐟 fish", callback_data: "cli:fish" }, { text: "📖 Примеры", callback_data: "cli:use" }],
  [{ text: "❓ Если не работает", callback_data: "cli:fix" }],
  [{ text: "📋 Скопировать команду алиаса", callback_data: "alias" }],
  [{ text: "🏠 Меню", callback_data: "menu" }],
];
const cliNavKb = (topic: string): Kb => [
  [{ text: "⬅️ К инструкции", callback_data: "cli" }, { text: "📋 Скопировать", callback_data: `alias:${topic}` }],
  [{ text: "🏠 Меню", callback_data: "menu" }],
];

async function sendCliHelp(env: Env, chatId: number, origin: string) {
  const text = [
    BRAND,
    "💻 <b>Терминал (CLI): как это работает</b>",
    "",
    "<b>Что это.</b> Вы вводите в консоли <code>kb docker</code>, и статья из базы знаний появляется прямо в терминале: с цветной подсветкой, готовыми командами в рамках и ссылками на первоисточники. Удобно, когда вы сидите на сервере по SSH и не хотите переключаться на браузер или Telegram.",
    "",
    "<b>Что нужно.</b> Только <code>curl</code>. Он уже есть в Linux, macOS и Windows 10/11, ничего устанавливать не надо.",
    "",
    `<b>Как устроено.</b> Команда <code>kb</code> это короткий псевдоним. Она отправляет ваш запрос на адрес бота (<code>${esc(origin)}</code>), бот ищет статью в базе и возвращает готовый текст. Сама база хранится в репозитории GitHub.`,
    "",
    "<b>Шаг 1. Проверьте, что всё работает</b> (без какой-либо настройки):",
    pre("bash", `curl -s "${origin}/cli?q=docker"`),
    "Если пришла статья, всё в порядке. Дальше настроим короткую команду <code>kb</code>, чтобы не набирать длинный адрес. Если не пришла, откройте «Если не работает».",
    "",
    "<b>Шаг 2.</b> Выберите свою систему кнопкой ниже: там пошаговая инструкция и объяснение каждой команды.",
  ].join("\n");
  await send(env, chatId, text, { inline_keyboard: cliMainKb() });
}

async function sendCliGuide(env: Env, chatId: number, origin: string, topic: string) {
  const o = origin;
  let text: string;
  if (topic === "nix") {
    text = [
      BRAND,
      "🐧 <b>Linux / macOS (bash, zsh)</b>",
      "",
      "<b>Шаг 1. Узнайте свою оболочку:</b>",
      pre("bash", "echo $SHELL"),
      "Если в ответе <code>zsh</code> (это macOS по умолчанию), вы будете править файл <code>~/.zshrc</code>. Если <code>bash</code>, то <code>~/.bashrc</code>. В файле <code>~/.bashrc</code> хранятся ваши настройки терминала, он читается при каждом запуске.",
      "",
      "<b>Шаг 2. Добавьте команду</b> <code>kb</code> одним копированием (для bash). Для zsh замените <code>~/.bashrc</code> на <code>~/.zshrc</code>:",
      pre("bash", `cat >> ~/.bashrc <<'EOF'\n${aliasLine(o)}\nEOF`),
      "Эта команда дописывает одну строку в конец файла и ничего не стирает.",
      "",
      "<b>Что делает эта строка:</b>",
      "• <code>alias kb=...</code> создаёт слово <code>kb</code>, которое запускает всё в кавычках",
      "• <code>curl -s</code> делает запрос без индикатора загрузки",
      "• <code>-G</code> отправляет данные как параметры адреса (GET)",
      "• <code>--data-urlencode \"q=$*\"</code> берёт все слова после <code>kb</code> и безопасно кодирует их (пробелы, русские буквы), поэтому <code>kb docker compose</code> работает",
      "",
      "<b>Шаг 3. Примените без перезапуска терминала:</b>",
      pre("bash", "source ~/.bashrc"),
      "<b>Шаг 4. Проверьте:</b>",
      pre("bash", "kb docker"),
      "На macOS с bash вместо <code>~/.bashrc</code> используйте <code>~/.bash_profile</code>. Чтобы удалить команду, откройте файл (<code>nano ~/.bashrc</code>) и удалите строку с <code>alias kb</code>.",
    ].join("\n");
  } else if (topic === "win") {
    text = [
      BRAND,
      "🪟 <b>Windows (PowerShell)</b>",
      "",
      "Важно: в PowerShell слово <code>curl</code> это псевдоним другой команды (Invoke-WebRequest), и она работает иначе. Поэтому ниже используется <code>curl.exe</code>, настоящий curl, встроенный в Windows 10 и 11.",
      "",
      "<b>Шаг 1. Откройте PowerShell</b> (лучше Windows Terminal: он показывает цвета) и проверьте curl:",
      pre("powershell", "curl.exe --version"),
      "Если команда не найдена, у вас старая версия Windows. Обновитесь или используйте WSL (см. ниже).",
      "",
      "<b>Шаг 2. Создайте файл профиля</b> (он выполняется при каждом запуске PowerShell) и откройте его:",
      pre("powershell", "if (!(Test-Path $PROFILE)) { New-Item -Path $PROFILE -ItemType File -Force }\nnotepad $PROFILE"),
      "<b>Шаг 3. Вставьте в открывшийся файл и сохраните:</b>",
      pre("powershell", psFunction(o)),
      "Первая строка включает UTF-8, чтобы русский текст и значки не превращались в кракозябры. Вторая создаёт команду <code>kb</code>: она передаёт все слова после неё как поисковый запрос.",
      "",
      "<b>Шаг 4. Перезапустите PowerShell</b> и проверьте:",
      pre("powershell", "kb docker"),
      "<b>Если пишет, что выполнение сценариев отключено:</b>",
      pre("powershell", "Set-ExecutionPolicy -Scope CurrentUser RemoteSigned"),
      "<b>Другие варианты:</b> в WSL следуйте инструкции для Linux, в Git Bash как для bash (<code>~/.bashrc</code>). Старый <code>cmd.exe</code> может показывать цветовые коды как <code>←[1m</code>: используйте Windows Terminal.",
    ].join("\n");
  } else if (topic === "fish") {
    text = [
      BRAND,
      "🐟 <b>fish shell</b>",
      "",
      "В fish нет алиасов с телом как в bash, поэтому команда <code>kb</code> задаётся функцией. Вставьте в терминал fish целиком:",
      pre("fish", fishFunction(o)),
      "Что здесь происходит: функция <code>kb</code> отправляет все ваши слова (<code>$argv</code>) как поисковый запрос, а <code>funcsave kb</code> сохраняет её навсегда в <code>~/.config/fish/functions/kb.fish</code>, так что ничего перезапускать не нужно.",
      "",
      "<b>Проверьте:</b>",
      pre("fish", "kb docker"),
      "Чтобы удалить: <code>functions -e kb; rm ~/.config/fish/functions/kb.fish</code>.",
    ].join("\n");
  } else if (topic === "use") {
    text = [
      BRAND,
      "📖 <b>Как пользоваться</b>",
      "",
      pre("bash", "kb vless              # статья про VLESS Reality\nkb docker compose     # несколько слов тоже работают\nkb nginx | less -R    # длинная статья постранично, с цветами\nkb list               # список всех статей по категориям\nkb iptables-basics    # точный id статьи"),
      "<b>Что вы увидите в ответе:</b>",
      "• 📌 заголовок, категория и теги",
      "• 📝 краткое описание",
      "• 💻 команды и конфиги в рамках: их можно выделить мышью и скопировать",
      "• 🔗 первоисточники: документация, форумы и другие материалы со ссылками",
      "",
      "Если подходящих статей несколько, показывается лучшая, а остальные перечислены ниже в разделе «Ещё по запросу» (откройте нужную по её id).",
      "",
      "Поиск идёт по названию, id, тегам и тексту статей. Если ничего не найдено, вы получите список всех статей.",
      "",
      "<b>Без цветов</b> (например, чтобы сохранить в файл или отправить в чат):",
      pre("bash", `curl -sG --data-urlencode "q=docker" --data-urlencode "plain=1" "${o}/cli" > docker.txt`),
    ].join("\n");
  } else {
    text = [
      BRAND,
      "❓ <b>Если не работает</b>",
      "",
      "• <code>kb: command not found</code>: вы не выполнили <code>source</code> или правили не тот файл (проверьте <code>echo $SHELL</code>). Откройте новый терминал и проверьте: <code>type kb</code>.",
      "• <code>curl: command not found</code>: установите curl. Debian и Ubuntu: <code>sudo apt install curl</code>, macOS: <code>brew install curl</code>.",
      "• Вместо цветов странные символы вроде <code>\\033[1m</code> или <code>←[1m</code>: терминал не поддерживает цвета. Возьмите современный терминал (в Windows это Windows Terminal) или вариант без цветов из раздела «Примеры».",
      "• Вместо значков квадраты или кракозябры: проблема кодировки или шрифта. Проверьте <code>locale</code> (нужен UTF-8), в PowerShell строку с <code>OutputEncoding</code>.",
      "• «Ничего не найдено»: это не ошибка, такого слова в статьях нет. Бот покажет список всех статей, выберите id оттуда.",
      "• Пустой ответ или ошибка 502: посмотрите код ответа командой ниже. 502 значит, что Worker не смог загрузить базу с GitHub (обычно из-за лимита запросов), напишите администратору бота.",
      pre("bash", `curl -i "${o}/cli?q=docker&plain=1"`),
      "• В PowerShell ошибка про Invoke-WebRequest: в функции должно быть именно <code>curl.exe</code> с <code>.exe</code>.",
      "• Алиас не работает в вашей оболочке: замените его функцией:",
      pre("bash", `kb() { curl -sG --data-urlencode "q=$*" "${o}/cli"; }`),
    ].join("\n");
  }
  await send(env, chatId, text, { inline_keyboard: cliNavKb(topic === "use" || topic === "fix" ? "nix" : topic) });
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

/** Показывает экран: правит исходное сообщение (если пришло по кнопке), иначе шлёт новое */
async function show(env: Env, cb: any | null, chatId: number, text: string, kb: Kb) {
  if (cb?.message?.message_id) {
    const r = await tg(env, "editMessageText", {
      chat_id: chatId,
      message_id: cb.message.message_id,
      text: text.slice(0, 4090),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: kb },
    });
    if (r.ok || String(r.description || "").includes("not modified")) return;
  }
  await send(env, chatId, text, { inline_keyboard: kb });
}

const cbFits = (data: string) => new TextEncoder().encode(data).length <= 64;

async function showCategories(env: Env, cb: any | null, chatId: number) {
  const items = await loadArticles(env);
  const counts = new Map<string, number>();
  for (const a of items) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
  const known = Object.keys(CATEGORIES).filter((c) => counts.has(c));
  const other = [...counts.keys()].filter((c) => !(c in CATEGORIES)).sort();
  const kb: Kb = [...known, ...other]
    .filter((c) => cbFits(`g:${c}:99`))
    .map((c) => [{ text: `${catInfo(c).emoji} ${catInfo(c).title} (${counts.get(c)})`, callback_data: `g:${c}:0` }]);
  kb.push([{ text: `📖 Все статьи A-Z (${items.length})`, callback_data: "g:*:0" }]);
  kb.push([{ text: "🏠 Меню", callback_data: "menu" }]);
  await show(env, cb, chatId, `${BRAND}\n📚 <b>Разделы базы знаний</b>\nВсего статей: ${items.length}. Выберите раздел:`, kb);
}

async function showCategoryPage(env: Env, cb: any | null, chatId: number, cat: string, page: number) {
  const items = await loadArticles(env);
  const list = cat === "*"
    ? [...items].sort((a, b) => a.title.localeCompare(b.title, "ru"))
    : items.filter((a) => a.category === cat);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const pg = Math.min(Math.max(0, Number.isFinite(page) ? page : 0), pages - 1);
  const slice = list.slice(pg * PAGE_SIZE, pg * PAGE_SIZE + PAGE_SIZE);
  const info = cat === "*" ? { emoji: "📖", title: "Все статьи A-Z" } : catInfo(cat);

  const kb: Kb = slice.map((a) => [{ text: `📌 ${a.title}`.slice(0, 60), callback_data: `a:${a.id}` }]);
  if (pages > 1) {
    kb.push([
      pg > 0 ? { text: "◀️", callback_data: `g:${cat}:${pg - 1}` } : { text: "·", callback_data: "noop" },
      { text: `${pg + 1}/${pages}`, callback_data: "noop" },
      pg < pages - 1 ? { text: "▶️", callback_data: `g:${cat}:${pg + 1}` } : { text: "·", callback_data: "noop" },
    ]);
  }
  kb.push([{ text: "⬅️ Разделы", callback_data: "all" }, { text: "🏠 Меню", callback_data: "menu" }]);
  const head = `${BRAND}\n${info.emoji} <b>${esc(info.title)}</b> · статей: ${list.length}` + (pages > 1 ? ` · страница ${pg + 1} из ${pages}` : "");
  await show(env, cb, chatId, list.length ? head : `${head}\n\nВ этом разделе пока нет статей.`, kb);
}

/** Шпаргалка: только блоки кода статьи, с заголовками разделов */
function cheatsheetParts(a: Article): string[] {
  const parts: string[] = [`${BRAND}\n⚡ <b>Команды: ${esc(a.title)}</b>`];
  let heading = "";
  let printed = true;
  let blocks = 0;
  for (const b of parseBlocks(a.body)) {
    if (b.t === "h") {
      if (b.level > 1) { heading = b.text; printed = false; }
    } else if (b.t === "code") {
      blocks++;
      if (heading && !printed) { parts.push(`\n<b>${esc(heading)}</b>`); printed = true; }
      parts.push(...codeParts(b.code, b.lang));
    }
  }
  if (!blocks) parts.push("\nВ этой статье нет блоков с командами.");
  return parts;
}

async function sendCheatsheet(env: Env, chatId: number, a: Article) {
  const pages = paginate(cheatsheetParts(a));
  for (let i = 0; i < pages.length; i++) {
    const last = i === pages.length - 1;
    await send(env, chatId, pages[i], last ? { inline_keyboard: [
      [{ text: "📖 Открыть статью", callback_data: `a:${a.id}` }, { text: "📋 Копировать по блокам", callback_data: `c:${a.id}` }],
      [{ text: "📚 Разделы", callback_data: "all" }, { text: "🏠 Меню", callback_data: "menu" }],
    ] } : undefined);
  }
}

async function sendWelcome(env: Env, chatId: number) {
  await send(env, chatId, [
    BRAND,
    "",
    "База знаний по Linux, DevOps, сетям, базам данных и безопасности.",
    "",
    "• Отправьте слово для поиска, например <code>docker</code>",
    "• /all открывает разделы со статьями",
    "• В статье есть кнопка «⚡ Только команды»: шпаргалка без лишнего текста",
    "",
    "Команды: /search · /all · /fav · /cli · /help",
  ].join("\n"), { inline_keyboard: menuKb() });
}

async function sendHelp(env: Env, chatId: number) {
  await send(env, chatId, [
    BRAND,
    "<b>Как пользоваться</b>",
    "",
    "🔎 <b>Поиск.</b> Отправьте слово или фразу: <code>docker</code>, <code>wireguard</code>, <code>ssh туннель</code>. Поиск идёт по названию, id, тегам и тексту статей. Команда <code>/search &lt;запрос&gt;</code> делает то же самое.",
    "",
    "📚 <b>Разделы.</b> Команда /all открывает разделы: сети, безопасность, базы данных, DevOps, Linux. Внутри раздела статьи листаются кнопками ◀️ ▶️, а «Все статьи A-Z» показывает всю базу.",
    "",
    "📄 <b>Кнопки под статьёй:</b>",
    "• ⚡ <b>Только команды</b>: только блоки кода с заголовками разделов, без пояснений. Быстрая шпаргалка.",
    "• 📋 <b>Скопировать код</b>: каждый блок отдельным сообщением (нажмите на код, чтобы скопировать).",
    "• 📌 <b>В Избранное</b>: сохранить статью, список открывается командой /fav.",
    "• 🏷️ <b>Похожие темы</b>: соседние статьи.",
    "• ⬅️ <b>Назад</b>: к последнему поиску. 📚 <b>Разделы</b>: к списку разделов.",
    "",
    "💻 <b>Терминал.</b> Команда /cli показывает, как пользоваться этой базой прямо из консоли.",
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
    const saved = await kvPut(env, favKey(uid), JSON.stringify(next));
    toast = !saved ? "Избранное недоступно: к Worker не подключён KV" : has ? "Удалено из избранного" : "Добавлено в избранное";
    const a = saved ? (await loadArticles(env)).find((x) => x.id === id) : undefined;
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
      const last = await kvGet(env, `last:${chatId}`);
      if (last) await doSearch(env, chatId, last);
      else await sendWelcome(env, chatId);
      break;
    }
    case "menu": await sendWelcome(env, chatId); break;
    case "all": await showCategories(env, cb, chatId); break;
    case "g": {
      const i = id.lastIndexOf(":");
      await showCategoryPage(env, cb, chatId, i === -1 ? id : id.slice(0, i), i === -1 ? 0 : Number(id.slice(i + 1)));
      break;
    }
    case "k": {
      const a = (await loadArticles(env)).find((x) => x.id === id);
      if (a) await sendCheatsheet(env, chatId, a);
      break;
    }
    case "noop": break;
    case "fav": await sendFavs(env, chatId, uid); break;
    case "cli": await (id ? sendCliGuide(env, chatId, origin, id) : sendCliHelp(env, chatId, origin)); break;
    case "alias": {
      const c = copySnippet(id, origin);
      await send(env, chatId, `📋 Нажмите на код, чтобы скопировать.\nКуда вставить: ${c.note}.\n${pre(c.lang, c.code)}`);
      break;
    }
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
    case "start": return sendWelcome(env, chatId);
    case "help": return sendHelp(env, chatId);
    case "search":
      return arg ? doSearch(env, chatId, arg) : send(env, chatId, `${BRAND}\nУкажите запрос: <code>/search docker</code>`);
    case "cli": return sendCliHelp(env, chatId, origin);
    case "fav": return sendFavs(env, chatId, uid);
    case "all": return showCategories(env, null, chatId);
    default: return sendWelcome(env, chatId);
  }
}

// ───────────────────────── Routing ─────────────────────────

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/cli") return handleCli(url, env);
    if (req.method === "GET" && url.pathname.startsWith("/api/")) return handleApi(url, env);
    if (req.method === "POST" && url.pathname === "/telegram-webhook") {
      if (env.WEBHOOK_SECRET && req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }
      const update: any = await req.json();
      const allowed = (env.ALLOWED_USERS || "").split(",").map((x) => x.trim()).filter(Boolean);
      const from = update?.message?.from?.id ?? update?.callback_query?.from?.id;
      if (allowed.length && !allowed.includes(String(from))) return new Response("ok");
      ctx.waitUntil(
        handleUpdate(update, env, url.origin).catch(async (e) => {
          console.error("update failed", e);
          const chatId = update?.message?.chat?.id ?? update?.callback_query?.message?.chat?.id;
          if (chatId) {
            const msg = esc(String((e as Error)?.message || e)).slice(0, 500);
            await send(env, chatId, `⚠️ <b>Ошибка</b>\n<code>${msg}</code>`).catch(() => {});
          }
        })
      );
      return new Response("ok");
    }
    if (url.pathname === "/") return new Response("🔬 Research Centre API is running\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
