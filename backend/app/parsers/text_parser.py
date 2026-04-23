from pathlib import Path


def parse_text(path: Path) -> str:
    """Read a plain-text file. Try utf-8 first, fall back to gbk for legacy Chinese files."""
    raw = path.read_bytes()
    for encoding in ("utf-8", "utf-8-sig", "gbk", "gb18030"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")
