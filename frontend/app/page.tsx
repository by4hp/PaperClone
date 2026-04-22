"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleAlert,
  BookOpenCheck,
  Sparkles,
  Wand2,
  Loader2,
  LayoutList,
  FilePlus2,
} from "lucide-react";
import { UploadZone } from "@/components/upload-zone";
import { JobList } from "@/components/job-list";
import { PaperTypePicker } from "@/components/paper-type-picker";
import {
  listJobs,
  listPaperTypes,
  startGenerate,
  type PaperType,
  type UploadResponse,
} from "@/lib/api";
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

  const [jobIds, setJobIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const q = new URLSearchParams(window.location.search).get("jobs");
    return q ? q.split(",").filter(Boolean) : [];
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const historyRef = useRef<HTMLElement | null>(null);

  // Fetch paper types once.
  useEffect(() => {
    listPaperTypes()
      .then((types) => {
        setPaperTypes(types);
        if (types[0] && !selectedTypeId) {
          setSelectedTypeId(types[0].id);
        }
      })
      .catch((e) => setError(`加载卷型失败：${(e as Error).message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listJobs()
      .then((jobs) => {
        setJobIds((prev) => {
          const merged = new Set(prev);
          jobs.forEach((job) => merged.add(job.job_id));
          return Array.from(merged);
        });
      })
      .catch((e) => setError(`加载任务历史失败：${(e as Error).message}`));
  }, []);

  const selectedType = useMemo(
    () => paperTypes.find((t) => t.id === selectedTypeId) ?? null,
    [paperTypes, selectedTypeId],
  );

  // When a type is selected, default title/duration/total to its values
  // — but only if the user hasn't customized them yet.
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
      if (!pdfTitleDirty) {
        setPdfTitle("模拟试卷");
      }
    }
  }, [
    mode,
    selectedType,
    pdfTitleDirty,
    durationDirty,
    totalDirty,
  ]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  const ready = !submitting;

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
      });
      setJobIds((ids) => [job.job_id, ...ids]);
      // On narrow viewports the history sits below all the form, so pop into view.
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        requestAnimationFrame(() => {
          historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-cream-50">
      <Toast message={toast} />
      <Header />

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <section className="min-w-0 space-y-6">
            {/* ---- mode tabs ---- */}
            <div className="rounded-2xl bg-white/70 p-1.5 shadow-card">
              <div className="grid grid-cols-2 gap-1">
                <ModeTab
                  icon={LayoutList}
                  label="选择卷型"
                  hint="常见题型一键复刻"
                  active={mode === "type"}
                  onClick={() => setMode("type")}
                />
                <ModeTab
                  icon={FilePlus2}
                  label="上传参考卷"
                  hint="特殊格式自定义"
                  active={mode === "reference"}
                  onClick={() => setMode("reference")}
                />
              </div>
            </div>

            {/* ---- mode content ---- */}
            {mode === "type" ? (
              <div className="space-y-3">
                <div className="section-heading">卷型</div>
                <PaperTypePicker
                  types={paperTypes}
                  selectedId={selectedTypeId}
                  onSelect={setSelectedTypeId}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="section-heading">参考试卷</div>
                <UploadZone
                  label="参考试卷"
                  hint="历史试卷，用作题型与风格参照；可上传多份"
                  files={references}
                  onAdd={(f) => setReferences((list) => [...list, f])}
                  onRemove={(id) =>
                    setReferences((list) => list.filter((f) => f.file_id !== id))
                  }
                />
              </div>
            )}

            {/* ---- source always required ---- */}
            <div className="space-y-3">
              <div className="section-heading">内容来源</div>
              <UploadZone
                label="内容来源"
                hint="本次命题的素材，如教材节选、政策文件、课程讲义；可上传多份"
                files={sources}
                onAdd={(f) => setSources((list) => [...list, f])}
                onRemove={(id) =>
                  setSources((list) => list.filter((f) => f.file_id !== id))
                }
              />
            </div>

            {/* ---- meta ---- */}
            <div className="rounded-2xl bg-white/80 p-6 shadow-card">
              <div className="mb-4 text-[15px] font-semibold tracking-tight text-ink">
                试卷元信息
              </div>
              <div>
                <Field label="PDF 试卷标题（支持换行）">
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
                </Field>
                <div className="mt-1 text-[11px] text-ink-mute">
                  下载文件名会根据这里的内容自动生成
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="时长（分钟）">
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => {
                      setDuration(Number(e.target.value));
                      setDurationDirty(true);
                    }}
                    className="w-full rounded-lg border border-sage-200 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-sage-500"
                  />
                </Field>
                <Field label="总分">
                  <input
                    type="number"
                    value={totalScore}
                    onChange={(e) => {
                      setTotalScore(Number(e.target.value));
                      setTotalDirty(true);
                    }}
                    className="w-full rounded-lg border border-sage-200 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-sage-500"
                  />
                </Field>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={onGenerate}
                disabled={!ready}
                className={cn(
                  "btn-press inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-sm transition-colors",
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
                {jobIds.length > 0 ? "再生成一份" : "开始生成"}
              </button>
              {jobIds.length > 0 && (
                <div className="pl-0.5 text-xs leading-5 text-ink-mute">
                  已生成 {jobIds.length} 份；上传文件已保留，可直接再次生成
                </div>
              )}
            </div>
            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </section>

          <aside
            ref={historyRef}
            className="min-w-0 space-y-6 lg:sticky lg:top-6 lg:w-[22rem] lg:self-start"
          >
            {jobIds.length > 0 ? (
              <JobList
                jobIds={jobIds}
                onRemoveJob={(jobId) => {
                  setJobIds((ids) => ids.filter((id) => id !== jobId));
                }}
                onToast={setToast}
              />
            ) : (
              <Placeholder />
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

function Header() {
  return (
    <header className="border-b border-sage-100 bg-white/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sage-600 text-white">
            <BookOpenCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[17px] font-semibold tracking-tight text-ink">
              出卷好帮手
            </div>
            <div className="hidden truncate text-xs text-ink-mute sm:block">
              PaperClone · 同风格模拟试卷生成
            </div>
          </div>
        </div>
      </div>
    </header>
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

function ModeTab({
  icon: Icon,
  label,
  hint,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "btn-press flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors",
        active
          ? "bg-sage-600 text-white shadow-sm"
          : "text-ink hover:bg-sage-50",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "" : "text-sage-600")} />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium">{label}</div>
        <div
          className={cn(
            "text-[11px]",
            active ? "text-sage-50/90" : "text-ink-mute",
          )}
        >
          {hint}
        </div>
      </div>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs text-ink-mute">{label}</div>
      {children}
    </label>
  );
}

function Placeholder() {
  return (
    <div className="rounded-2xl border border-dashed border-sage-200 bg-white/50 p-6 text-sm text-ink-mute shadow-card">
      <div className="mb-3 flex items-center gap-2 text-ink">
        <Sparkles className="h-4 w-4 text-sage-600" />
        <span className="font-medium">操作流程</span>
      </div>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          选择一个内置<strong>卷型</strong>，或上传一份参考试卷自定义
        </li>
        <li>上传一份或多份<strong>内容来源</strong></li>
        <li>点击「开始生成」，等待 PDF 产出</li>
        <li>可再次生成更多份，文件自动按时间戳命名</li>
      </ol>
    </div>
  );
}
