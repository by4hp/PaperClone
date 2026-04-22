"use client";

import { ClipboardList, CircleCheck, FileSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaperType } from "@/lib/api";

type Props = {
  types: PaperType[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const SECTION_SHORT: Record<string, string> = {
  single_choice: "单选",
  multi_choice: "多选",
  true_false: "判断",
  short_answer: "简答",
  essay: "论述",
};

export function PaperTypePicker({ types, selectedId, onSelect }: Props) {
  if (types.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-sage-200 bg-white/60 p-6 text-center text-sm text-ink-mute">
        暂无内置卷型，可切换到「上传参考卷」模式
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {types.map((t) => {
        const active = t.id === selectedId;
        const total = t.sections.reduce(
          (s, sec) => s + sec.question_count * sec.score_per_question,
          0,
        );
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={cn(
              "card-interactive group relative rounded-xl border p-4 text-left",
              active
                ? "border-sage-500 bg-sage-50 shadow-card"
                : "border-sage-200 bg-white/70 hover:border-sage-400 hover:bg-white",
            )}
          >
            <div className="flex items-start gap-2.5">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  active ? "bg-sage-600 text-white" : "bg-sage-100 text-sage-600",
                )}
              >
                <ClipboardList className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className="truncate text-[15px] font-semibold tracking-tight text-ink">
                    {t.name}
                  </div>
                  {active && <CircleCheck className="h-4 w-4 text-sage-600" />}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-mute line-clamp-2">
                  {t.description}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-sage-700">
                  {t.sections.map((s, i) => (
                    <span
                      key={i}
                      className="rounded bg-sage-100/80 px-1.5 py-0.5"
                    >
                      {SECTION_SHORT[s.type] ?? s.type} × {s.question_count}
                    </span>
                  ))}
                  <span className="rounded bg-cream-200/80 px-1.5 py-0.5 text-ink-soft">
                    满分 {total}
                  </span>
                </div>
                {t.sample_pdf_url && (
                  <a
                    href={t.sample_pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2.5 inline-flex items-center gap-1 text-[11px] text-sage-700 underline-offset-2 hover:text-sage-800 hover:underline"
                  >
                    <FileSearch className="h-3 w-3" />
                    查看示例 PDF
                  </a>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
