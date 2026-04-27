"use client";

import { useState } from "react";
import {
  CircleCheck,
  FileSearch,
  Sparkles,
  Copy,
  Download,
  Trash2,
  User,
  Library,
  Check,
} from "lucide-react";
import { resolveApiUrl, type PaperType } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  types: PaperType[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDeleteUserTemplate?: (id: string) => void;
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

function sectionSummary(t: PaperType) {
  return t.sections
    .map((s) => `${SECTION_SHORT[s.type] ?? s.type}×${s.question_count}`)
    .join("　");
}

export function PaperTypePicker({ types, selectedId, onSelect, onDeleteUserTemplate }: Props) {
  if (types.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-sage-200 bg-white/60 p-6 text-center text-sm text-ink-mute">
        暂无可用卷型，可在「新建卷型」中上传一份参考卷生成专属模板
      </div>
    );
  }

  const builtins = types.filter((t) => (t.source ?? "builtin") === "builtin");
  const userTypes = types.filter((t) => t.source === "user");
  const selected =
    types.find((t) => t.id === selectedId) ?? builtins[0] ?? types[0];

  return (
    <div className="space-y-5">
      {builtins.length > 0 && (
        <Group
          icon={Library}
          label="内置卷型"
          count={builtins.length}
          tone="sage"
        >
          {builtins.map((t) => (
            <TemplateCard
              key={t.id}
              type={t}
              selected={t.id === selected.id}
              onSelect={() => onSelect(t.id)}
            />
          ))}
        </Group>
      )}

      {userTypes.length > 0 && (
        <Group
          icon={User}
          label="我的卷型"
          count={userTypes.length}
          tone="indigo"
        >
          {userTypes.map((t) => (
            <TemplateCard
              key={t.id}
              type={t}
              selected={t.id === selected.id}
              onSelect={() => onSelect(t.id)}
              onDelete={
                onDeleteUserTemplate ? () => onDeleteUserTemplate(t.id) : undefined
              }
            />
          ))}
        </Group>
      )}

      <div className="flex items-center gap-1.5 px-1 text-[11.5px] text-ink-mute">
        <Sparkles className="h-3.5 w-3.5 text-sage-500" />
        在「新建卷型」中上传参考卷可抽取专属模板，沉淀后在此直接选用
      </div>
    </div>
  );
}

function Group({
  icon: Icon,
  label,
  count,
  tone,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  tone: "sage" | "indigo";
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 px-1 text-[12px] font-medium text-ink-soft">
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            tone === "indigo" ? "text-indigo-600" : "text-sage-600",
          )}
        />
        {label}
        <span className="text-ink-mute">（{count}）</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function TemplateCard({
  type,
  selected,
  onSelect,
  onDelete,
}: {
  type: PaperType;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  const isUser = type.source === "user";
  const total = totalOf(type);
  const qCount = questionCountOf(type);
  const [copied, setCopied] = useState(false);

  const accent = isUser
    ? {
        ring: "border-indigo-400 ring-2 ring-indigo-200 bg-indigo-50/40",
        idle: "border-sage-100 hover:border-indigo-300 hover:bg-indigo-50/20",
        check: "text-indigo-500",
      }
    : {
        ring: "border-sage-400 ring-2 ring-sage-200 bg-sage-50/50",
        idle: "border-sage-100 hover:border-sage-300 hover:bg-sage-50/40",
        check: "text-sage-600",
      };

  const copyJson = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(JSON.stringify(type, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  };

  const exportJson = (e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([JSON.stringify(type, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paperclone_template_${type.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "card-interactive relative flex cursor-pointer flex-col gap-2 rounded-xl border bg-white p-3.5 text-left transition-colors",
        selected ? accent.ring : accent.idle,
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold tracking-tight text-ink">
            {type.name}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11.5px] text-ink-mute">
            <span>共 {qCount} 题 · {total} 分</span>
            <span className="text-sage-300">·</span>
            <span className="truncate">{sectionSummary(type)}</span>
          </div>
        </div>
        {selected && (
          <CircleCheck
            className={cn("h-4 w-4 shrink-0", accent.check)}
            strokeWidth={2.2}
          />
        )}
      </div>

      {type.description && !isUser && (
        <p className="text-[11.5px] leading-relaxed text-ink-mute line-clamp-2">
          适用：{type.description}
        </p>
      )}

      <div className="mt-auto flex items-center gap-1 border-t border-sage-100 pt-2">
        {!isUser && type.sample_pdf_url && (
          <a
            href={resolveApiUrl(type.sample_pdf_url)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-sage-700 transition-colors hover:bg-sage-50"
          >
            <FileSearch className="h-3.5 w-3.5" />
            示例 PDF
          </a>
        )}
        {isUser && (
          <>
            <IconAction
              label={copied ? "已复制" : "复制 JSON"}
              icon={copied ? Check : Copy}
              onClick={copyJson}
              tone={copied ? "ok" : "default"}
            />
            <IconAction label="导出 .json" icon={Download} onClick={exportJson} />
            {onDelete && (
              <IconAction
                label="删除"
                icon={Trash2}
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`确认删除卷型「${type.name}」？`)) onDelete();
                }}
                tone="danger"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function IconAction({
  icon: Icon,
  label,
  onClick,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  tone?: "default" | "danger" | "ok";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "btn-press inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] transition-colors",
        tone === "danger"
          ? "text-red-600 hover:bg-red-50"
          : tone === "ok"
            ? "text-emerald-600"
            : "text-ink-mute hover:bg-sage-50 hover:text-sage-700",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
