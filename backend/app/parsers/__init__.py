from pathlib import Path

from .doc_parser import parse_doc
from .docx_parser import parse_docx
from .pdf_parser import parse_pdf
from .rtf_parser import parse_rtf
from .text_parser import parse_text

SUPPORTED_SUFFIXES = frozenset({".pdf", ".docx", ".doc", ".rtf", ".txt", ".md", ".markdown"})


def parse_document(path: Path) -> str:
    """Dispatch to the right parser based on file extension. Returns plain text."""
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return parse_pdf(path)
    if suffix == ".docx":
        return parse_docx(path)
    if suffix == ".doc":
        return parse_doc(path)
    if suffix == ".rtf":
        return parse_rtf(path)
    if suffix in (".txt", ".md", ".markdown"):
        return parse_text(path)
    raise ValueError(f"Unsupported file type: {suffix}")
