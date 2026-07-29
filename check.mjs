// Runs on a GitHub Actions schedule (.github/workflows/status-check.yml).
// Polls each endpoint in config.json, appends the result to a rolling
// history file, and regenerates the static status page — both written into
// ./site, which the workflow checks out as the gh-pages branch and pushes
// back. This is the whole "server": no long-running process, no paid host.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// One check every 5 minutes (GitHub Actions' minimum cron granularity) —
// this keeps roughly the last 24 hours of history per endpoint.
const HISTORY_LIMIT = 288;
const SITE_DIR = "site";
const HISTORY_FILE = path.join(SITE_DIR, "history.json");
const INDEX_FILE = path.join(SITE_DIR, "index.html");

const endpoints = JSON.parse(readFileSync("config.json", "utf8"));

async function checkEndpoint(endpoint) {
  const start = Date.now();
  try {
    const res = await fetch(endpoint.url, { signal: AbortSignal.timeout(10000) });
    const responseTimeMs = Date.now() - start;
    const body = endpoint.bodyContains ? await res.text() : null;
    const statusOk = res.status === (endpoint.expectedStatus ?? 200);
    const bodyOk = !endpoint.bodyContains || (body?.includes(endpoint.bodyContains) ?? false);
    return {
      name: endpoint.name,
      url: endpoint.url,
      success: statusOk && bodyOk,
      statusCode: res.status,
      responseTimeMs,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name: endpoint.name,
      url: endpoint.url,
      success: false,
      statusCode: null,
      responseTimeMs: Date.now() - start,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const results = await Promise.all(endpoints.map(checkEndpoint));

if (!existsSync(SITE_DIR)) mkdirSync(SITE_DIR, { recursive: true });

let history = {};
if (existsSync(HISTORY_FILE)) {
  history = JSON.parse(readFileSync(HISTORY_FILE, "utf8"));
}

for (const result of results) {
  const key = result.name;
  history[key] = [...(history[key] ?? []), result].slice(-HISTORY_LIMIT);
}

writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function renderTicks(entries) {
  return entries
    .map((e) => {
      const title = escapeHtml(
        `${e.timestamp} — ${e.success ? "OK" : "DOWN"}${e.error ? `: ${e.error}` : ""} (${e.responseTimeMs}ms)`,
      );
      return `<span class="tick ${e.success ? "up" : "down"}" title="${title}"></span>`;
    })
    .join("");
}

const overallOk = results.every((r) => r.success);
const generatedAt = new Date().toISOString();

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>QuoteASAP Status</title>
<meta name="description" content="Live status of QuoteASAP services." />
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.5rem; }
  nav { margin-bottom: 1.5rem; }
  nav a { margin-right: 1rem; }
  .banner { padding: 0.75rem 1rem; border-radius: 8px; font-weight: 600; margin-bottom: 1.5rem; }
  .banner.up { background: #d1fae5; color: #065f46; }
  .banner.down { background: #fee2e2; color: #991b1b; }
  .endpoint { border: 1px solid #8884; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .endpoint-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 0.5rem; }
  .dot.up { background: #10b981; }
  .dot.down { background: #ef4444; }
  .ticks { display: flex; gap: 2px; overflow-x: auto; padding-bottom: 4px; }
  .tick { display: inline-block; width: 6px; height: 24px; border-radius: 2px; flex-shrink: 0; }
  .tick.up { background: #10b981; }
  .tick.down { background: #ef4444; }
  .meta { color: #888; font-size: 0.85rem; }
</style>
</head>
<body>
<nav>
  <a href="https://web-three-pi-25.vercel.app">App</a>
  <a href="https://help-sandy-iota.vercel.app">Help</a>
  <a href="/">Status</a>
</nav>
<h1>QuoteASAP Status</h1>
<div class="banner ${overallOk ? "up" : "down"}">${overallOk ? "All systems operational" : "Some systems are experiencing issues"}</div>
${results
  .map((r) => {
    const entries = history[r.name] ?? [];
    return `<div class="endpoint">
  <div class="endpoint-header">
    <span><span class="dot ${r.success ? "up" : "down"}"></span><strong>${escapeHtml(r.name)}</strong></span>
    <span class="meta">${r.responseTimeMs}ms</span>
  </div>
  <div class="ticks">${renderTicks(entries)}</div>
  <div class="meta">Last checked ${r.timestamp}</div>
</div>`;
  })
  .join("\n")}
<p class="meta">Checked every 5 minutes via GitHub Actions. Generated ${generatedAt}.</p>
</body>
</html>
`;

writeFileSync(INDEX_FILE, html);
writeFileSync(path.join(SITE_DIR, ".nojekyll"), "");

console.log(JSON.stringify(results, null, 2));

if (!overallOk) {
  console.error("One or more endpoints failed this check.");
}
