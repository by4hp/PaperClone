"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  CircleCheck,
  CircleX,
  FileSearch,
  PenLine,
  Printer,
  Download,
} from "lucide-react";
import { getJob, downloadUrl, type JobResponse, type JobStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = { jobId: string };

const STAGES: { key: JobStatus; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "parsing", label: "解析文档", icon: FileSearch },
  { key: "generating", label: "命题生成", icon: PenLine },
  { key: "rendering", label: "排版输出", icon: Printer },
];

export function JobProgress({ jobId }: Props) {
  const [job, setJob] = useState<JobResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const j = await getJob(jobId);
        if (cancelled) return;
        setJob(j);
        if (j.status === "completed" || j.status === "failed") return;
      } catch {
        // swallow, retry
      }
      if (!cancelled) setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const status = job?.status ?? "pending";
  const failed = status === "failed";
  const done = status === "completed";
  const currentIdx = STAGES.findIndex((s) => s.key === status);

  return (
    <div className="rounded-2xl bg-white/80 p-6 shadow-card">
      <div className="text-[15px] font-medium text-ink">生成进度</div>
      <ol className="mt-5 space-y-3">
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const isActive = !failed && !done && i === currentIdx;
          const isDone = done || (currentIdx > i && !failed);
          const isFailedHere = failed && i === currentIdx;
          return (
            <li key={stage.key} className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg border",
                  isDone && "border-sage-400 bg-sage-50 text-sage-600",
                  isActive && "border-sage-500 bg-sage-100 text-sage-700",
                  isFailedHere && "border-red-300 bg-red-50 text-red-600",
                  !isDone && !isActive && !isFailedHere && "border-sage-200 bg-white text-ink-mute",
                )}
              >
                {isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isFailedHere ? (
                  <CircleX className="h-4 w-4" />
                ) : isDone ? (
                  <CircleCheck className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <div className="text-sm text-ink">{stage.label}</div>
            </li>
          );
        })}
      </ol>

      {failed && (
        <div className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {job?.message ?? "生成失败"}
        </div>
      )}

      {done && (
        <a
          href={downloadUrl(jobId)}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-sage-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sage-700"
          download
        >
          <Download className="h-4 w-4" />
          下载 PDF
        </a>
      )}
    </div>
  );
}
