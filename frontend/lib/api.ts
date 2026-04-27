const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");
const api = (path: string) => `${API_BASE}${path}`;

/** Absolute URL for paths the backend returns as relative (e.g. sample_pdf_url). */
export function resolveApiUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return api(path.startsWith("/") ? path : `/${path}`);
}

export type UploadResponse = {
  file_id: string;
  filename: string;
  size: number;
};

export type JobStatus =
  | "pending"
  | "parsing"
  | "generating"
  | "rendering"
  | "completed"
  | "failed";

export type JobResponse = {
  job_id: string;
  status: JobStatus;
  message?: string | null;
  output_url?: string | null;
  title?: string | null;
  filename?: string | null;
  created_at?: string | null;
  model?: string | null;
};

/** Compact label for a model id, used in history badges. */
export function modelShortLabel(model: string | null | undefined): string | null {
  if (!model) return null;
  switch (model) {
    case "deepseek-v4-flash":
      return "DS Flash";
    case "deepseek-v4-pro":
      return "DS Pro";
    case "gemini-3.1-pro":
      return "Gemini Pro";
    default:
      return model;
  }
}

export async function uploadFile(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(api("/api/upload"), { method: "POST", body: form });
  if (!res.ok) throw new Error(`上传失败：${res.status}`);
  return res.json();
}

export type PaperTypeSection = {
  title: string;
  type: "single_choice" | "multi_choice" | "true_false" | "short_answer" | "essay";
  question_count: number;
  score_per_question: number;
};

export type PaperType = {
  id: string;
  name: string;
  description: string;
  default_header_lines: string[];
  default_subtitle: string | null;
  default_duration_minutes: number;
  sections: PaperTypeSection[];
  // Full text of the original reference paper (capped ~40k chars). Used
  // by the generator as the style anchor — sent verbatim to the LLM, where
  // its prefix is automatically cached by DeepSeek for cheap repeats.
  reference_text?: string;
  sample_pdf_url: string | null;
  source?: "builtin" | "user";
};

export async function listPaperTypes(): Promise<PaperType[]> {
  const res = await fetch(api("/api/paper-types"));
  if (!res.ok) throw new Error(`获取卷型失败：${res.status}`);
  return res.json();
}

export async function extractPaperTemplate(payload: {
  reference_file_ids: string[];
  model?: ModelId;
}): Promise<PaperType> {
  const res = await fetch(api("/api/paper-templates/extract"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const j = await res.json();
      if (j?.detail) detail = j.detail;
    } catch {
      // ignore
    }
    throw new Error(`卷型抽取失败：${detail}`);
  }
  const data = (await res.json()) as { template: PaperType };
  return data.template;
}

export type ModelId =
  | "gemini-3.1-pro"
  | "deepseek-v4-flash"
  | "deepseek-v4-pro";

export const MODEL_OPTIONS: { id: ModelId; label: string; hint: string }[] = [
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", hint: "默认，速度快" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", hint: "高质量思考模式，较慢" },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", hint: "质量挑剔档（无缓存）" },
];

export async function startGenerate(payload: {
  paper_type_id?: string;
  paper_template?: PaperType;
  reference_file_ids?: string[];
  source_file_ids: string[];
  title?: string;
  header_lines?: string[];
  subtitle?: string | null;
  duration_minutes?: number;
  total_score?: number;
  model?: ModelId;
}): Promise<JobResponse> {
  const res = await fetch(api("/api/generate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`启动生成失败：${res.status}`);
  return res.json();
}

export async function getJob(jobId: string): Promise<JobResponse> {
  const res = await fetch(api(`/api/jobs/${jobId}`));
  if (!res.ok) throw new Error(`查询任务失败：${res.status}`);
  return res.json();
}

export type UsageStatBucket = {
  label: string;
  count: number;
  percent: number;
};

export type UsageStats = {
  total: number;
  counted: number;
  completed: number;
  failed: number;
  tokens: {
    prompt: number;
    completion: number;
    cached: number;
    cache_hit_ratio: number;
  };
  by_model: UsageStatBucket[];
  by_domain: UsageStatBucket[];
  by_paper_type: UsageStatBucket[];
};

export async function fetchUsageStats(): Promise<UsageStats> {
  const res = await fetch(api("/api/stats"));
  if (!res.ok) throw new Error(`获取统计失败：${res.status}`);
  return res.json();
}

export async function deleteJob(jobId: string): Promise<void> {
  const res = await fetch(api(`/api/jobs/${jobId}`), { method: "DELETE" });
  if (!res.ok) throw new Error(`删除结果失败：${res.status}`);
}

export type DownloadVariant = "with-answers" | "no-answers";

export function downloadUrl(
  jobId: string,
  variant: DownloadVariant = "with-answers",
): string {
  const flag = variant === "with-answers" ? 1 : 0;
  return api(`/api/jobs/${jobId}/download?with_answers=${flag}`);
}
