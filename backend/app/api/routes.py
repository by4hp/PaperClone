from __future__ import annotations

import re
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse, HTMLResponse

from jinja2 import Environment, FileSystemLoader, select_autoescape

from ..config import settings
from ..models.schemas import GenerateRequest, JobResponse, JobStatus, UploadResponse
from ..paper_types import BUILTIN_TYPES, get_paper_type
from ..paper_types.models import PaperType
from ..parsers import SUPPORTED_SUFFIXES
from ..services.job_store import job_store
from ..services.pipeline import run_generation

router = APIRouter()


_ALLOWED_SUFFIXES = SUPPORTED_SUFFIXES
_UNSAFE_FILENAME_CHARS = re.compile(r'[\\/:*?"<>|\s]+')


def _safe_filename_component(text: str) -> str:
    cleaned = _UNSAFE_FILENAME_CHARS.sub("_", text).strip("._")
    return cleaned or "模拟试卷"


def _build_filename(title: str) -> str:
    existing = job_store.count_by_title(title)
    version_suffix = f"_v{existing + 1}" if existing >= 1 else ""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{_safe_filename_component(title)}_{ts}{version_suffix}.pdf"


@router.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)) -> UploadResponse:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _ALLOWED_SUFFIXES:
        raise HTTPException(400, f"Unsupported file type: {suffix}")

    file_id = uuid.uuid4().hex
    dest = settings.upload_dir / f"{file_id}{suffix}"
    content = await file.read()
    dest.write_bytes(content)

    return UploadResponse(file_id=file_id, filename=file.filename or dest.name, size=len(content))


_SAMPLE_DIR = Path(__file__).resolve().parent.parent / "sample_assets"


@router.get("/paper-types", response_model=list[PaperType])
async def list_paper_types() -> list[PaperType]:
    return BUILTIN_TYPES


@router.get("/paper-types/{type_id}/sample")
async def paper_type_sample(type_id: str) -> FileResponse:
    pt = get_paper_type(type_id)
    if pt is None:
        raise HTTPException(404, f"Unknown paper_type_id: {type_id}")
    sample_path = _SAMPLE_DIR / f"{type_id}.pdf"
    if not sample_path.exists():
        raise HTTPException(404, "Sample PDF not bundled for this type")
    return FileResponse(
        path=str(sample_path),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=\"{type_id}_sample.pdf\""},
    )


@router.post("/generate", response_model=JobResponse)
async def generate(req: GenerateRequest, bg: BackgroundTasks) -> JobResponse:
    if not req.source_file_ids:
        raise HTTPException(400, "source_file_ids is required")

    paper_type: PaperType | None = None
    if req.paper_type_id:
        paper_type = get_paper_type(req.paper_type_id)
        if paper_type is None:
            raise HTTPException(400, f"Unknown paper_type_id: {req.paper_type_id}")
    elif not req.reference_file_ids:
        raise HTTPException(
            400, "Either paper_type_id or reference_file_ids must be provided"
        )

    ref_paths: list[Path] = []
    if req.reference_file_ids:
        resolved = [_find_upload(fid) for fid in req.reference_file_ids]
        if any(p is None for p in resolved):
            raise HTTPException(404, "One or more reference files missing; please re-upload")
        ref_paths = [p for p in resolved if p is not None]

    src_resolved = [_find_upload(fid) for fid in req.source_file_ids]
    if any(p is None for p in src_resolved):
        raise HTTPException(404, "One or more source files missing; please re-upload")
    src_paths: list[Path] = [p for p in src_resolved if p is not None]

    title = req.title or (paper_type.name if paper_type else "模拟试卷")
    duration = req.duration_minutes or (paper_type.default_duration_minutes if paper_type else 120)
    total_score = req.total_score or (paper_type.total_score if paper_type else 100)
    header_lines = req.header_lines or (paper_type.default_header_lines if paper_type else [title])
    subtitle = None

    filename = _build_filename(title)
    job_id = uuid.uuid4().hex
    job_store.create(job_id, title=title, filename=filename)
    bg.add_task(
        run_generation,
        job_id=job_id,
        paper_type=paper_type,
        reference_paths=ref_paths,
        source_paths=src_paths,
        title=title,
        header_lines=header_lines,
        subtitle=subtitle,
        duration=duration,
        total_score=total_score,
        filename=filename,
        model=req.model,
    )
    return _to_response(job_id)


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str) -> JobResponse:
    if not job_store.get(job_id):
        raise HTTPException(404, "Job not found")
    job_store.touch(job_id)
    return _to_response(job_id)


