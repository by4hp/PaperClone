from __future__ import annotations

import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup, escape
from weasyprint import HTML

from ..models.exam import ExamPaper

_TEMPLATE_DIR = Path(__file__).parent / "templates"
_env = Environment(
    loader=FileSystemLoader(_TEMPLATE_DIR),
    autoescape=select_autoescape(["html", "xml"]),
)

# Matches cloze blank placeholders in stems: （ ）, （  ）, （　）, etc.
_BLANK_RE = re.compile(r"（[\s　]{0,6}）")


def _fill_stem_blank(stem: str, answer: str) -> Markup:
    """Replace the LAST cloze blank （ ） in stem with （ answer ）.

    Used by the exam template for the 有答案 version so that fill-in-the-blank
    style questions (e.g. "必须坚定（ ）") show the answer inline like the
    reference paper.  Multiple blanks in mid-sentence (e.g. Q20-style
    "之日起（ ）个工作日…延长（ ）个工作日") have only their LAST blank
    filled; the earlier blanks remain visible as （ ）.
    """
    escaped = str(escape(stem))
    escaped_answer = str(escape(answer))
    matches = list(_BLANK_RE.finditer(escaped))
    if not matches:
        return Markup(escaped)
    last = matches[-1]
    filled = (
        escaped[: last.start()]
        + f"（ {escaped_answer} ）"
        + escaped[last.end() :]
    )
    return Markup(filled)


_env.filters["fill_blank"] = _fill_stem_blank


def render_exam_pdf(
    paper: ExamPaper,
    output_path: Path,
    *,
    paper_title: str,
    include_answers: bool = True,
) -> Path:
    template = _env.get_template("exam.html")
    html = template.render(
        paper=paper,
        paper_title=paper_title,
        include_answers=include_answers,
    )
    HTML(string=html, base_url=str(_TEMPLATE_DIR)).write_pdf(str(output_path))
    return output_path
