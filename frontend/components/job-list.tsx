"use client";

import { useEffect, useRef, useState } from "react";
import {
  CircleCheck,
  CircleX,
  Download,
  FileText,
  Loader2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deleteJob,
  downloadUrl,
  getJob,
  type JobResponse,
  type JobStatus,
} from "@/lib/api";

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

  const pct = useProgressEstimate(status);

  async function onDelete() {
    if (!job || deleting) return;
    const ok = window.confirm(`确认删除结果「${job.title || "模拟试卷"}」吗？`);
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteJob(jobId);
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
        "rounded-xl border px-3.5 py-3 transition-colors",
        done && "border-sage-200 bg-sage-50/40",
        failed && "border-red-200 bg-red-50/50",
        inFlight && "border-sage-200 bg-white",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            done && "bg-sage-100 text-sage-700",
            failed && "bg-red-100 text-red-700",
            inFlight && "bg-sage-50 text-sage-600",
          )}
        >
          {inFlight && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {done && <CircleCheck className="h-4 w-4" />}
          {failed && <CircleX className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
            <FileText className="h-3.5 w-3.5 text-ink-mute" />
            <span className="truncate">{job?.title || "模拟试卷"}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-ink-mute">
            <span className="truncate">
              {done ? job?.filename : STATUS_LABEL[status]}
            </span>
            {(done || failed) && (
              <div className="flex shrink-0 items-center gap-1.5">
                {done && (
                  <a
                    href={downloadUrl(jobId)}
                    download={job?.filename ?? undefined}
                    className="btn-press inline-flex items-center gap-1 rounded-md bg-sage-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-sage-700"
                  >
                    <Download className="h-3 w-3" />
                    下载
                  </a>
                )}
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                  className={cn(
                    "btn-press inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    deleting
                      ? "cursor-not-allowed bg-stone-100 text-stone-400"
                      : "bg-stone-100 text-stone-700 hover:bg-stone-200",
                  )}
                >
                  <Trash2 className="h-3 w-3" />
                  {deleting ? "删除中" : "删除"}
                </button>
              </div>
            )}
          </div>
          {job?.created_at && (
            <div className="mt-1 text-[11px] text-ink-mute">
              {new Date(job.created_at).toLocaleString("zh-CN")}
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
                {status === "generating" && (
                  <span>通常需 1–2 分钟</span>
                )}
              </div>
            </div>
          )}
          {failed && job?.message && (
            <div className="mt-1 truncate text-xs text-red-700" title={job.message}>
              {job.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
