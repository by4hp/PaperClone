"use client";

import { useEffect, useRef, useState } from "react";
import {
  Clock,
  Download,
  FileText,
  HardDrive,
  Loader2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deleteJob,
  downloadUrl,
  getJob,
  type DownloadVariant,
  type JobResponse,
  type JobStatus,
} from "@/lib/api";
import {
  cachePdf,
  deleteCachedPdf,
  hasCachedPdf,
  loadCachedPdf,
} from "@/lib/local-store";

type Props = {
  jobIds: string[];
  onRemoveJob: (jobId: string) => void;
  onToast: (message: string) => void;
};

const STATUS_LABEL: Record<JobStatus, string> = {
  pending: "排队中",
  parsing: "解析文档",
  generating: "AI 命题中",
  rendering: "排版输出",
  completed: "已完成",
  failed: "失败",
};

// Progress band per stage: [startPct, endPct]. The "generating" band creeps
// over time (LLM is the long tail, ~90s-ish for 55 questions on Gemini 3.1
// Pro high reasoning); other stages are short so we just snap to their floor.
const STAGE_BANDS: Record<JobStatus, [number, number]> = {
  pending: [2, 4],
  parsing: [6, 12],
  generating: [24, 90],
  rendering: [93, 97],
  completed: [100, 100],
  failed: [0, 0],
};

const GENERATING_EST_SECONDS = 120;

