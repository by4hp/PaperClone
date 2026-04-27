import type { PaperType } from "./api";

const JOB_IDS_KEY = "paperclone.jobIds";
const TEMPLATES_KEY = "paperclone.paperTemplates";
const DB_NAME = "paperclone";
const DB_VERSION = 1;
const PDF_STORE = "pdfs";

export function loadJobIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(JOB_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveJobIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(JOB_IDS_KEY, JSON.stringify(ids));
  } catch {
    // Quota exceeded or storage disabled — silently ignore; worst case the
    // list doesn't persist across reloads.
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PDF_STORE)) {
        db.createObjectStore(PDF_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export type PdfVariant = "with-answers" | "no-answers";

export type CachedPdf = {
  blob: Blob;
  filename: string;
  title: string;
  cachedAt: number;
};

function cacheKey(jobId: string, variant: PdfVariant): string {
  // Keep the legacy key (jobId only) aliased to the answers-included variant
  // so caches from before the split keep working.
  return variant === "with-answers" ? jobId : `${jobId}:no-answers`;
}

export async function cachePdf(
  jobId: string,
  entry: CachedPdf,
  variant: PdfVariant = "with-answers",
): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readwrite");
    tx.objectStore(PDF_STORE).put(entry, cacheKey(jobId, variant));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadCachedPdf(
  jobId: string,
  variant: PdfVariant = "with-answers",
): Promise<CachedPdf | null> {
  if (typeof window === "undefined") return null;
  try {
    const db = await openDb();
    const entry = await new Promise<CachedPdf | null>((resolve, reject) => {
      const tx = db.transaction(PDF_STORE, "readonly");
      const req = tx.objectStore(PDF_STORE).get(cacheKey(jobId, variant));
      req.onsuccess = () => resolve((req.result as CachedPdf | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return entry;
  } catch {
    return null;
  }
}

export async function deleteCachedPdf(jobId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PDF_STORE, "readwrite");
      const store = tx.objectStore(PDF_STORE);
      store.delete(cacheKey(jobId, "with-answers"));
      store.delete(cacheKey(jobId, "no-answers"));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

export async function hasCachedPdf(
  jobId: string,
  variant: PdfVariant = "with-answers",
): Promise<boolean> {
  return (await loadCachedPdf(jobId, variant)) !== null;
}

export type SavedTemplate = PaperType & {
  saved_at: number;
  source_filename?: string;
};

export function loadTemplates(): SavedTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is SavedTemplate =>
        !!t && typeof t === "object" && typeof t.id === "string" && Array.isArray(t.sections),
    );
  } catch {
    return [];
  }
}

export function saveTemplates(list: SavedTemplate[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list));
  } catch {
    // ignore quota
  }
}

export function upsertTemplate(t: SavedTemplate): SavedTemplate[] {
  const list = loadTemplates();
  const next = list.filter((x) => x.id !== t.id);
  next.unshift(t);
  saveTemplates(next);
  return next;
}

export function removeTemplate(id: string): SavedTemplate[] {
  const next = loadTemplates().filter((t) => t.id !== id);
  saveTemplates(next);
  return next;
}

export async function clearAllCachedPdfs(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PDF_STORE, "readwrite");
      tx.objectStore(PDF_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}
