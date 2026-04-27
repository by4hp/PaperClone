# PaperClone Usage Stats Widget

A public, read-only widget showing aggregated usage of the PaperClone exam-paper generator: total runs, success/failure split, per-model usage, and rough domain distribution. Designed to be embedded into any external website (personal homepage, blog, project showcase) without auth.

> Optimized for drop-in by AI coding assistants (Claude Code / Cursor / etc.). All snippets below are self-contained — copy-paste, set the base URL, done.

---

## TL;DR

- **API**: `GET https://shijuan.heydee.cc/api/stats` → JSON. `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=60`.
- **Iframe**: `<iframe src="https://shijuan.heydee.cc/widgets/stats" width="360" height="480" style="border:0"></iframe>`
- **Custom**: fetch the JSON, render however your site already styles cards.

---

## 1 · HTTP API

### Request

```
GET https://shijuan.heydee.cc/api/stats
```

No auth, no parameters, no method other than GET. Public read-only.

### Response

```json
{
  "total": 9,
  "counted": 9,
  "completed": 7,
  "failed": 2,
  "by_model": [
    { "label": "gemini-3.1-pro",   "count": 6, "percent": 66.7 },
    { "label": "deepseek-v4-pro",  "count": 2, "percent": 22.2 },
    { "label": "未记录",            "count": 1, "percent": 11.1 }
  ],
  "by_domain": [
    { "label": "法规/合规", "count": 4, "percent": 44.4 },
    { "label": "其他",      "count": 5, "percent": 55.6 }
  ],
  "by_paper_type": [
    { "label": "法规知识测试", "count": 4, "percent": 44.4 }
  ]
}
```

### Field semantics

| Field | Meaning |
|---|---|
| `total` | All known jobs in the store (including in-progress and historical). |
| `counted` | Subset that actually consumed an LLM call (completed + failed + still running). All percent fields are over `counted`. |
| `completed` / `failed` | Terminal counts among `total`. |
| `by_model[]` | Per-model usage. `label` is the raw model id (`gemini-3.1-pro`, `deepseek-v4-flash`, `deepseek-v4-pro`); `未记录` = jobs created before the field was added. |
| `by_domain[]` | Rough keyword classifier on `paper_type_name + title`. Categories: `法规/合规`, `公考/事业单位`, `安全/质量`, `数学`, `英语`, `理综`, `文综/政史`, `入职/培训`, `党建/理论`, `其他`. |
| `by_paper_type[]` | Per-paper-type usage. Empty when no jobs carry a paper-type name. |

All `*_buckets` are pre-sorted by `count` descending.

### Caching & CORS

- `Cache-Control: public, max-age=60` — clients/CDNs may cache for 60 seconds.
- `Access-Control-Allow-Origin: *` — fetch from any origin without proxying.
- Counts are computed on each request from the server-side job store.

### Failure modes

- 5xx if the backend is down. Treat as "data unavailable" — render the widget shell with a retry button rather than blanking the page.
- The `未记录` bucket may shrink over time as old jobs expire; do not hide it manually.

---

## 2 · Iframe embed (most universal)

Drops into any HTML, Markdown-with-HTML, Notion, blog post, etc.:

```html
<iframe
  src="https://shijuan.heydee.cc/widgets/stats"
  width="360" height="480"
  loading="lazy"
  style="border:0;background:transparent"
  title="PaperClone 用量统计"
></iframe>
```

The iframe page (`/widgets/stats`) ships with no site chrome and a transparent background, so it blends into the host page. Default minimum useful size is **320×420**; comfortable size is **360×480**. It scales gracefully wider but the bars look stretched past ~500px.

To recolor the panel to match your site, see "§5 Styling" below.

---

## 3 · Vanilla JS embed (no framework)

For a hand-styled widget that matches your site's typography exactly:

```html
<div id="paperclone-stats" data-paperclone-base="https://shijuan.heydee.cc"></div>

<script>
(async function () {
  const root = document.getElementById('paperclone-stats');
  const base = root.dataset.paperconeBase || 'https://shijuan.heydee.cc';
  try {
    const stats = await fetch(base + '/api/stats').then(r => r.json());
    const fmt = b =>
      `<li style="display:flex;justify-content:space-between;gap:12px;font-size:13px;line-height:1.6;">
         <span>${b.label}</span>
         <span style="color:#666;font-variant-numeric:tabular-nums">${b.count} · ${b.percent}%</span>
       </li>`;
    root.innerHTML = `
      <section style="font-family:system-ui,sans-serif;color:#222;max-width:360px;">
        <h3 style="margin:0 0 8px;font-size:14px;">PaperClone 用量统计</h3>
        <p style="margin:0 0 12px;color:#666;font-size:12px;">
          累计 ${stats.total} 次 · 成功 ${stats.completed} · 失败 ${stats.failed}
        </p>
        <h4 style="margin:8px 0 4px;font-size:12px;color:#666">按模型</h4>
        <ul style="list-style:none;padding:0;margin:0">${stats.by_model.map(fmt).join('')}</ul>
        <h4 style="margin:12px 0 4px;font-size:12px;color:#666">按领域</h4>
        <ul style="list-style:none;padding:0;margin:0">${stats.by_domain.map(fmt).join('')}</ul>
      </section>`;
  } catch (e) {
    root.innerHTML = '<p style="color:#c00;font-size:12px">用量数据暂时获取失败</p>';
  }
})();
</script>
```

