"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  Sparkles,
  Wand2,
  Loader2,
  LayoutList,
  FilePlus2,
  Check,
  FileText,
  Clock,
  Award,
  ListChecks,
  FileBadge,
  ClipboardCheck,
  Repeat,
  ShieldCheck,
  History,
  ChevronRight,
  ChevronLeft,
  CircleCheck,
  RotateCcw,
  Cpu,
} from "lucide-react";
import { UploadZone } from "@/components/upload-zone";
import { HistoryDrawer } from "@/components/history-drawer";
import { PaperTypePicker } from "@/components/paper-type-picker";
import {
  listPaperTypes,
  startGenerate,
  MODEL_OPTIONS,
  type ModelId,
  type PaperType,
  type UploadResponse,
} from "@/lib/api";
import { loadJobIds, saveJobIds } from "@/lib/local-store";
import { cn } from "@/lib/utils";

type Mode = "type" | "reference";

export default function Home() {
  const [mode, setMode] = useState<Mode>("type");
  const [paperTypes, setPaperTypes] = useState<PaperType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  const [references, setReferences] = useState<UploadResponse[]>([]);
  const [sources, setSources] = useState<UploadResponse[]>([]);

  const [pdfTitle, setPdfTitle] = useState("");
  const [duration, setDuration] = useState(120);
  const [totalScore, setTotalScore] = useState(100);
  const [selectedModel, setSelectedModel] = useState<ModelId>(MODEL_OPTIONS[0].id);

  // Mobile wizard step (0/1/2 → sections 1/2/3). On lg+ the page shows all
  // sections at once and this state is unused.
  const [mobileStep, setMobileStep] = useState(0);

  const [jobIds, setJobIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadJobIds();
    const q = new URLSearchParams(window.location.search).get("jobs");
    const fromUrl = q ? q.split(",").filter(Boolean) : [];
    const merged = [...fromUrl];
    for (const id of stored) if (!merged.includes(id)) merged.push(id);
    setJobIds(merged);
    setHydrated(true);
  }, []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    listPaperTypes()
      .then((types) => {
        setPaperTypes(types);
        if (types[0] && !selectedTypeId) setSelectedTypeId(types[0].id);
      })
      .catch((e) => setError(`加载卷型失败：${(e as Error).message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveJobIds(jobIds);
  }, [hydrated, jobIds]);

  const selectedType = useMemo(
    () => paperTypes.find((t) => t.id === selectedTypeId) ?? null,
    [paperTypes, selectedTypeId],
  );

  const [pdfTitleDirty, setPdfTitleDirty] = useState(false);
  const [durationDirty, setDurationDirty] = useState(false);
  const [totalDirty, setTotalDirty] = useState(false);

  useEffect(() => {
    if (mode === "type" && selectedType) {
      if (!pdfTitleDirty) {
        const lines = [
          ...selectedType.default_header_lines,
          ...(selectedType.default_subtitle ? [selectedType.default_subtitle] : []),
        ];
        setPdfTitle(lines.join("\n"));
      }
      if (!durationDirty) setDuration(selectedType.default_duration_minutes);
      if (!totalDirty) {
        const total = selectedType.sections.reduce(
          (s, sec) => s + sec.question_count * sec.score_per_question,
          0,
        );
        setTotalScore(Math.round(total));
      }
      return;
    }

    if (mode === "reference") {
      if (!pdfTitleDirty) setPdfTitle("模拟试卷");
    }
  }, [mode, selectedType, pdfTitleDirty, durationDirty, totalDirty]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  const ready = !submitting;

  // Step completion for the top step indicator (visual only).
  const step1Done = mode === "type" ? !!selectedTypeId : true;
  const step2Done = mode === "type" ? sources.length > 0 : references.length > 0 && sources.length > 0;
  const step3Done = pdfTitle.trim().length > 0 && duration > 0 && totalScore > 0;
  const stepStates = [step1Done, step2Done, step3Done, false];

  async function onGenerate() {
    if (submitting) return;
    if (sources.length === 0) {
      setToast("请先上传内容来源文件");
      return;
    }
    if (mode === "reference" && references.length === 0) {
      setToast("当前为上传参考卷模式，请先上传至少一份参考试卷");
      return;
    }
    if (mode === "type" && !selectedTypeId) {
      setToast("请先选择一个卷型");
      return;
    }
    setSubmitting(true);
    setError(null);
    setToast(null);
    try {
      const headerLines = pdfTitle
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const derivedTitle =
        headerLines.join(" ") || selectedType?.name || "模拟试卷";
      const job = await startGenerate({
        paper_type_id: mode === "type" ? selectedTypeId ?? undefined : undefined,
        reference_file_ids:
          mode === "reference" ? references.map((f) => f.file_id) : undefined,
        source_file_ids: sources.map((f) => f.file_id),
        title: derivedTitle,
        header_lines: headerLines.length > 0 ? headerLines : undefined,
        duration_minutes: duration,
        total_score: totalScore,
        model: selectedModel,
      });
      setJobIds((ids) => [job.job_id, ...ids]);
      setMobileStep(3);
      setHistoryOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const MOBILE_STEP_LABELS = [
    mode === "type" ? "选择卷型" : "上传参考卷",
    "上传材料",
    "设置要求",
    "开始生成",
  ];
  const isSubmitStep = mobileStep === 2;
  const isDoneStep = mobileStep === 3;
  const goNext = () => {
    if (isDoneStep) {
      setHistoryOpen(true);
    } else if (isSubmitStep) {
      void onGenerate();
    } else {
      setMobileStep((s) => Math.min(2, s + 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  const goPrev = () => {
    setMobileStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="min-h-screen bg-cream-50 pb-24">
      <Toast message={toast} />

      {/* Desktop header */}
      <div className="hidden lg:block">
        <Header
          jobCount={jobIds.length}
          onJumpHistory={() => setHistoryOpen(true)}
        />
      </div>

      {/* Mobile header */}
      <div className="sticky top-0 z-40 lg:hidden">
        <div className="flex h-12 items-center justify-between border-b border-sage-100 bg-white/90 px-3 backdrop-blur">
          <button
            type="button"
            onClick={goPrev}
            disabled={mobileStep === 0}
            className={cn(
              "btn-press inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] transition-colors",
              mobileStep === 0
                ? "invisible"
                : "text-ink-soft hover:text-sage-600",
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            上一步
          </button>
          <div className="text-[15px] font-semibold tracking-tight text-ink">
            出卷好帮手
          </div>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="btn-press relative inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] text-ink-soft transition-colors hover:text-sage-600"
          >
            <History className="h-3.5 w-3.5" />
            记录
            {jobIds.length > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-sage-600 px-1 text-[10px] font-medium text-white">
                {jobIds.length}
              </span>
            )}
          </button>
        </div>
        <MobileStepPills
          activeIndex={mobileStep}
          steps={MOBILE_STEP_LABELS}
        />
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
          <section className="min-w-0 space-y-5">
            {/* Section 1 */}
            <MobileStep active={mobileStep === 0}>
            <SectionCard
              number={1}
              title={mode === "type" ? "选择内置卷型" : "上传参考卷"}
              hint={
                mode === "type"
                  ? "系统将按此风格生成试卷，可根据需要切换其他卷型。"
                  : "上传一份历史试卷作为题型与风格参照。"
              }
              extra={
                <div className="rounded-xl bg-sage-50/60 p-1">
                  <div className="grid grid-cols-2 gap-1">
                    <ModeTab
                      icon={LayoutList}
                      label="选择卷型"
                      active={mode === "type"}
                      onClick={() => setMode("type")}
                    />
                    <ModeTab
                      icon={FilePlus2}
                      label="上传参考卷"
                      active={mode === "reference"}
                      onClick={() => setMode("reference")}
                    />
                  </div>
                </div>
              }
            >
              {mode === "type" ? (
                <PaperTypePicker
                  types={paperTypes}
                  selectedId={selectedTypeId}
                  onSelect={setSelectedTypeId}
                />
              ) : (
                <UploadZone
                  label="参考试卷"
                  hint="历史试卷，用作题型与风格参照；可上传多份"
                  files={references}
                  onAdd={(f) => setReferences((list) => [...list, f])}
                  onRemove={(id) =>
                    setReferences((list) => list.filter((f) => f.file_id !== id))
                  }
                  onClear={() => setReferences([])}
                />
              )}
            </SectionCard>
            </MobileStep>

            {/* Section 2 */}
            <MobileStep active={mobileStep === 1}>
            <SectionCard
              number={2}
              title="上传参考材料"
              hint="上传相关教材、讲义、政策文件等作为出题依据。"
            >
              <UploadZone
                label="内容来源"
                hint="本次命题的素材，如教材节选、政策文件、课程讲义；可上传多份"
                files={sources}
                onAdd={(f) => setSources((list) => [...list, f])}
                onRemove={(id) =>
                  setSources((list) => list.filter((f) => f.file_id !== id))
                }
                onClear={() => setSources([])}
              />
            </SectionCard>
            </MobileStep>

            {/* Section 3 */}
            <MobileStep active={mobileStep === 2}>
            <SectionCard
              number={3}
              title="设置试卷要求"
              hint="设置试卷的基本信息与出题偏好。"
            >
              <Field label="试卷标题（支持换行）">
                <textarea
                  value={pdfTitle}
                  onChange={(e) => {
                    setPdfTitle(e.target.value);
                    setPdfTitleDirty(true);
                  }}
                  rows={3}
                  className="w-full rounded-lg border border-sage-200 bg-white px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-sage-500"
                  placeholder={'例如：京海市场监督管理局\n"全员法规通"考法测试卷\n（A 卷）'}
                />
                <div className="mt-1 text-[11px] text-ink-mute">
                  下载文件名会根据这里的内容自动生成；考试时长与总分将按所选卷型默认值自动填充
                </div>
              </Field>

              <div className="mt-5">
                <ModelPicker
                  selected={selectedModel}
                  onSelect={setSelectedModel}
                />
              </div>
            </SectionCard>
            </MobileStep>

            {mobileStep === 3 && (
              <div className="lg:hidden">
                <MobileSubmitDone
                  jobCount={jobIds.length}
                  onViewHistory={() => setHistoryOpen(true)}
                  onRestart={() => setMobileStep(2)}
                />
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </section>

          <aside className="hidden min-w-0 space-y-4 lg:sticky lg:top-6 lg:block lg:w-[19rem] lg:self-start">
            <ProgressCard
              activeIndex={
                !stepStates[0] ? 0 : !stepStates[1] ? 1 : !stepStates[2] ? 2 : 3
              }
              steps={[
                { label: mode === "type" ? "选择内置卷型" : "上传参考卷", done: stepStates[0] },
                { label: "上传参考材料", done: stepStates[1] },
                { label: "设置试卷要求", done: stepStates[2] },
                { label: "开始生成", done: stepStates[3] },
              ]}
            />
            <DeliverablesCard />
            {selectedType && mode === "type" && (
              <CurrentTypeCard type={selectedType} />
            )}
            <PrivacyNotice />
          </aside>
        </div>
      </div>

      {/* Desktop sticky bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-sage-100 bg-white/85 backdrop-blur lg:block">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-mute">
            <span className="font-medium text-ink-soft">当前配置摘要</span>
            <Stat
              icon={ListChecks}
              label="卷型"
              value={mode === "type" ? selectedType?.name ?? "未选择" : "参考卷模式"}
            />
            <Stat
              icon={FileText}
              label="材料"
              value={`${sources.length + (mode === "reference" ? references.length : 0)} 个文件`}
            />
          </div>
          <button
            onClick={onGenerate}
            disabled={!ready}
            className={cn(
              "btn-press inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors",
              ready
                ? "bg-sage-600 hover:bg-sage-700 hover:shadow-md"
                : "cursor-not-allowed bg-sage-300",
            )}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {jobIds.length > 0 ? "再生成一份" : "开始生成试卷"}
          </button>
        </div>
      </div>

      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        jobIds={jobIds}
        onRemoveJob={(jobId) =>
          setJobIds((ids) => ids.filter((id) => id !== jobId))
        }
        onImportIds={(ids) => setJobIds((prev) => [...ids, ...prev])}
        onClearAll={() => setJobIds([])}
        onToast={setToast}
      />

      {/* Mobile sticky bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-sage-100 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex gap-2.5">
          {mobileStep > 0 && (
            <button
              type="button"
              onClick={goPrev}
              className="btn-press inline-flex items-center justify-center gap-1 rounded-xl border border-sage-200 bg-white px-4 py-2.5 text-[14px] font-medium text-ink-soft transition-colors hover:border-sage-400 hover:text-sage-700"
            >
              <ChevronLeft className="h-4 w-4" />
              上一步
            </button>
          )}
          <button
            type="button"
            onClick={goNext}
            disabled={!ready}
            className={cn(
              "btn-press inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-medium text-white shadow-sm transition-colors",
              ready
                ? "bg-sage-600 hover:bg-sage-700"
                : "cursor-not-allowed bg-sage-300",
            )}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isDoneStep ? (
              <History className="h-4 w-4" />
            ) : isSubmitStep ? (
              <Wand2 className="h-4 w-4" />
            ) : null}
            {isDoneStep
              ? "查看生成记录"
              : isSubmitStep
                ? jobIds.length > 0
                  ? "再生成一份"
                  : "开始生成试卷"
                : "下一步"}
            {!isSubmitStep && !isDoneStep && <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </main>
  );
}

function MobileStep({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(active ? "block" : "hidden", "lg:block")}>{children}</div>
  );
}

function MobileSubmitDone({
  jobCount,
  onViewHistory,
  onRestart,
}: {
  jobCount: number;
  onViewHistory: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="rounded-2xl bg-white/80 p-6 shadow-card">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sage-100 text-sage-600">
          <CircleCheck className="h-7 w-7" strokeWidth={2} />
        </div>
        <div className="mt-4 text-[16px] font-semibold tracking-tight text-ink">
          任务已开始生成
        </div>
        <div className="mt-1.5 max-w-[18rem] text-[12.5px] leading-relaxed text-ink-mute">
          AI 命题通常需 1–2 分钟。打开"生成记录"查看进度，完成后可直接下载 PDF。
        </div>
        {jobCount > 0 && (
          <div className="mt-3 rounded-md bg-sage-50 px-2 py-0.5 text-[11px] text-sage-700">
            当前共 {jobCount} 条记录
          </div>
        )}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onRestart}
          className="btn-press inline-flex items-center justify-center gap-1.5 rounded-xl border border-sage-200 bg-white px-4 py-2.5 text-[13.5px] font-medium text-ink-soft transition-colors hover:border-sage-400 hover:text-sage-700"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          重新编辑
        </button>
        <button
          type="button"
          onClick={onViewHistory}
          className="btn-press inline-flex items-center justify-center gap-1.5 rounded-xl bg-sage-600 px-4 py-2.5 text-[13.5px] font-medium text-white shadow-sm transition-colors hover:bg-sage-700"
        >
          <History className="h-3.5 w-3.5" />
          查看记录
        </button>
      </div>
    </div>
  );
}

function MobileStepPills({
  steps,
  activeIndex,
}: {
  steps: string[];
  activeIndex: number;
}) {
  return (
    <div className="border-b border-sage-100 bg-white/85 backdrop-blur">
      <ol className="mx-auto flex max-w-md items-center justify-between px-6 py-3">
        {steps.map((label, i) => {
          const isActive = i === activeIndex;
          const isDone = i < activeIndex;
          const isLast = i === steps.length - 1;
          return (
            <li key={i} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold transition-colors",
                    isActive && "bg-sage-600 text-white shadow",
                    isDone && "bg-sage-100 text-sage-700",
                    !isActive && !isDone && "bg-sage-50 text-sage-300 ring-1 ring-sage-100",
                  )}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className={cn(
                    "text-[10.5px] whitespace-nowrap",
                    isActive && "font-medium text-sage-700",
                    isDone && "text-ink-soft",
                    !isActive && !isDone && "text-ink-mute",
                  )}
                >
                  {label}
                </span>
              </div>
              {!isLast && (
                <span
                  aria-hidden
                  className="mb-4 mx-1 h-px flex-1"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(to right, currentColor 0 3px, transparent 3px 6px)",
                    color: isDone ? "#A9BEF4" : "#CFDBFA",
                  }}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Header({
  onJumpHistory,
  jobCount,
}: {
  onJumpHistory?: () => void;
  jobCount?: number;
}) {
  return (
    <header className="border-b border-sage-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandLogo className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-[17px] font-semibold tracking-tight text-ink">
              出卷好帮手
            </div>
            <div className="hidden truncate text-xs text-ink-mute sm:block">
              PaperClone · 同风格模拟试卷生成
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onJumpHistory}
          className="btn-press inline-flex items-center gap-1.5 rounded-lg border border-sage-100 bg-white/80 px-3 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:border-sage-300 hover:text-sage-700"
        >
          <History className="h-3.5 w-3.5" />
          生成记录
          {jobCount && jobCount > 0 ? (
            <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-sage-600 px-1 text-[10px] font-medium text-white">
              {jobCount}
            </span>
          ) : null}
          <ChevronRight className="h-3.5 w-3.5 text-ink-mute" />
        </button>
      </div>
    </header>
  );
}

function ProgressCard({
  steps,
  activeIndex,
}: {
  steps: { label: string; done: boolean }[];
  activeIndex: number;
}) {
  return (
    <div className="rounded-2xl border border-sage-100 bg-white/90 p-5 shadow-card">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink">
        <Sparkles className="h-4 w-4 text-sage-600" />
        操作流程
      </div>
      <ol className="relative space-y-3">
        {steps.map((s, i) => {
          const isActive = i === activeIndex;
          const isDone = s.done && !isActive;
          const isLast = i === steps.length - 1;
          return (
            <li key={i} className="relative flex items-start gap-3">
              {!isLast && (
                <span
                  aria-hidden
                  className="absolute left-[10px] top-6 h-[calc(100%-8px)] w-px"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(to bottom, currentColor 0 3px, transparent 3px 6px)",
                    color: isDone ? "#A9BEF4" : "#CFDBFA",
                  }}
                />
              )}
              <span
                className={cn(
                  "relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold transition-colors",
                  isActive && "bg-sage-500 text-white shadow-sm ring-4 ring-sage-100",
                  isDone && "bg-sage-100 text-sage-700",
                  !isActive && !isDone && "bg-sage-50 text-sage-300 ring-1 ring-sage-100",
                )}
              >
                {isDone ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1 pt-px">
                <div
                  className={cn(
                    "text-[13px]",
                    isActive && "font-medium text-sage-700",
                    isDone && "text-ink-soft",
                    !isActive && !isDone && "text-ink-mute",
                  )}
                >
                  {s.label}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SectionCard({
  number,
  title,
  hint,
  extra,
  children,
}: {
  number: number;
  title: string;
  hint?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-sage-100 bg-white/90 p-5 shadow-card sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-tight text-ink">
            <span className="mr-1 text-sage-600">{number}.</span>
            {title}
          </h2>
          {hint && (
            <p className="mt-1.5 text-[12.5px] text-ink-mute">{hint}</p>
          )}
        </div>
        {extra && <div className="shrink-0">{extra}</div>}
      </div>
      {children}
    </section>
  );
}

function ModeTab({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "btn-press flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
        active
          ? "bg-white text-sage-700 shadow-sm"
          : "text-ink-mute hover:text-ink",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function ModelPicker({
  selected,
  onSelect,
}: {
  selected: ModelId;
  onSelect: (id: ModelId) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-soft">
        <Cpu className="h-3.5 w-3.5 text-sage-600" />
        AI 模型
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MODEL_OPTIONS.map((opt) => {
          const active = opt.id === selected;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect(opt.id)}
              className={cn(
                "btn-press flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
                active
                  ? "border-sage-500 bg-sage-50 ring-1 ring-sage-200"
                  : "border-sage-200 bg-white hover:border-sage-300",
              )}
            >
              <span
                className={cn(
                  "text-[12.5px] font-medium",
                  active ? "text-sage-700" : "text-ink",
                )}
              >
                {opt.label}
              </span>
              <span className="text-[11px] text-ink-mute">{opt.hint}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-1 text-[11px] text-ink-mute">
        不同模型在速度、成本与质量上有差异；如未选择将使用默认模型。
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-ink-soft">{label}</div>
      {children}
    </label>
  );
}

function CurrentTypeCard({ type }: { type: PaperType }) {
  const total = type.sections.reduce(
    (s, sec) => s + sec.question_count * sec.score_per_question,
    0,
  );
  const qCount = type.sections.reduce((s, sec) => s + sec.question_count, 0);
  return (
    <div className="rounded-2xl border border-sage-100 bg-white/85 p-5 shadow-card">
      <div className="mb-3 text-[13px] font-semibold text-ink">当前卷型信息</div>
      <ul className="space-y-3 text-[12.5px]">
        <InfoRow
          icon={ListChecks}
          tone="bg-indigo-50 text-indigo-600 ring-indigo-100"
          label="卷型"
          value={type.name}
        />
        <InfoRow
          icon={FileText}
          tone="bg-sky-50 text-sky-600 ring-sky-100"
          label="题型"
          value={type.sections
            .map((s) => `${SECTION_SHORT[s.type] ?? s.type}×${s.question_count}`)
            .join("　")}
        />
        <InfoRow
          icon={Clock}
          tone="bg-emerald-50 text-emerald-600 ring-emerald-100"
          label="时长"
          value={`${type.default_duration_minutes} 分钟`}
        />
        <InfoRow
          icon={Award}
          tone="bg-amber-50 text-amber-600 ring-amber-100"
          label="题量与分值"
          value={`共 ${qCount} 题 / ${total} 分`}
        />
      </ul>
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

function InfoRow({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: string;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1",
          tone ?? "bg-sage-50 text-sage-600 ring-sage-100",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-ink-mute">{label}</div>
        <div className="mt-0.5 truncate text-ink">{value}</div>
      </div>
    </li>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-sage-600" />
      <span className="text-ink-mute">{label}：</span>
      <span className="font-medium text-ink">{value}</span>
    </span>
  );
}

function BrandLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="出卷好帮手 logo"
      className={className}
    >
      <rect width="40" height="40" rx="10" fill="#4965DB" />
      <path
        d="M14 11 H23 L28 16 V28 Q28 29 27 29 H14 Q13 29 13 28 V12 Q13 11 14 11 Z"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M23 11 V16 H28"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <line x1="16.5" y1="20" x2="24.5" y2="20" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="16.5" y1="23.5" x2="24.5" y2="23.5" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="16.5" y1="27" x2="21" y2="27" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="flex max-w-md items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg">
        <CircleAlert className="h-4 w-4 shrink-0 text-amber-700" />
        <span>{message}</span>
      </div>
    </div>
  );
}

function DeliverablesCard() {
  const items = [
    {
      icon: FileBadge,
      title: "正式试卷 PDF",
      desc: "排版规范，可直接打印使用",
      tone: "bg-sky-50 text-sky-600 ring-sky-100",
    },
    {
      icon: ClipboardCheck,
      title: "参考答案与解析",
      desc: "详细解析，便于学习与复习",
      tone: "bg-amber-50 text-amber-600 ring-amber-100",
    },
    {
      icon: Repeat,
      title: "可重复生成版本",
      desc: "保存本次设置，随时重新生成",
      tone: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    },
  ];
  return (
    <div className="rounded-2xl border border-sage-100 bg-white/90 p-5 shadow-card">
      <div className="mb-3 text-[13px] font-semibold text-ink">你将获得</div>
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.title} className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1",
                it.tone,
              )}
            >
              <it.icon className="h-4.5 w-4.5" strokeWidth={1.7} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-ink">{it.title}</div>
              <div className="mt-0.5 text-[11.5px] text-ink-mute">{it.desc}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PrivacyNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-sage-100 bg-sage-50/40 p-4 text-[11.5px] text-ink-mute">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sage-600" />
      <div className="leading-relaxed">
        <span className="font-medium text-ink-soft">所有文件仅用于生成试卷</span>
        <br />
        我们不会存储您的文件内容
      </div>
    </div>
  );
}

