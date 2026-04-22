"use client";

import { useRef, useState } from "react";
import { FileUp, FileText, Loader2, X, CircleX, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadFile, type UploadResponse } from "@/lib/api";

type Props = {
  label: string;
  hint: string;
  files: UploadResponse[];
  onAdd: (info: UploadResponse) => void;
  onRemove: (fileId: string) => void;
};

type FailedItem = { filename: string; message: string; id: string };

export function UploadZone({ label, hint, files, onAdd, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [failed, setFailed] = useState<FailedItem[]>([]);
  const [dragOver, setDragOver] = useState(false);

  async function handle(list: FileList | null) {
    if (!list || list.length === 0) return;
    const items = Array.from(list);
    setPending((p) => [...p, ...items.map((f) => f.name)]);

    await Promise.all(
      items.map(async (file) => {
        try {
          const info = await uploadFile(file);
          onAdd(info);
        } catch (e) {
          setFailed((f) => [
            ...f,
            { filename: file.name, message: (e as Error).message, id: crypto.randomUUID() },
          ]);
        } finally {
          setPending((p) => {
            const idx = p.indexOf(file.name);
            if (idx < 0) return p;
            const copy = p.slice();
            copy.splice(idx, 1);
            return copy;
          });
        }
      }),
    );
  }

  const hasAny = files.length > 0 || pending.length > 0 || failed.length > 0;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-white/70 shadow-card transition-[background-color,border-color,box-shadow] duration-200",
        dragOver
          ? "border-sage-500 border-dashed bg-sage-50 drop-active"
          : "border-sage-200",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void handle(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4 sm:p-6">
        <div className="flex items-center gap-3 sm:items-start">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sage-100 text-sage-600 sm:h-11 sm:w-11">
            <FileUp className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0 flex-1 sm:hidden">
            <div className="text-[14.5px] font-medium text-ink">
              {label}
              {files.length > 0 && (
                <span className="ml-2 text-xs font-normal text-ink-mute">
                  已上传 {files.length} 份
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="btn-press inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-sage-200 bg-white px-3 py-1.5 text-xs font-medium text-sage-700 transition-colors hover:border-sage-400 hover:bg-sage-50 sm:hidden"
          >
            <Plus className="h-3.5 w-3.5" />
            添加文件
          </button>
        </div>

        <div className="flex-1">
          <div className="hidden items-baseline justify-between gap-3 sm:flex">
            <div className="min-w-0">
              <div className="text-[15px] font-medium text-ink">
                {label}
                {files.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-ink-mute">
                    已上传 {files.length} 份
                  </span>
                )}
              </div>
              <div className="mt-1 text-sm text-ink-mute">{hint}</div>
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="btn-press inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-sage-200 bg-white px-3 py-1.5 text-xs font-medium text-sage-700 transition-colors hover:border-sage-400 hover:bg-sage-50"
            >
              <Plus className="h-3.5 w-3.5" />
              添加文件
            </button>
          </div>
          <div className="text-sm text-ink-mute sm:hidden">{hint}</div>
          <div className="mt-2 text-xs text-ink-mute">
            支持 PDF、Word（.doc / .docx），可多选；单份 ≤ 20MB
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            multiple
            className="hidden"
            onChange={(e) => {
              void handle(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {hasAny && (
        <ul className="divide-y divide-sage-100 border-t border-sage-100">
          {files.map((f) => (
            <li key={f.file_id} className="flex items-center gap-3 px-6 py-2.5">
              <FileText className="h-4 w-4 shrink-0 text-sage-500" />
              <span className="flex-1 truncate text-sm text-ink">{f.filename}</span>
              <span className="shrink-0 text-xs text-ink-mute">{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => onRemove(f.file_id)}
                className="shrink-0 rounded p-1 text-ink-mute transition-colors hover:bg-sage-50 hover:text-sage-700"
                aria-label={`移除 ${f.filename}`}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
          {pending.map((name) => (
            <li key={`p-${name}`} className="flex items-center gap-3 px-6 py-2.5">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sage-500" />
              <span className="flex-1 truncate text-sm text-ink-mute">{name}</span>
              <span className="shrink-0 text-xs text-ink-mute">上传中…</span>
            </li>
          ))}
          {failed.map((f) => (
            <li key={f.id} className="flex items-center gap-3 bg-red-50/50 px-6 py-2.5">
              <CircleX className="h-4 w-4 shrink-0 text-red-600" />
              <span className="flex-1 truncate text-sm text-red-700">
                {f.filename} · {f.message}
              </span>
              <button
                type="button"
                onClick={() => setFailed((list) => list.filter((x) => x.id !== f.id))}
                className="shrink-0 rounded p-1 text-red-600 transition-colors hover:bg-red-100"
                aria-label="清除错误"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