@router.delete("/jobs/{job_id}", status_code=204)
async def delete_job(job_id: str) -> Response:
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status not in {JobStatus.completed, JobStatus.failed}:
        raise HTTPException(409, "Job is still running and cannot be deleted")

    if job.output_path and job.output_path.exists():
        job.output_path.unlink()
    sibling = _no_answers_sibling(job.output_path)
    if sibling and sibling.exists():
        sibling.unlink()

    job_store.delete(job_id)
    return Response(status_code=204)


@router.get("/dev/template-preview", response_class=HTMLResponse)
async def dev_template_preview() -> HTMLResponse:
    """Renders the exam template with the canned mock paper. Dev-only helper
    for iterating on layout without running the full pipeline."""
    import json as _json
    from ..generator.mock import _CANNED_EXAM
    from ..models.exam import ExamPaper

    paper = ExamPaper.model_validate(_json.loads(_json.dumps(_CANNED_EXAM)))
    tpl_env = Environment(
        loader=FileSystemLoader(Path(__file__).resolve().parent.parent / "pdf" / "templates"),
        autoescape=select_autoescape(["html", "xml"]),
    )
    html = tpl_env.get_template("exam.html").render(paper=paper, paper_title="模板预览")
    return HTMLResponse(html)


@router.get("/jobs/{job_id}/download")
async def download(
    job_id: str,
    with_answers: int = Query(1, ge=0, le=1),
) -> FileResponse:
    job = job_store.get(job_id)
    if not job or not job.output_path:
        raise HTTPException(404, "Result not ready")
    job_store.touch(job_id)

    if with_answers:
        path = job.output_path
        fname = job.filename or f"{job_id}.pdf"
    else:
        sibling = _no_answers_sibling(job.output_path)
        if not sibling or not sibling.exists():
            # Older jobs rendered before the feature shipped only have the
            # combined file; fall back to it so the link never 404s.
            path = job.output_path
            fname = job.filename or f"{job_id}.pdf"
        else:
            path = sibling
            fname = _no_answers_filename(job.filename or f"{job_id}.pdf")

    quoted = quote(fname)
    return FileResponse(
        path=str(path),
        media_type="application/pdf",
        filename=fname,
        headers={
            "Content-Disposition": f"attachment; filename=\"{quoted}\"; filename*=UTF-8''{quoted}",
        },
    )


def _no_answers_sibling(output_path: Path | None) -> Path | None:
    if not output_path:
        return None
    return output_path.with_name(f"{output_path.stem}_no_answers{output_path.suffix}")


def _no_answers_filename(filename: str) -> str:
    p = Path(filename)
    stem = p.stem or "模拟试卷"
    suffix = p.suffix or ".pdf"
    return f"{stem}_无答案{suffix}"


def _to_response(job_id: str) -> JobResponse:
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return JobResponse(
        job_id=job.job_id,
        status=job.status,
        message=job.message,
        output_url=f"/api/jobs/{job.job_id}/download" if job.status == JobStatus.completed else None,
        title=job.title or None,
        filename=job.filename or None,
        created_at=job.created_at.isoformat() if job.created_at else None,
    )


def _find_upload(file_id: str) -> Path | None:
    for suffix in _ALLOWED_SUFFIXES:
        p = settings.upload_dir / f"{file_id}{suffix}"
        if p.exists():
            return p
    return None
