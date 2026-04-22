from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

from ..models.exam import ExamPaper

_TEMPLATE_DIR = Path(__file__).parent / "templates"
_env = Environment(
    loader=FileSystemLoader(_TEMPLATE_DIR),
    autoescape=select_autoescape(["html", "xml"]),
)


def render_exam_pdf(paper: ExamPaper, output_path: Path, *, paper_title: str) -> Path:
    template = _env.get_template("exam.html")
    html = template.render(paper=paper, paper_title=paper_title)
    HTML(string=html, base_url=str(_TEMPLATE_DIR)).write_pdf(str(output_path))
    return output_path
