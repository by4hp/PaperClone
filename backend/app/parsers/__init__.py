from pathlib import Path
from .pdf_parser import parse_pdf
from .docx_parser import parse_docx


def parse_document(path: Path) -> str:
    """Dispatch to the right parser based on file extension. Returns plain text."""
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return parse_pdf(path)
    if suffix in (".docx", ".doc"):
        return parse_docx(path)
    raise ValueError(f"Unsupported file type: {suffix}")
