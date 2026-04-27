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
from ..generator import base as _llm_base
from ..generator.prompts import build_messages
from ..models.exam import ExamPaper
from ..models.schemas import JobStatus
from ..paper_types.models import PaperType
from ..paper_types.stats import extract_fewshot_questions
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
    """Render a paper-type's structural blueprint (sections only) into a
    compact text block. Style guidance comes from `pt.reference_text`,
    not from this function — keep it minimal."""

    def _fmt_score(v: float) -> str:
        return str(int(v)) if float(v).is_integer() else str(v)

    lines = []
    for s in pt.sections:
        lines.append(
            f"- {s.title}  [type={s.type} · count={s.question_count} · score_per_q={_fmt_score(s.score_per_question)}]"
        )
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
            structure_text = _blueprint_text(paper_type)
            reference_text = paper_type.reference_text or ""
            reference_stats = paper_type.reference_stats
            # Extract few-shot long-question examples from the reference so the
            # generator has a concrete upper-bound on stem complexity.  Falls
            # back to None (no injection) when reference_text is short/absent.
            fewshot = extract_fewshot_questions(reference_text, n=2) or None
        else:
            # Legacy raw-reference path: concat the uploaded files directly,
            # no separate structural blueprint or stats.
            structure_text = "（按参考试卷原文中的题型分布命题）"
            reference_text = _concat_docs(reference_paths)
            reference_stats = None
            fewshot = extract_fewshot_questions(reference_text, n=2) or None

        job_store.update(job_id, status=JobStatus.generating)
        client = get_llm_client(model)
        messages = build_messages(
            reference_text=reference_text,
            structure=structure_text,
            source_text=source_text,
            title=title,
            duration=duration,
            total_score=total_score,
            reference_stats=reference_stats,
            fewshot_stems=fewshot,
        )
        raw = await client.complete(messages, reasoning_effort="high")
        u = _llm_base.last_usage
        job_store.update(
            job_id,
            prompt_tokens=u.prompt_tokens,
            completion_tokens=u.completion_tokens,
            cached_tokens=u.cached_tokens,
        )

        json_str = _extract_json(raw)
        try:
            data = json.loads(json_str)
        except json.JSONDecodeError as e:
            debug_dir = settings.output_dir.parent / "debug"
            debug_dir.mkdir(parents=True, exist_ok=True)
            (debug_dir / f"{job_id}.raw.txt").write_text(raw, encoding="utf-8")
            (debug_dir / f"{job_id}.extracted.txt").write_text(json_str, encoding="utf-8")
            raise RuntimeError(f"LLM 返回的不是有效 JSON：{e}（原始响应已落盘 {job_id}.raw.txt）") from e

        # The LLM only emits `sections`; everything else is server-controlled
        # (PaperType + user inputs) and force-overlaid here so the PDF header,
        # duration and score are deterministic regardless of model output.
        data["header_lines"] = header_lines or [title]
        data["subtitle"] = subtitle or None
        data["duration_minutes"] = duration
        data["total_score"] = total_score

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
