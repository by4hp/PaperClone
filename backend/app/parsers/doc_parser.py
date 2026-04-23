from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from .docx_parser import parse_docx


class DocConversionError(RuntimeError):
    pass


def _find_soffice() -> str | None:
    for name in ("soffice", "libreoffice"):
        path = shutil.which(name)
        if path:
            return path
    return None


def parse_doc(path: Path) -> str:
    """Parse legacy .doc by converting to .docx via LibreOffice headless."""
    soffice = _find_soffice()
    if not soffice:
        raise DocConversionError(
            "解析 .doc 需要系统安装 LibreOffice（apt install libreoffice 或 brew install --cask libreoffice）。"
            "也可以把文件另存为 .docx 后重新上传。"
        )

    with tempfile.TemporaryDirectory(prefix="paperclone_doc_") as tmpdir:
        tmp = Path(tmpdir)
        try:
            subprocess.run(
                [soffice, "--headless", "--convert-to", "docx", "--outdir", str(tmp), str(path)],
                check=True,
                capture_output=True,
                timeout=120,
            )
        except subprocess.TimeoutExpired as e:
            raise DocConversionError("LibreOffice 转换 .doc 超时（>120s）") from e
        except subprocess.CalledProcessError as e:
            stderr = e.stderr.decode("utf-8", errors="replace") if e.stderr else ""
            raise DocConversionError(f"LibreOffice 转换 .doc 失败：{stderr.strip() or e}") from e

        converted = tmp / f"{path.stem}.docx"
        if not converted.exists():
            produced = list(tmp.glob("*.docx"))
            if not produced:
                raise DocConversionError("LibreOffice 未生成 .docx 输出")
            converted = produced[0]
        return parse_docx(converted)
