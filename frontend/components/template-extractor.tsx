"use client";

import { useEffect, useRef, useState } from "react";
import {
  Wand2,
  Loader2,
  Save,
  Upload,
  CircleCheck,
  CircleAlert,
  ChevronDown,
  ChevronUp,
  FileSearch,
  Brain,
  ListChecks,
} from "lucide-react";
import {
  extractPaperTemplate,
  type ModelId,
  type PaperType,
  type UploadResponse,
} from "@/lib/api";
import { upsertTemplate, type SavedTemplate } from "@/lib/local-store";
import { UploadZone } from "@/components/upload-zone";
import { cn } from "@/lib/utils";

type Props = {
  references: UploadResponse[];
  onChangeReferences: (next: UploadResponse[]) => void;
  selectedModel: ModelId;
  onSaved: (template: SavedTemplate) => void;
  onToast: (msg: string) => void;
};

export function TemplateExtractor({
  references,
  onChangeReferences,
  selectedModel,
  onSaved,
  onToast,
}: Props) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<PaperType | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  // Stage progress for the extract flow. Backend is synchronous and gives no
  // intermediate signal — pro+thinking takes 20-60s, so we drive a faked
  // 3-step indicator + elapsed timer to show the user we're still alive.
  const [progressStep, setProgressStep] = useState<0 | 1 | 2>(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!extracting) return;
    setProgressStep(0);
    setElapsedMs(0);
    const startedAt = Date.now();
    const tick = setInterval(() => setElapsedMs(Date.now() - startedAt), 250);
    const t1 = setTimeout(() => setProgressStep(1), 1200);
    return () => {
      clearInterval(tick);
      clearTimeout(t1);
    };
  }, [extracting]);

  async function onExtract() {
    if (extracting) return;
    if (references.length === 0) {
      onToast("请先上传至少一份参考卷");
      return;
    }
    setExtracting(true);
    setError(null);
    try {
      const tpl = await extractPaperTemplate({
        reference_file_ids: references.map((r) => r.file_id),
        model: selectedModel,
      });
      setProgressStep(2);
      setDraft(tpl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExtracting(false);
    }
  }

  function onSave() {
    if (!draft) return;
    const saved: SavedTemplate = {
      ...draft,
      saved_at: Date.now(),
      source_filename: references[0]?.filename,
    };
    upsertTemplate(saved);
    onSaved(saved);
    setDraft(null);
    onToast(`已保存卷型「${saved.name}」`);
  }

  async function onImportFile(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as PaperType;
      if (!parsed?.id || !Array.isArray(parsed.sections)) {
        throw new Error("文件不是有效的卷型 JSON");
      }
      const saved: SavedTemplate = {
        ...parsed,
        source: "user",
        saved_at: Date.now(),
        source_filename: file.name,
      };
      upsertTemplate(saved);
      onSaved(saved);
      onToast(`已导入卷型「${saved.name}」`);
    } catch (e) {
      onToast(`导入失败：${(e as Error).message}`);
    }
  }

  return (
    <div className="space-y-4">
      <UploadZone
        label="参考试卷"
        hint="历史试卷，用作题型与风格参照；可上传多份"
        files={references}
        onAdd={(f) => onChangeReferences([...references, f])}
        onRemove={(id) =>
          onChangeReferences(references.filter((f) => f.file_id !== id))
        }
        onClear={() => onChangeReferences([])}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onExtract}
          disabled={extracting || references.length === 0}
          className={cn(
            "btn-press inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white shadow-sm transition-colors",
            extracting || references.length === 0
              ? "cursor-not-allowed bg-sage-300"
              : "bg-sage-600 hover:bg-sage-700",
          )}
        >
          {extracting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="h-3.5 w-3.5" />
          )}
          {extracting ? "AI 抽取中…" : "AI 抽取卷型"}
        </button>

        <button
          type="button"
          onClick={() => importInputRef.current?.click()}
          className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-sage-200 bg-white px-3.5 py-2 text-[13px] text-ink-soft transition-colors hover:border-sage-400 hover:text-sage-700"
        >
          <Upload className="h-3.5 w-3.5" />
          导入卷型 JSON
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportFile(f);
            e.target.value = "";
          }}
        />

        <span className="text-[11.5px] text-ink-mute">
          抽取后会沉淀为「我的卷型」，下次直接选用，无需重新上传参考卷
        </span>
      </div>

      {extracting && (
        <ExtractProgress step={progressStep} elapsedMs={elapsedMs} />
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50/60 px-3 py-2.5 text-[12.5px] text-red-700">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {draft && (
        <DraftPreview
          draft={draft}
          showRaw={showRaw}
          onToggleRaw={() => setShowRaw((s) => !s)}
          onChangeName={(name) => setDraft({ ...draft, name })}
          onSave={onSave}
          onDiscard={() => setDraft(null)}
        />
      )}
    </div>
  );
}

const SECTION_SHORT: Record<string, string> = {
  single_choice: "单选",
  multi_choice: "多选",
  true_false: "判断",
  short_answer: "简答",
  essay: "论述",
};

