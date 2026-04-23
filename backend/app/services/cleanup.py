"""Background TTL sweep for jobs, output PDFs, and stale uploads.

Records are owned by the browser's local record ledger; the server is just
a short-lived factory. Anything not accessed within the configured TTL is
deleted. Runs on a timer started during app startup.
"""

from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path

from ..config import settings
from ..services.job_store import job_store

logger = logging.getLogger(__name__)


def sweep_once() -> None:
    _sweep_jobs()
    _sweep_orphan_uploads()


def _sweep_jobs() -> None:
    for job in job_store.expired(settings.job_ttl_days):
        paths: list[Path] = []
        if job.output_path:
            main = Path(job.output_path)
            paths.append(main)
            paths.append(main.with_name(f"{main.stem}_no_answers{main.suffix}"))
        for p in paths:
            try:
                if p.exists():
                    p.unlink()
            except OSError as exc:
                logger.warning("Failed to delete PDF %s: %s", p, exc)
        job_store.delete(job.job_id)
        logger.info("GC job %s (idle > %dd)", job.job_id, settings.job_ttl_days)


def _sweep_orphan_uploads() -> None:
    cutoff = time.time() - settings.upload_ttl_days * 86400
    for path in settings.upload_dir.glob("*"):
        if not path.is_file():
            continue
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink()
                logger.info("GC upload %s (age > %dd)", path.name, settings.upload_ttl_days)
        except OSError as exc:
            logger.warning("Failed to delete upload %s: %s", path, exc)


async def cleanup_loop() -> None:
    interval = max(60, settings.cleanup_interval_seconds)
    while True:
        try:
            sweep_once()
        except Exception:  # noqa: BLE001 — never let the loop crash
            logger.exception("cleanup sweep failed")
        await asyncio.sleep(interval)
