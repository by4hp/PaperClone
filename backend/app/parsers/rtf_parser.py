from pathlib import Path

from striprtf.striprtf import rtf_to_text

from .text_parser import parse_text


def parse_rtf(path: Path) -> str:
    return rtf_to_text(parse_text(path))
