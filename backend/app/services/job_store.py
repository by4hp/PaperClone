from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from ..config import settings
from ..models.schemas import JobStatus


@dataclass
class Job:
    job_id: str
    status: JobStatus = JobStatus.pending
    message: str | None = None
    output_path: Path | None = None
    title: str = ""
    filename: str = ""
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_record(self) -> dict[str, str | None]:
        return {
            "job_id": self.job_id,
            "status": self.status.value,
            "message": self.message,
            "output_path": str(self.output_path) if self.output_path else None,
            "title": self.title,
            "filename": self.filename,
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_record(cls, record: dict[str, str | None]) -> "Job":
        output_path = record.get("output_path")
        created_at = record.get("created_at")
        status = record.get("status") or JobStatus.pending.value
        return cls(
            job_id=record["job_id"] or "",
            status=JobStatus(status),
            message=record.get("message"),
            output_path=Path(output_path) if output_path else None,
            title=record.get("title") or "",
            filename=record.get("filename") or "",
            created_at=(
                datetime.fromisoformat(created_at)
                if created_at
                else datetime.now(timezone.utc)
            ),
        )


class JobStore:
    """Local-disk-backed job store for single-process deployments."""

    def __init__(self, path: Path) -> None:
        self._jobs: dict[str, Job] = {}
        self._path = path
        self._lock = Lock()
        self._load()

    def create(self, job_id: str, *, title: str = "", filename: str = "") -> Job:
        with self._lock:
            job = Job(job_id=job_id, title=title, filename=filename)
            self._jobs[job_id] = job
            self._save_locked()
            return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def list(self) -> list[Job]:
        with self._lock:
            return list(self._jobs.values())

    def update(self, job_id: str, **changes) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            for k, v in changes.items():
                setattr(job, k, v)
            self._save_locked()

    def delete(self, job_id: str) -> Job | None:
        with self._lock:
            job = self._jobs.pop(job_id, None)
            if job is None:
                return None
            self._save_locked()
            return job

    def count_by_title(self, title: str) -> int:
        """Count existing jobs with a given title; used for auto-versioning."""
        with self._lock:
            return sum(1 for j in self._jobs.values() if j.title == title)

    def _load(self) -> None:
        with self._lock:
            if not self._path.exists():
                return
            try:
                data = json.loads(self._path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                return
            jobs: dict[str, Job] = {}
            for raw in data if isinstance(data, list) else []:
                if not isinstance(raw, dict):
                    continue
                job = Job.from_record(raw)
                if job.status == JobStatus.completed and (
                    not job.output_path or not job.output_path.exists()
                ):
                    job.status = JobStatus.failed
                    job.message = "输出文件不存在，请重新生成"
                    job.output_path = None
                jobs[job.job_id] = job
            self._jobs = jobs

    def _save_locked(self) -> None:
        payload = [job.to_record() for job in self._jobs.values()]
        tmp_path = self._path.with_suffix(f"{self._path.suffix}.tmp")
        tmp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp_path.replace(self._path)


job_store = JobStore(settings.job_store_path)
