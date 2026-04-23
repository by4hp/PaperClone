"use client";

import { useEffect, useRef } from "react";
import { History, X, Inbox, Download, Upload, Trash2 } from "lucide-react";
import { JobList } from "@/components/job-list";
import { clearAllCachedPdfs } from "@/lib/local-store";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  jobIds: string[];
  onRemoveJob: (jobId: string) => void;
  onImportIds: (ids: string[]) => void;
  onClearAll: () => void;
  onToast: (message: string) => void;
};

export function HistoryDrawer({
  open,
  onClose,
  jobIds,
  onRemoveJob,
  onImportIds,
  onClearAll,
  onToast,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  function onExport() {
    if (jobIds.length === 0) {
      onToast("暂无记录可导出");
      return;
    }
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      jobIds,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paperclone-records-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onToast(`已导出 ${jobIds.length} 条记录`);
  }

  function onImportClick() {
    fileInputRef.current?.click();
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const ids: unknown = parsed?.jobIds;
      if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) {
        onToast("文件格式不正确");
        return;
      }
      const added = ids.filter((id) => !jobIds.includes(id));
      if (added.length === 0) {
        onToast("记录已全部存在，无需导入");
        return;
      }
      onImportIds(added);
      onToast(`已导入 ${added.length} 条记录`);
    } catch {
      onToast("文件解析失败");
    }
  }

  async function onClear() {
    if (jobIds.length === 0) return;
    const ok = window.confirm(
      `确认清空本地 ${jobIds.length} 条记录吗？\n\n仅清除浏览器本地的记录索引与 PDF 缓存，不会删除服务器上的文件。可用"导出"提前备份。`,
    );
    if (!ok) return;
    await clearAllCachedPdfs();
    onClearAll();
    onToast("已清空本地记录");
  }

  return (
    <div
      aria-hidden={!open}
      className={cn(
        "fixed inset-0 z-50",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-ink/30 backdrop-blur-[2px] transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
      />

      <aside
        role="dialog"
        aria-label="生成记录"
        className={cn(
          "absolute flex flex-col bg-cream-50 shadow-2xl transition-transform duration-300 ease-out",
          // Mobile: bottom sheet
          "inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl",
          open ? "translate-y-0" : "translate-y-full",
          // Desktop: right slide-over
          "lg:inset-y-0 lg:right-0 lg:left-auto lg:bottom-auto lg:top-0 lg:h-full lg:w-[26rem] lg:max-h-none lg:rounded-none",
          open ? "lg:translate-x-0" : "lg:translate-x-full lg:translate-y-0",
        )}
      >
        <div className="lg:hidden flex justify-center pt-2.5 pb-1">
          <span className="h-1 w-10 rounded-full bg-sage-200" />
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-sage-100 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <History className="h-4 w-4 text-sage-700" />
            <div className="text-[15px] font-semibold tracking-tight text-ink">
              生成记录
            </div>
            <div className="text-[11.5px] text-ink-mute">
              {jobIds.length > 0 ? `共 ${jobIds.length} 个` : "暂无"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-press inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-sage-50 hover:text-sage-700"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 border-b border-sage-100 px-3 py-2">
          <ActionBtn icon={Download} label="导出" onClick={onExport} disabled={jobIds.length === 0} />
          <ActionBtn icon={Upload} label="导入" onClick={onImportClick} />
          <div className="ml-auto">
            <ActionBtn
              icon={Trash2}
              label="清空"
              onClick={onClear}
              disabled={jobIds.length === 0}
              danger
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onImportFile}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {jobIds.length === 0 ? (
            <EmptyState />
          ) : (
            <JobList
              jobIds={jobIds}
              onRemoveJob={onRemoveJob}
              onToast={onToast}
            />
          )}
        </div>

        <div className="border-t border-sage-100 bg-sage-50/40 px-5 py-2.5 text-[11px] leading-relaxed text-ink-mute">
          记录仅存在于当前浏览器。换设备或清理缓存前记得导出。
        </div>
      </aside>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: typeof Download;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "btn-press inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] transition-colors",
        disabled
          ? "cursor-not-allowed text-ink-mute/60"
          : danger
            ? "text-ink-soft hover:bg-red-50 hover:text-red-600"
            : "text-ink-soft hover:bg-sage-50 hover:text-sage-700",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sage-50 text-sage-400">
        <Inbox className="h-7 w-7" />
      </div>
      <div className="mt-4 text-[14px] font-medium text-ink">
        还没有生成任务
      </div>
      <div className="mt-1.5 max-w-[18rem] text-[12.5px] leading-relaxed text-ink-mute">
        填写完步骤后点击"开始生成"，任务进度与下载入口都会出现在这里。
      </div>
    </div>
  );
}
