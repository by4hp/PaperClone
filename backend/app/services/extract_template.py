"""Extract a PaperType blueprint from raw reference-paper text via LLM."""

from __future__ import annotations

import json
import re
import uuid
from pathlib import Path

from pydantic import ValidationError

from ..config import settings
from ..generator import get_llm_client
from ..generator.extract_prompts import build_extract_messages
from ..paper_types.models import PaperType
from ..paper_types.stats import reference_stats_from_text
from ..parsers import parse_document


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)

# Strip inline answer markers like "（ B ）" / "（ABCD）" / "（ √ ）" / "（×）"
# from the reference text before sending it to the generator. PDFs that claim
# to be 无答案 versions often still leak the answers into option-line area,
# which confuses the generator into treating （ X ） as part of the stem
# template and copying it verbatim.
_ANSWER_MARKER_RE = re.compile(
    r"[（(]\s*[A-Za-zＡ-Ｚ√×✓✗]+\s*[）)]"
)


def _strip_answer_markers(text: str) -> str:
    return _ANSWER_MARKER_RE.sub("（  ）", text)


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


async def extract_template(
    reference_paths: list[Path], *, model: str | None = None
) -> PaperType:
    reference_text = _concat_docs(reference_paths)

    # Extraction only resolves the structural skeleton (题型/题量/分值);
    # flash handles this reliably and finishes in seconds. The `model` arg
    # from the request is for *generation*, not extraction.
    client = get_llm_client("deepseek-v4-flash")
    messages = build_extract_messages(reference_text)
    raw = await client.complete(messages, reasoning_effort="high")

    json_str = _extract_json(raw)
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as e:
        debug_dir = settings.output_dir.parent / "debug"
        debug_dir.mkdir(parents=True, exist_ok=True)
        tag = uuid.uuid4().hex[:8]
        (debug_dir / f"extract_{tag}.raw.txt").write_text(raw, encoding="utf-8")
        raise RuntimeError(
            f"卷型抽取返回非 JSON：{e}（原始响应已落盘 extract_{tag}.raw.txt）"
        ) from e

    data.setdefault("id", f"user_{uuid.uuid4().hex[:8]}")
    data["source"] = "user"
    data.pop("sample_pdf_url", None)
    data.pop("style_notes", None)  # field removed; ignore if old extracts return it
    # Keep the FULL reference text as the style anchor. The generator reads
    # it verbatim; DeepSeek's prefix cache makes the second+ generation of
    # the same paper type near-free. Cap at 40k chars (~14k tokens) to stay
    # safely below model context limits and avoid blowing up IndexedDB on
    # the client. Inline answer markers stripped so the generator doesn't
    # treat "（ B ）" as part of the stem template.
    data["reference_text"] = _strip_answer_markers(reference_text[:40000])
    # Numeric stats (length distribution + stem-start diversity), regex-derived
    # from the original reference. Generator embeds these as natural targets so
    # it can self-adapt per paper type instead of relying on hardcoded prompts.
    data["reference_stats"] = reference_stats_from_text(reference_text)

    try:
        return PaperType.model_validate(data)
    except ValidationError as e:
        raise RuntimeError(f"抽取结果不符合 PaperType schema：{e}") from e
