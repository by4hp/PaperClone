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
    name: str  # human label, e.g. "法规知识测试 · A 卷"
    description: str  # one-liner for UI
    default_header_lines: list[str]  # centered header, e.g. ["XX 局", '"全员法规通"考法测试卷']
    default_subtitle: Optional[str] = None  # e.g. "（A 卷）"
    default_duration_minutes: int = 120
    sections: list[PaperTypeSection]
    style_notes: str = ""  # extra guidance appended to the system prompt
    sample_pdf_url: Optional[str] = None  # /api/paper-types/{id}/sample served by the API

    @property
    def total_score(self) -> int:
        return int(
            sum(s.question_count * s.score_per_question for s in self.sections)
        )
