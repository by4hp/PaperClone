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
};

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
  style_notes: string;
  sample_pdf_url: string | null;
};

export async function listPaperTypes(): Promise<PaperType[]> {
  const res = await fetch(api("/api/paper-types"));
  if (!res.ok) throw new Error(`获取卷型失败：${res.status}`);
  return res.json();
}

export async function startGenerate(payload: {
  paper_type_id?: string;
  reference_file_ids?: string[];
  source_file_ids: string[];
  title?: string;
  header_lines?: string[];
  subtitle?: string | null;
  duration_minutes?: number;
  total_score?: number;
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

export async function deleteJob(jobId: string): Promise<void> {
  const res = await fetch(api(`/api/jobs/${jobId}`), { method: "DELETE" });
  if (!res.ok) throw new Error(`删除结果失败：${res.status}`);
}

export function downloadUrl(jobId: string): string {
  return api(`/api/jobs/${jobId}/download`);
}
