from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


SectionType = Literal[
    "single_choice",
    "multi_choice",
    "true_false",
    "short_answer",
    "essay",
]


class PaperTypeSection(BaseModel):
    """One section of a paper-type blueprint (shape, not content)."""

    title: str  # e.g. "一、单项选择题（共 30 题，每题 2 分）"
    type: SectionType
    question_count: int
    score_per_question: float


class PaperType(BaseModel):
    id: str  # stable slug, e.g. "regulation_a"
    name: str  # human label
    description: str  # one-liner for UI
    default_header_lines: list[str]
    default_subtitle: Optional[str] = None
    default_duration_minutes: int = 120
    sections: list[PaperTypeSection]
    # Full text of the original reference paper. Acts as the style anchor —
    # the LLM imitates phrasing, distractor design, explanation format
    # directly from this text rather than from prose-encoded rules. Same
    # text reused across many generations of the same paper type → DeepSeek
    # automatic prefix cache makes this near-free.
    reference_text: str = ""
    # Auto-derived numeric stats from the reference paper (regex-based, no
    # LLM). The generator embeds these into its prompt as "natural targets"
    # so it knows the expected length distribution & stem-diversity for THIS
    # specific paper type. Schema kept open (dict) — see eval/metrics.py
    # `reference_metrics_from_text` for the producer.
    reference_stats: Optional[dict] = None
    sample_pdf_url: Optional[str] = None
    source: Literal["builtin", "user"] = "builtin"

    @property
    def total_score(self) -> int:
        return int(
            sum(s.question_count * s.score_per_question for s in self.sections)
        )
