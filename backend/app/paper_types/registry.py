"""Built-in paper types. Extend by appending to BUILTIN_TYPES; types are
identified by a stable string id used in URLs and request payloads."""

from __future__ import annotations

from .models import PaperType, PaperTypeSection


REGULATION_A = PaperType(
    id="regulation_a",
    name="法规知识测试",
    description="30 单选 + 20 判断 + 5 多选，满分 100 分，面向机关/事业单位法规条文考核。",
    default_header_lines=[
        "京海市场监督管理局",
        '"全员法规通"考法测试卷',
    ],
    default_subtitle="（A 卷）",
    default_duration_minutes=120,
    sections=[
        PaperTypeSection(
            title="一、单项选择题（共 30 题，每题 2 分）",
            type="single_choice",
            question_count=30,
            score_per_question=2,
        ),
        PaperTypeSection(
            title="二、判断题（共 20 题，每题 1 分）",
            type="true_false",
            question_count=20,
            score_per_question=1,
        ),
        PaperTypeSection(
            title="三、多项选择题（每题 4 分，共 20 分，每题至少有 2 个正确答案，多选、少选、错选均不得分）",
            type="multi_choice",
            question_count=5,
            score_per_question=4,
        ),
    ],
    style_notes=(
        "题目内容应严格基于给定的内容来源（法规条文、规范性文件等），"
        "题干陈述正式、书面、严谨，答案选项表述不得出现误导歧义。"
    ),
    sample_pdf_url="/api/paper-types/regulation_a/sample",
)


BUILTIN_TYPES: list[PaperType] = [REGULATION_A]


def get_paper_type(type_id: str) -> PaperType | None:
    for t in BUILTIN_TYPES:
        if t.id == type_id:
            return t
    return None
