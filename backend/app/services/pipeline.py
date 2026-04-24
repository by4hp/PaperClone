from __future__ import annotations

import asyncio
import json
import re
import sys
import traceback
from pathlib import Path
from typing import Optional

from pydantic import ValidationError

from ..config import settings
from ..generator import get_llm_client
from ..generator.prompts import build_messages
from ..models.exam import ExamPaper
from ..models.schemas import JobStatus
from ..paper_types.models import PaperType
from ..parsers import parse_document
from ..pdf import render_exam_pdf
from .job_store import job_store


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)
_TRAILING_EMPTY_PARENS_RE = re.compile(r"(?:\s*[（(]\s*[）)]\s*)+$")


def _extract_json(raw: str) -> str:
    stripped = raw.strip()
    m = _JSON_FENCE_RE.search(stripped)
    if m:
        return m.group(1).strip()
    first = stripped.find("{")
    last = stripped.rfind("}")
    if first != -1 and last != -1 and last > first:
        return stripped[first : last + 1]
    return stripped


def _concat_docs(paths: list[Path]) -> str:
    chunks: list[str] = []
    for idx, path in enumerate(paths, start=1):
        chunks.append(f"===== 文件 {idx}：{path.name} =====\n" + parse_document(path))
    return "\n\n".join(chunks)


def _blueprint_text(pt: PaperType) -> str:
    """Render a paper-type blueprint into a text block the LLM can follow."""
    lines = ["题型与题量：", ""]
    for s in pt.sections:
        lines.append(f"- {s.title}（type={s.type}，共 {s.question_count} 题，每题 {s.score_per_question} 分）")
    if pt.style_notes:
        lines.append("")
        lines.append("风格与要求：")
        lines.append(pt.style_notes)
    return "\n".join(lines)


def _renumber_sections(paper: ExamPaper) -> ExamPaper:
    for section in paper.sections:
        for idx, question in enumerate(section.questions, start=1):
            question.number = idx
    return paper


def _normalize_questions(paper: ExamPaper) -> ExamPaper:
    for section in paper.sections:
        for question in section.questions:
            if section.type == "true_false":
                question.options = []
                question.stem = _TRAILING_EMPTY_PARENS_RE.sub("", question.stem).rstrip()
    return paper


async def run_generation(
    *,
    job_id: str,
    paper_type: Optional[PaperType],
    reference_paths: list[Path],
    source_paths: list[Path],
    title: str,
    header_lines: list[str],
    subtitle: str | None,
    duration: int,
    total_score: int,
    filename: str,
    model: str | None = None,
) -> None:
    try:
        job_store.update(job_id, status=JobStatus.parsing)
        source_text = _concat_docs(source_paths)
        if paper_type is not None:
            reference_text = _blueprint_text(paper_type)
        else:
            reference_text = _concat_docs(reference_paths)

        job_store.update(job_id, status=JobStatus.generating)
        client = get_llm_client(model)
        messages = build_messages(
            reference_text=reference_text,
            source_text=source_text,
            title=title,
            duration=duration,
            total_score=total_score,
        )
        raw = await client.complete(messages, reasoning_effort="high")

        json_str = _extract_json(raw)
        try:
            data = json.loads(json_str)
        except json.JSONDecodeError as e:
            debug_dir = settings.output_dir.parent / "debug"
            debug_dir.mkdir(parents=True, exist_ok=True)
            (debug_dir / f"{job_id}.raw.txt").write_text(raw, encoding="utf-8")
            (debug_dir / f"{job_id}.extracted.txt").write_text(json_str, encoding="utf-8")
            raise RuntimeError(f"LLM 返回的不是有效 JSON：{e}（原始响应已落盘 {job_id}.raw.txt）") from e

        # Overlay user/type-provided header + subtitle so the PDF top block
        # reflects the type template even if the LLM improvised its own.
        if header_lines:
            data["header_lines"] = header_lines
        if subtitle is not None:
            data["subtitle"] = subtitle or None
        data.setdefault("duration_minutes", duration)
        data.setdefault("total_score", total_score)

        try:
            paper = ExamPaper.model_validate(data)
        except ValidationError as e:
            raise RuntimeError(f"LLM 返回 JSON 不符合试卷 schema：{e}") from e
        paper = _normalize_questions(paper)
        paper = _renumber_sections(paper)

        job_store.update(job_id, status=JobStatus.rendering)
        output_path = settings.output_dir / f"{job_id}.pdf"
        output_path_no_answers = settings.output_dir / f"{job_id}_no_answers.pdf"
        await asyncio.to_thread(
            render_exam_pdf, paper, output_path, paper_title=title, include_answers=True
        )
        await asyncio.to_thread(
            render_exam_pdf,
            paper,
            output_path_no_answers,
            paper_title=title,
            include_answers=False,
        )

        job_store.update(
            job_id,
            status=JobStatus.completed,
            output_path=output_path,
            filename=filename,
            message=None,
        )
    except Exception as exc:  # noqa: BLE001
        tb = traceback.format_exc()
        print(f"[pipeline] job {job_id} failed:\n{tb}", file=sys.stderr, flush=True)
        msg = str(exc) or f"{type(exc).__name__}: (no message)"
        job_store.update(job_id, status=JobStatus.failed, message=msg)