function DraftPreview({
  draft,
  showRaw,
  onToggleRaw,
  onChangeName,
  onSave,
  onDiscard,
}: {
  draft: PaperType;
  showRaw: boolean;
  onToggleRaw: () => void;
  onChangeName: (name: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const total = draft.sections.reduce(
    (s, sec) => s + sec.question_count * sec.score_per_question,
    0,
  );
  const qCount = draft.sections.reduce((s, sec) => s + sec.question_count, 0);
  const refLength = draft.reference_text?.length ?? 0;

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-4">
      <div className="flex items-center gap-2">
        <CircleCheck className="h-4 w-4 text-indigo-500" />
        <div className="text-[13px] font-semibold text-ink">抽取完成 · 预览卷型</div>
      </div>

      <div className="mt-3">
        <label className="text-[11.5px] text-ink-mute">卷型名称</label>
        <input
          value={draft.name}
          onChange={(e) => onChangeName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-sage-200 bg-white px-3 py-1.5 text-[13px] text-ink outline-none focus:border-sage-500"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
        <Stat label="题量" value={`${qCount} 题`} />
        <Stat label="总分" value={`${total} 分`} />
        <Stat label="时长" value={`${draft.default_duration_minutes} 分钟`} />
        <Stat label="副标题" value={draft.default_subtitle ?? "—"} />
      </div>

      <div className="mt-4">
        <div className="text-[12px] font-medium text-ink-soft">题型结构</div>
        <ul className="mt-1.5 space-y-1 text-[12.5px]">
          {draft.sections.map((sec, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-ink">
              <span className="font-medium">
                {SECTION_SHORT[sec.type] ?? sec.type}
              </span>
              <span className="text-ink-mute">
                共 {sec.question_count} 题 · 每题 {sec.score_per_question} 分
              </span>
            </li>
          ))}
        </ul>
      </div>

      {refLength > 0 && (
        <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2 text-[11.5px] text-emerald-700">
          已保留参考卷原文 {refLength.toLocaleString()} 字 —— 生成时作为风格依据完整送给 AI；同卷型重复生成时 DeepSeek 自动命中前缀缓存，几乎免费。
        </div>
      )}

      <button
        type="button"
        onClick={onToggleRaw}
        className="mt-3 inline-flex items-center gap-1 text-[11.5px] text-sage-700 hover:text-sage-800"
      >
        {showRaw ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
        {showRaw ? "收起原始 JSON" : "查看原始 JSON"}
      </button>
      {showRaw && (
        <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-sage-100 bg-white p-3 text-[11px] leading-relaxed text-ink-soft">
{JSON.stringify(draft, null, 2)}
        </pre>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          className="btn-press inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
        >
          <Save className="h-3.5 w-3.5" />
          保存到「我的卷型」
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-sage-200 bg-white px-3.5 py-2 text-[13px] text-ink-soft transition-colors hover:border-sage-400 hover:text-sage-700"
        >
          丢弃
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-sage-100 bg-white px-2.5 py-2">
      <div className="text-[10.5px] text-ink-mute">{label}</div>
      <div className="mt-0.5 truncate text-[12.5px] font-medium text-ink">{value}</div>
    </div>
  );
}

const EXTRACT_STAGES = [
  { icon: FileSearch, label: "解析参考卷", hint: "提取文本与题型骨架" },
  { icon: Brain, label: "AI 思考结构", hint: "高质量模型梳理题型 / 题量 / 分值" },
  { icon: ListChecks, label: "校验并返回", hint: "确认 schema 合规" },
] as const;

function ExtractProgress({
  step,
  elapsedMs,
}: {
  step: 0 | 1 | 2;
  elapsedMs: number;
}) {
  const seconds = Math.floor(elapsedMs / 1000);
  return (
    <div className="rounded-xl border border-sage-200 bg-sage-50/50 px-3.5 py-3">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-sage-800">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-sage-600" />
          正在抽取卷型结构
        </div>
        <div className="text-[11px] tabular-nums text-ink-mute">
          已等待 {seconds}s
        </div>
      </div>
      <ol className="grid grid-cols-3 gap-2">
        {EXTRACT_STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const state =
            i < step ? "done" : i === step ? "active" : "pending";
          return (
            <li
              key={stage.label}
              className={cn(
                "flex flex-col gap-1 rounded-lg border px-2.5 py-2 transition-colors",
                state === "done" && "border-sage-300 bg-white",
                state === "active" && "border-sage-400 bg-white ring-1 ring-sage-200",
                state === "pending" && "border-sage-100 bg-white/40",
              )}
            >
              <div className="flex items-center gap-1.5">
                {state === "done" ? (
                  <CircleCheck className="h-3.5 w-3.5 text-sage-600" />
                ) : state === "active" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-sage-600" />
                ) : (
                  <Icon className="h-3.5 w-3.5 text-ink-mute" />
                )}
                <span
                  className={cn(
                    "text-[12px] font-medium",
                    state === "pending" ? "text-ink-mute" : "text-ink",
                  )}
                >
                  {stage.label}
                </span>
              </div>
              <div className="text-[10.5px] text-ink-mute">{stage.hint}</div>
            </li>
          );
        })}
      </ol>
      {step === 1 && seconds > 8 && (
        <div className="mt-2.5 text-[11px] text-ink-mute">
          AI 正在分析题型分布，通常 5–15 秒完成，请稍候…
        </div>
      )}
    </div>
  );
}
