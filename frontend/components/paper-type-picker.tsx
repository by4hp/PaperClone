"use client";

import {
  CircleCheck,
  FileSearch,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { resolveApiUrl, type PaperType } from "@/lib/api";

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

function totalOf(t: PaperType) {
  return t.sections.reduce((s, sec) => s + sec.question_count * sec.score_per_question, 0);
}

function questionCountOf(t: PaperType) {
  return t.sections.reduce((s, sec) => s + sec.question_count, 0);
}

export function PaperTypePicker({ types, selectedId, onSelect }: Props) {
  if (types.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-sage-200 bg-white/60 p-6 text-center text-sm text-ink-mute">
        暂无内置卷型，可切换到「上传参考卷」模式
      </div>
    );
  }

  const selected = types.find((t) => t.id === selectedId) ?? types[0];
  const others = types.filter((t) => t.id !== selected.id);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <FeaturedCard type={selected} />
        <div className="flex flex-col gap-2.5">
          {others.map((t) => (
            <ListRow key={t.id} type={t} onSelect={() => onSelect(t.id)} />
          ))}
          {others.length === 0 && (
            <div className="rounded-xl border border-dashed border-sage-200 bg-white/50 p-6 text-center text-xs text-ink-mute">
              暂无其他卷型可切换
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 px-1 text-[11.5px] text-ink-mute">
        <Sparkles className="h-3.5 w-3.5 text-sage-500" />
        已为你推荐最常用的卷型模板
      </div>
    </div>
  );
}

function FeaturedCard({ type }: { type: PaperType }) {
  const total = totalOf(type);
  const qCount = questionCountOf(type);
  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-sage-400 bg-gradient-to-br from-sage-50 to-white p-5 shadow-card">
      <div className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-sage-500 text-white shadow-sm">
        <CircleCheck className="h-4 w-4" strokeWidth={2.2} />
      </div>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-semibold tracking-tight text-ink">
            {type.name}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-md bg-sage-100/90 px-2 py-0.5 text-sage-700">
              综合题型
            </span>
            <span className="rounded-md bg-sage-100/90 px-2 py-0.5 text-sage-700">
              中等难度
            </span>
          </div>
          <div className="mt-3 text-[13px] text-ink-soft">
            共 {qCount} 题 · {total} 分
          </div>
          {type.description ? (
            <p className="mt-2 text-xs leading-relaxed text-ink-mute line-clamp-2">
              适用：{type.description}
            </p>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-ink-mute">
              适用：复习 / 模拟训练
            </p>
          )}
          {type.sample_pdf_url && (
            <a
              href={resolveApiUrl(type.sample_pdf_url)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-3 inline-flex items-center gap-1 text-[11.5px] text-sage-700 underline-offset-2 hover:text-sage-800 hover:underline"
            >
              <FileSearch className="h-3.5 w-3.5" />
              查看示例 PDF
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function ListRow({ type, onSelect }: { type: PaperType; onSelect: () => void }) {
  const total = totalOf(type);
  const qCount = questionCountOf(type);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="card-interactive group flex items-center gap-3 rounded-xl border border-sage-100 bg-white p-3.5 text-left hover:border-sage-300 hover:bg-sage-50/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-[14px] font-semibold tracking-tight text-ink">
            {type.name}
          </div>
          <span className="rounded bg-sage-50 px-1.5 py-0.5 text-[10.5px] text-sage-700">
            综合题型
          </span>
          <span className="rounded bg-sage-50 px-1.5 py-0.5 text-[10.5px] text-sage-700">
            中等难度
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11.5px] text-ink-mute">
          <span>共 {qCount} 题 · {total} 分</span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-mute transition-colors group-hover:text-sage-600" />
    </button>
  );
}