The data attribute makes the base URL configurable per page; rendering uses inline styles so it requires no CSS reset.

---

## 4 · React component (drop-in)

A self-contained component, no external deps:

```tsx
"use client";
import { useEffect, useState } from "react";

type Bucket = { label: string; count: number; percent: number };
type Stats = {
  total: number; counted: number; completed: number; failed: number;
  by_model: Bucket[]; by_domain: Bucket[]; by_paper_type: Bucket[];
};

const MODEL_ALIAS: Record<string, string> = {
  "gemini-3.1-pro":   "Gemini 3.1 Pro",
  "deepseek-v4-flash":"DeepSeek V4 Flash",
  "deepseek-v4-pro":  "DeepSeek V4 Pro",
};

export function PaperCloneStats({
  baseUrl = "https://shijuan.heydee.cc",
  className = "",
}: { baseUrl?: string; className?: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${baseUrl}/api/stats`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setStats)
      .catch(() => setError("数据暂不可用"));
  }, [baseUrl]);

  if (error) return <div className={className}>{error}</div>;
  if (!stats) return <div className={className}>加载中…</div>;

  const Bar = ({ b, color }: { b: Bucket; color: string }) => (
    <li style={{ marginBottom: 6, fontSize: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{MODEL_ALIAS[b.label] ?? b.label}</span>
        <span style={{ color: "#666", fontVariantNumeric: "tabular-nums" }}>
          {b.count} · {b.percent}%
        </span>
      </div>
      <div style={{ height: 4, background: "#f1f3ee", borderRadius: 2, marginTop: 4 }}>
        <div style={{ width: `${Math.max(2, b.percent)}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
    </li>
  );

  return (
    <section className={className} style={{ fontFamily: "system-ui, sans-serif", maxWidth: 360 }}>
      <header style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>PaperClone 用量</strong>
        <span style={{ color: "#666", fontSize: 12 }}>共 {stats.counted} 次生成</span>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
        <Stat label="累计" value={stats.total} />
        <Stat label="成功" value={stats.completed} color="#10b981" />
        <Stat label="失败" value={stats.failed} color={stats.failed > 0 ? "#f59e0b" : "#999"} />
      </div>
      <h4 style={{ fontSize: 12, color: "#666", margin: "8px 0 4px" }}>按模型</h4>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {stats.by_model.map(b => <Bar key={b.label} b={b} color="#bae0ff" />)}
      </ul>
      <h4 style={{ fontSize: 12, color: "#666", margin: "12px 0 4px" }}>按领域</h4>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {stats.by_domain.map(b => <Bar key={b.label} b={b} color="#bbf7d0" />)}
      </ul>
    </section>
  );
}

function Stat({ label, value, color = "#222" }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 6, padding: "6px 8px" }}>
      <div style={{ fontSize: 10, color: "#999" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
```

Usage:

```tsx
import { PaperCloneStats } from "./PaperCloneStats";

<PaperCloneStats className="my-card" />
```

The component is style-token agnostic — the inline styles use neutral defaults; pass a `className` if your site has a card primitive you want to inherit from.

---

## 5 · Styling

Both the iframe and the React/JS embeds use:

| Token | Default | Purpose |
|---|---|---|
| Page background | transparent | blends into host site |
| Card border | `#eee` / `#sage-100` | panel chrome |
| Bar (model) | sky / `#bae0ff` | per-model bar fill |
| Bar (domain) | emerald / `#bbf7d0` | per-domain bar fill |
| Success accent | `#10b981` | 成功 stat |
| Failure accent | `#f59e0b` (when > 0) | 失败 stat |
| Numerics | `font-variant-numeric: tabular-nums` | aligned digit columns |

For the **iframe**, you can layer your own background and rounded-corner wrapper around it:

```html
<div style="border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 1px 4px #0001">
  <iframe src="https://shijuan.heydee.cc/widgets/stats" width="360" height="480" style="border:0;display:block"></iframe>
</div>
```

For the **JS / React** embed, override colors by tweaking the inline styles directly — they're intentionally simple to make this easy.

---

## 6 · Refresh strategy

The endpoint is cheap (server-side dict aggregation, no DB). Reasonable patterns:

- **Static iframe**: leave it; let the user reload the host page to refresh.
- **Live**: re-fetch every 60s (`setInterval(load, 60_000)`) — aligns with the API's `max-age=60`.
- **On focus**: re-fetch on `visibilitychange` to refresh when the tab is brought back.

Do **not** poll faster than 30s — the data does not change that often, and you'd just be paying CDN/network round-trips for nothing.

---

## 7 · Versioning

The JSON shape is additive — new buckets or fields may appear over time. **Always treat unknown labels in `by_*` arrays as opaque strings** and render them as-is; do not hard-code an exhaustive switch on `label`.

If we ever need a breaking change, a new path (`/api/v2/stats`) will be introduced; this `/api/stats` URL stays stable.

---

## 8 · For AI coding assistants embedding this in another project

When the user asks "embed PaperClone usage stats on my site":

1. Pick the snippet that matches their site's tech stack (iframe for Notion/markdown, vanilla JS for plain HTML, React component for Next/Vite/CRA).
2. The base URL is `https://shijuan.heydee.cc`. Do not change it unless the user runs their own deployment.
3. Do not add auth headers or query params — the API does not accept them.
4. Do not cache the JSON locally beyond a few minutes — the data updates as new papers are generated.
5. The `未记录` model bucket is expected and meaningful; do not filter it out.