export function JobList({ jobIds, onRemoveJob, onToast }: Props) {
  const [jobs, setJobs] = useState<Record<string, JobResponse>>({});

  useEffect(() => {
    if (jobIds.length === 0) return;
    let cancelled = false;
    const inflight = new Set<string>();

    const pollOne = async (id: string) => {
      if (cancelled || inflight.has(id)) return;
      inflight.add(id);
      try {
        const j = await getJob(id);
        if (cancelled) return;
        setJobs((prev) => ({ ...prev, [id]: j }));
        if (j.status !== "completed" && j.status !== "failed") {
          setTimeout(() => {
            inflight.delete(id);
            void pollOne(id);
          }, 1500);
        } else {
          inflight.delete(id);
        }
      } catch {
        inflight.delete(id);
        setTimeout(() => void pollOne(id), 2500);
      }
    };

    jobIds.forEach((id) => void pollOne(id));
    return () => {
      cancelled = true;
    };
  }, [jobIds]);

  if (jobIds.length === 0) return null;

  return (
    <div className="rounded-2xl bg-white/80 p-5 shadow-card">
      <div className="mb-3 text-[15px] font-medium text-ink">任务历史</div>
      <ul className="space-y-2">
        {jobIds.map((id) => {
          const job = jobs[id];
          return (
            <li key={id} className="slide-in-right">
              <JobRow
                job={job}
                jobId={id}
                onRemoveJob={onRemoveJob}
                onToast={onToast}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function JobRow({
  job,
  jobId,
  onRemoveJob,
  onToast,
}: {
  job: JobResponse | undefined;
  jobId: string;
  onRemoveJob: (jobId: string) => void;
  onToast: (message: string) => void;
}) {
  const status = job?.status ?? "pending";
  const done = status === "completed";
  const failed = status === "failed";
  const inFlight = !done && !failed;
  const [deleting, setDeleting] = useState(false);
  const [cached, setCached] = useState(false);
  const [downloading, setDownloading] = useState<DownloadVariant | null>(null);
  const [justCompleted, setJustCompleted] = useState(false);
  const prevStatusRef = useRef<JobStatus | undefined>(undefined);

  const pct = useProgressEstimate(status);

  useEffect(() => {
    const current = job?.status;
    if (current === undefined) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = current;
    // Skip the first observation so pre-completed jobs (e.g. reloaded from
    // history) don't fire the celebration animation on mount.
    if (prev === undefined) return;
    if (prev !== "completed" && current === "completed") {
      setJustCompleted(true);
      onToast(`《${job?.title || "模拟试卷"}》已生成完成`);
      const t = setTimeout(() => setJustCompleted(false), 2400);
      return () => clearTimeout(t);
    }
  }, [job?.status, job?.title, onToast]);

  useEffect(() => {
    if (!done) return;
    let cancelled = false;
    const variants: DownloadVariant[] = ["with-answers", "no-answers"];
    (async () => {
      let anyCached = false;
      for (const variant of variants) {
        if (cancelled) return;
        const already = await hasCachedPdf(jobId, variant);
        if (already) {
          anyCached = true;
          continue;
        }
        try {
          const res = await fetch(downloadUrl(jobId, variant));
          if (!res.ok) continue;
          const blob = await res.blob();
          if (cancelled) return;
          const filename =
            extractFilenameFromContentDisposition(
              res.headers.get("Content-Disposition"),
            ) ?? fallbackFilename(job?.filename ?? `${jobId}.pdf`, variant);
          await cachePdf(
            jobId,
            {
              blob,
              filename,
              title: job?.title ?? "",
              cachedAt: Date.now(),
            },
            variant,
          );
          anyCached = true;
        } catch {
          // Cache failure is non-fatal — user can still download from server.
        }
      }
      if (!cancelled && anyCached) setCached(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [done, jobId, job?.filename, job?.title]);

  async function onDownload(variant: DownloadVariant) {
    if (downloading) return;
    setDownloading(variant);
    try {
      const entry = await loadCachedPdf(jobId, variant);
      if (entry) {
        triggerBlobDownload(entry.blob, entry.filename);
        return;
      }
      const res = await fetch(downloadUrl(jobId, variant));
      if (!res.ok) throw new Error(`下载失败：${res.status}`);
      const blob = await res.blob();
      const filename =
        extractFilenameFromContentDisposition(
          res.headers.get("Content-Disposition"),
        ) ?? fallbackFilename(job?.filename ?? `${jobId}.pdf`, variant);
      triggerBlobDownload(blob, filename);
      void cachePdf(
        jobId,
        {
          blob,
          filename,
          title: job?.title ?? "",
          cachedAt: Date.now(),
        },
        variant,
      ).then(() => setCached(true));
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setDownloading(null);
    }
  }

  async function onDelete() {
    if (!job || deleting) return;
    const ok = window.confirm(`确认删除结果「${job.title || "模拟试卷"}」吗？`);
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteJob(jobId).catch(() => {
        // Server may have already GC'd this job — still remove the local
        // record so the user isn't stuck with a ghost row.
      });
      await deleteCachedPdf(jobId);
      onRemoveJob(jobId);
      onToast("结果已删除");
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className={cn(
        "relative rounded-xl border px-3.5 py-3 transition-colors",
        done && "border-sage-200 bg-sage-50/40",
        failed && "border-red-200 bg-red-50/50",
        inFlight && "border-sage-200 bg-white",
        justCompleted && "done-flash",
      )}
    >
      {justCompleted && <ConfettiBurst />}
      <div className="min-w-0">
          <div className="flex items-start gap-2 text-[13.5px] font-medium leading-snug text-ink">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-mute" />
            <span className="break-words">{job?.title || "模拟试卷"}</span>
          </div>
          {!done && (
            <div className="mt-1 truncate text-xs text-ink-mute">
              {STATUS_LABEL[status]}
            </div>
          )}
          {(done || failed) && (
            <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
              {done && (
                <>
                  <button
                    type="button"
                    onClick={() => onDownload("no-answers")}
                    disabled={downloading !== null}
                    title="仅试卷（不含参考答案）"
                    className={cn(
                      "btn-press inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      downloading === "no-answers"
                        ? "cursor-not-allowed bg-sage-50 text-sage-400"
                        : "bg-sage-50 text-sage-700 hover:bg-sage-100",
                    )}
                  >
                    {downloading === "no-answers" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="h-3 w-3" />
                    )}
                    仅试卷
                  </button>
                  <button
                    type="button"
                    onClick={() => onDownload("with-answers")}
                    disabled={downloading !== null}
                    title="试卷含参考答案与解析"
                    className={cn(
                      "btn-press inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-white transition-colors",
                      downloading === "with-answers"
                        ? "cursor-not-allowed bg-sage-400"
                        : "bg-sage-600 hover:bg-sage-700",
                    )}
                  >
                    {downloading === "with-answers" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="h-3 w-3" />
                    )}
                    含答案
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                title={deleting ? "删除中" : "删除"}
                aria-label="删除"
                className={cn(
                  "btn-press ml-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                  deleting
                    ? "cursor-not-allowed text-stone-400"
                    : "text-stone-500 hover:bg-stone-100 hover:text-stone-700",
                )}
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          )}
      </div>
      {(done || failed) && (
        <div className="mt-2.5 flex items-center gap-2 border-t border-sage-100 pt-2 text-[11px] text-ink-mute">
          {job?.created_at && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(job.created_at).toLocaleString("zh-CN")}
            </span>
          )}
          {done && cached && (
            <>
              <span aria-hidden className="h-3 w-px bg-sage-200" />
              <span className="inline-flex items-center gap-1 text-sage-600">
                <HardDrive className="h-3 w-3" />
                已本地缓存
              </span>
            </>
          )}
        </div>
      )}
      {inFlight && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-sage-100">
            <div
              className="progress-shimmer h-full rounded-full bg-sage-500 transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-ink-mute">
            <span>{Math.round(pct)}%</span>
            {status === "generating" && <span>通常需 1–2 分钟</span>}
          </div>
        </div>
      )}
      {failed && job?.message && (
        <div className="mt-1 truncate text-xs text-red-700" title={job.message}>
          {job.message}
        </div>
      )}
    </div>
  );
}

function ConfettiBurst() {
  const pieces = [
    { cx: -70, cy: -42, cr: -180, color: "#4965DB", delay: 0 },
    { cx: 72, cy: -38, cr: 200, color: "#FBBF24", delay: 40 },
    { cx: -48, cy: 44, cr: -220, color: "#34D399", delay: 60 },
    { cx: 58, cy: 48, cr: 180, color: "#F472B6", delay: 20 },
    { cx: -12, cy: -62, cr: 160, color: "#A9BEF4", delay: 80 },
    { cx: 14, cy: 56, cr: -160, color: "#5C7DE6", delay: 100 },
    { cx: -88, cy: 8, cr: 240, color: "#FBBF24", delay: 120 },
    { cx: 90, cy: 6, cr: -240, color: "#34D399", delay: 140 },
  ];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-visible"
    >
      <div className="absolute left-[34px] top-1/2 h-0 w-0">
        {pieces.map((p, i) => (
          <span
            key={i}
            className="confetti-piece"
            style={
              {
                "--cx": `${p.cx}px`,
                "--cy": `${p.cy}px`,
                "--cr": `${p.cr}deg`,
                animationDelay: `${p.delay}ms`,
                backgroundColor: p.color,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

function fallbackFilename(base: string, variant: DownloadVariant): string {
  if (variant === "with-answers") return base;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return `${base}_无答案.pdf`;
  return `${base.slice(0, dot)}_无答案${base.slice(dot)}`;
}

function extractFilenameFromContentDisposition(
  header: string | null,
): string | null {
  if (!header) return null;
  // Prefer RFC 5987 filename* (UTF-8 encoded) if present.
  const star = /filename\*=(?:UTF-8''|utf-8'')?([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // fall through
    }
  }
  const plain = /filename="([^"]+)"/i.exec(header);
  if (plain) return plain[1];
  return null;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Returns a monotonically-increasing progress percentage for the given status.
 * Within the `generating` stage, creeps linearly over GENERATING_EST_SECONDS
 * toward the band ceiling, so the user sees motion during the LLM wait.
 */
function useProgressEstimate(status: JobStatus): number {
  const [pct, setPct] = useState<number>(() => STAGE_BANDS[status][0]);
  const stageStartRef = useRef<{ status: JobStatus; at: number }>({
    status,
    at: Date.now(),
  });
  const lastPctRef = useRef<number>(STAGE_BANDS[status][0]);

  // Reset stage timer when status changes.
  useEffect(() => {
    stageStartRef.current = { status, at: Date.now() };
    const floor = STAGE_BANDS[status][0];
    // Never move backwards (except on failed reset).
    const next = status === "failed" ? 0 : Math.max(lastPctRef.current, floor);
    lastPctRef.current = next;
    setPct(next);
  }, [status]);

  // Creep within the band during `generating`.
  useEffect(() => {
    if (status !== "generating") return;
    const id = setInterval(() => {
      const [start, end] = STAGE_BANDS.generating;
      const elapsed = (Date.now() - stageStartRef.current.at) / 1000;
      const frac = Math.min(1, elapsed / GENERATING_EST_SECONDS);
      const target = start + (end - start) * frac;
      setPct((prev) => {
        const next = Math.max(prev, target);
        lastPctRef.current = next;
        return next;
      });
    }, 800);
    return () => clearInterval(id);
  }, [status]);

  return pct;
}
