"use client";

import { useRef, useState } from "react";
import {
  UploadCloud,
  Loader2,
  X,
  CircleX,
  FileText,
  FileType2,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadFile, type UploadResponse } from "@/lib/api";

type Props = {
  label: string;
  hint: string;
  files: UploadResponse[];
  onAdd: (info: UploadResponse) => void;
  onRemove: (fileId: string) => void;
  onClear?: () => void;
};

type FailedItem = { filename: string; message: string; id: string };

export function UploadZone({ label, hint, files, onAdd, onRemove, onClear }: Props) {
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

  const totalCount = files.length + pending.length;
  const hasAny = totalCount > 0 || failed.length > 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Left: drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          "btn-press flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-sage-50/40 px-6 py-8 text-center transition-colors",
          dragOver
            ? "border-sage-500 bg-sage-50 drop-active"
            : "border-sage-200 hover:border-sage-400 hover:bg-sage-50/70",
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
        <UploadCloud className="h-10 w-10 text-sage-500" strokeWidth={1.5} />
        <div className="mt-3 text-[14.5px] font-medium text-ink">
          点击或拖拽文件到此上传
        </div>
        <div className="mt-1.5 text-[12px] text-ink-mute">
          支持 PDF、Word（.doc / .docx）、RTF、TXT、Markdown，可上传多份，每个文件 ≤ 20MB
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,.rtf,.txt,.md,.markdown"
          multiple
          className="hidden"
          onChange={(e) => {
            void handle(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Right: uploaded files panel */}
      <div className="rounded-2xl border border-sage-100 bg-white/90 p-4">
        <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
          <div className="text-[13px] font-medium text-ink-soft">
            已上传文件
            {totalCount > 0 && (
              <span className="ml-1 text-ink-mute">（{totalCount}）</span>
            )}
          </div>
          {files.length > 0 && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="text-[12px] text-sage-600 transition-colors hover:text-sage-700"
            >
              清空全部
            </button>
          )}
        </div>

        {hasAny ? (
          <ul className="space-y-2">
            {files.map((f) => (
              <FileRow
                key={f.file_id}
                filename={f.filename}
                size={formatBytes(f.size)}
                onRemove={() => onRemove(f.file_id)}
              />
            ))}
            {pending.map((name) => (
              <li
                key={`p-${name}`}
                className="flex items-center gap-3 rounded-xl border border-sage-100 bg-sage-50/40 px-3 py-2.5"
              >
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sage-500" />
                <span className="flex-1 truncate text-[13px] text-ink-mute">{name}</span>
                <span className="shrink-0 text-[11.5px] text-ink-mute">上传中…</span>
              </li>
            ))}
            {failed.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50/60 px-3 py-2.5"
              >
                <CircleX className="h-4 w-4 shrink-0 text-red-600" />
                <span className="flex-1 truncate text-[13px] text-red-700">
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
        ) : (
          <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 px-4 py-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sage-50 text-sage-400 ring-1 ring-sage-100">
              <Inbox className="h-5 w-5" strokeWidth={1.7} />
            </div>
            <div className="text-[12.5px] text-ink-mute">尚未上传任何文件</div>
            <div className="text-[11.5px] text-sage-500">从左侧拖入或点击上传</div>
            <span className="sr-only">{hint}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function FileRow({
  filename,
  size,
  onRemove,
}: {
  filename: string;
  size: string;
  onRemove: () => void;
}) {
  const isPdf = /\.pdf$/i.test(filename);
  const Icon = isPdf ? FileText : FileType2;
  const tone = isPdf
    ? "bg-red-50 text-red-600"
    : "bg-sage-50 text-sage-600";
  return (
    <li className="flex items-center gap-3 rounded-xl border border-sage-100 bg-white px-3 py-2.5 shadow-sm">
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tone)}>
        <Icon className="h-4.5 w-4.5" strokeWidth={1.7} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-ink">{filename}</div>
        <div className="text-[11.5px] text-ink-mute">{size}</div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-full p-1 text-ink-mute transition-colors hover:bg-sage-50 hover:text-sage-700"
        aria-label={`移除 ${filename}`}
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
