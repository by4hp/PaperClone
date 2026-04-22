"""Structured exam paper schema.

The LLM outputs JSON conforming to `ExamPaper`; the PDF renderer walks this
structure to produce the final layout (questions without inline answers, then
an answer key with source-quoted explanations at the end).
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

SectionType = Literal[
    "single_choice",
    "multi_choice",
    "true_false",
    "short_answer",
    "essay",
]


class Option(BaseModel):
    label: str  # "A", "B", "C", "D", "E", "F"
    text: str


class Question(BaseModel):
    number: int  # numbering within a section; normalized server-side if needed
    stem: str
    options: list[Option] = Field(default_factory=list)
    answer: str  # "B" | "ABCD" | "√" | "×" | short answer key points
    explanation: str = ""
    legal_basis: Optional[str] = None  # e.g. "《行政处罚法》第三十三条"
    source_quote: Optional[str] = None  # verbatim snippet from content source


class Section(BaseModel):
    title: str  # e.g. "一、单项选择题（共 30 题，每题 2 分）"
    type: SectionType
    questions: list[Question]


class ExamPaper(BaseModel):
    header_lines: list[str]  # top block lines, shown centered
    subtitle: Optional[str] = None  # e.g. "（A 卷）"
    duration_minutes: int = 120
    total_score: int = 100
    show_name_score_row: bool = True  # 姓名／得分 fill-in row
    sections: list[Section]
