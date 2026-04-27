"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Cpu,
  Tag,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { fetchUsageStats, type UsageStats, type UsageStatBucket } from "@/lib/api";
import { cn } from "@/lib/utils";

const MODEL_NAME_MAP: Record<string, string> = {
  "gemini-3.1-pro": "Gemini 3.1 Pro",
  "deepseek-v4-flash": "DeepSeek V4 Flash",
  "deepseek-v4-pro": "DeepSeek V4 Pro",
};

export function UsageStatsPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchUsageStats();
      setStats(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [refreshKey]);

  return (
    <div className="rounded-xl border border-sage-100 bg-white/80">
      <div className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="btn-press flex min-w-0 flex-1 items-center gap-2 rounded text-left"
          aria-expanded={open}
        >
          <BarChart3 className="h-4 w-4 shrink-0 text-sage-600" />
          <div className="text-[13px] font-semibold text-ink">用量统计</div>
          {stats && (
            <span className="rounded bg-sage-50 px-1.5 py-0.5 text-[10.5px] text-sage-700">
              共 {stats.counted} 次生成
            </span>
          )}
          <span className="ml-auto inline-flex items-center">
            {open ? (
              <ChevronUp className="h-4 w-4 text-ink-mute" />
            ) : (
              <ChevronDown className="h-4 w-4 text-ink-mute" />
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="btn-press inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-mute transition-colors hover:bg-sage-50 hover:text-sage-700"
          aria-label="刷新"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-sage-100 px-3.5 py-3">
          {error && (
            <div className="rounded-md bg-red-50 px-2.5 py-1.5 text-[11.5px] text-red-700">
              {error}
            </div>
          )}
          {!stats && !error && (
            <div className="text-[12px] text-ink-mute">正在加载……</div>
          )}
          {stats && (
            <>
              <Summary stats={stats} />
              <Group icon={Cpu} title="按模型" buckets={stats.by_model} mapName={MODEL_NAME_MAP} tone="sky" />
              <Group icon={Tag} title="按领域（粗分）" buckets={stats.by_domain} tone="emerald" />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Summary({ stats }: { stats: UsageStats }) {
  const t = stats.tokens;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 text-[11.5px]">
        <Stat label="累计任务" value={stats.total} />
        <Stat label="成功" value={stats.completed} tone="ok" />
        <Stat label="失败" value={stats.failed} tone={stats.failed > 0 ? "warn" : "muted"} />
      </div>
      {t && (t.prompt > 0 || t.completion > 0) && (
        <div className="rounded-md border border-sky-100 bg-sky-50/50 px-2.5 py-1.5 text-[11px] leading-relaxed text-ink-soft">
          <div>
            输入 token {fmtTok(t.prompt)} · 输出 token {fmtTok(t.completion)}
          </div>
          <div>
            缓存命中 <span className="font-medium text-sky-700 tabular-nums">{fmtTok(t.cached)}</span>
            <span className="ml-1 text-ink-mute">（命中率 {t.cache_hit_ratio}%）</span>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtTok(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "ok" | "warn" | "muted";
}) {
  return (
    <div className="rounded-md border border-sage-100 bg-white px-2 py-1.5">
      <div className="text-[10px] text-ink-mute">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-[14px] font-semibold tabular-nums",
          tone === "ok" && "text-emerald-600",
          tone === "warn" && "text-amber-600",
          tone === "muted" && "text-ink-mute",
          tone === "default" && "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Group({
  icon: Icon,
  title,
  buckets,
  mapName,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  buckets: UsageStatBucket[];
  mapName?: Record<string, string>;
  tone: "sky" | "emerald";
}) {
  if (buckets.length === 0) {
    return (
      <div>
        <Header icon={Icon} title={title} />
        <div className="rounded-md bg-sage-50/50 px-2.5 py-2 text-[11.5px] text-ink-mute">
          暂无数据
        </div>
      </div>
    );
  }
  const barColor =
    tone === "sky"
      ? "bg-sky-200"
      : "bg-emerald-200";
  return (
    <div>
      <Header icon={Icon} title={title} />
      <ul className="space-y-1.5">
        {buckets.map((b) => (
          <li key={b.label} className="text-[11.5px]">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-ink">
                {mapName?.[b.label] ?? b.label}
              </span>
              <span className="shrink-0 text-ink-mute tabular-nums">
                {b.count}　·　{b.percent}%
              </span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded bg-sage-50">
              <div
                className={cn("h-full rounded", barColor)}
                style={{ width: `${Math.max(2, b.percent)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Header({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-ink-soft">
      <Icon className="h-3 w-3" />
      {title}
    </div>
  );
}
