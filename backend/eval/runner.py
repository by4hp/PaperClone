"""MVP benchmark runner — orchestrate variants × runs, compute metrics,
write a markdown report.

Usage (run from backend/ with weasyprint DYLD env):
  DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib \\
    .venv/bin/python -m eval.runner --variants flash,pro --runs 2

Each run = one full LLM generation against the golden's reference paper +
source material. Reports land in backend/eval/reports/.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import statistics
import time
import traceback
from datetime import datetime
from pathlib import Path

from app.generator import get_llm_client
from app.generator.prompts import build_messages
from app.parsers import parse_document
from app.paper_types.models import PaperType, PaperTypeSection
from app.paper_types.stats import extract_fewshot_questions, reference_stats_from_text

from .metrics import compute_metrics


# -----------------------------------------------------------------------------
# Inlined helpers (avoid importing app.services.pipeline → weasyprint)
# -----------------------------------------------------------------------------


_ANSWER_MARKER_RE = re.compile(
    r"[（(]\s*[A-Za-zＡ-Ｚ√×ABCD]+\s*[）)]"
)


def _strip_answer_markers(text: str) -> str:
    return _ANSWER_MARKER_RE.sub("（  ）", text)


def _blueprint_text(pt: PaperType) -> str:
    def _fmt(v: float) -> str:
        return str(int(v)) if float(v).is_integer() else str(v)

    return "\n".join(
        f"- {s.title}  [type={s.type} · count={s.question_count} · score_per_q={_fmt(s.score_per_question)}]"
        for s in pt.sections
    )


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def _extract_json(raw: str) -> str:
    s = raw.strip()
    m = _JSON_FENCE_RE.search(s)
    if m:
        return m.group(1).strip()
    a, b = s.find("{"), s.rfind("}")
    return s[a : b + 1] if a != -1 and b != -1 else s


# -----------------------------------------------------------------------------
# Golden blueprints (hardcoded so we don't depend on extract LLM during eval)
# -----------------------------------------------------------------------------


GOLDEN_BLUEPRINTS: dict[str, PaperType] = {
    "regulation": PaperType(
        id="bench_regulation",
        name="嘉兴市秀洲区市场监督管理局考法测试卷",
        description="benchmark golden — 法规知识测试",
        default_header_lines=["（benchmark）"],
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
        reference_text="",  # populated at runtime
        source="user",
    ),
}


VARIANTS: dict[str, dict] = {
    "flash": {"model": "deepseek-v4-flash", "reasoning_effort": "high", "use_stats": False, "use_fewshot": False},
    "flash_stats": {"model": "deepseek-v4-flash", "reasoning_effort": "high", "use_stats": True, "use_fewshot": False},
    "flash_fewshot": {"model": "deepseek-v4-flash", "reasoning_effort": "high", "use_stats": True, "use_fewshot": True},
    "pro": {"model": "deepseek-v4-pro", "reasoning_effort": "high", "use_stats": False, "use_fewshot": False},
    "pro_stats": {"model": "deepseek-v4-pro", "reasoning_effort": "high", "use_stats": True, "use_fewshot": False},
    "pro_fewshot": {"model": "deepseek-v4-pro", "reasoning_effort": "high", "use_stats": True, "use_fewshot": True},
}


# -----------------------------------------------------------------------------
# One run
# -----------------------------------------------------------------------------


async def run_one(variant: str, paper_type: PaperType, source_text: str) -> dict:
    spec = VARIANTS[variant]
    client = get_llm_client(spec["model"])
    # A/B switch: stats are always computed at golden load time, but for
    # baseline variants we strip them out before calling build_messages so
    # the prompt falls back to the "no stats" path.
    stats_for_prompt = paper_type.reference_stats if spec.get("use_stats") else None
    fewshot = (
        extract_fewshot_questions(paper_type.reference_text or "", n=2) or None
        if spec.get("use_fewshot")
        else None
    )
    messages = build_messages(
        reference_text=paper_type.reference_text,
        structure=_blueprint_text(paper_type),
        source_text=source_text,
        title="benchmark — 全员法规通模拟考",
        duration=120,
        total_score=100,
        reference_stats=stats_for_prompt,
        fewshot_stems=fewshot,
    )
    started = time.time()
    raw = await client.complete(messages, reasoning_effort=spec["reasoning_effort"])
    elapsed = time.time() - started

    try:
        paper = json.loads(_extract_json(raw))
    except json.JSONDecodeError:
        # Malformed JSON is rare but happens with flash — retry once before giving up.
        print(f"    ↻ json_decode error, retrying once…", flush=True)
        started2 = time.time()
        raw = await client.complete(messages, reasoning_effort=spec["reasoning_effort"])
        elapsed = (time.time() - started2) + elapsed
        try:
            paper = json.loads(_extract_json(raw))
        except json.JSONDecodeError as e:
            return {
                "ok": False,
                "error": f"json_decode (after retry): {e}",
                "raw_preview": raw[:400],
                "elapsed_s": round(elapsed, 1),
            }
    return {
        "ok": True,
        "paper": paper,
        "elapsed_s": round(elapsed, 1),
        "raw_chars": len(raw),
    }


# -----------------------------------------------------------------------------
# Aggregation + report
# -----------------------------------------------------------------------------


def aggregate(rows: list[dict]) -> dict:
    """rows: list of compute_metrics(...) dicts"""
    if not rows:
        return {}
    keys = [
        "stem_len_mean",
        "stem_len_std",
        "stem_len_max",
        "long_stem_count",
        "long_stem_ratio",
        "mid_stem_count",
        "short_stem_count",
        "unique_starts",
        "unique_starts_ratio",
        "scenario_count",
        "cit_with_article_pct",
        "multi_opt_min",
        "multi_opt_max",
        "total_questions",
    ]
    agg = {}
    for k in keys:
        vals = [r.get(k, 0) for r in rows]
        agg[k] = round(statistics.mean(vals), 3)
        if len(vals) > 1:
            agg[f"{k}_std"] = round(statistics.stdev(vals), 3)
    return agg


def fmt_delta(d: float, decimals: int = 2) -> str:
    s = f"{d:+.{decimals}f}" if isinstance(d, float) else f"{d:+d}"
    return s


def write_report(
    *,
    out_path: Path,
    golden: str,
    variants: list[str],
    runs: int,
    ref_metrics: dict,
    per_variant: dict[str, dict],
    raw_runs: dict[str, list],
) -> str:
    lines: list[str] = []
    lines.append(f"# Benchmark — {golden}")
    lines.append("")
    lines.append(f"- generated at: `{datetime.now().isoformat(timespec='seconds')}`")
    lines.append(f"- variants: `{', '.join(variants)}`")
    lines.append(f"- runs per variant: `{runs}`")
    lines.append("")

    lines.append("## Reference paper baseline (regex-extracted from PDF)")
    lines.append("")
    lines.append("| metric | value |")
    lines.append("|---|---|")
    for k in [
        "total_questions",
        "stem_len_mean",
        "stem_len_std",
        "stem_len_max",
        "long_stem_count",
        "long_stem_ratio",
        "mid_stem_count",
        "short_stem_count",
        "unique_starts",
        "unique_starts_ratio",
        "scenario_count",
    ]:
        lines.append(f"| {k} | {ref_metrics.get(k, '—')} |")
    lines.append("")

    lines.append("## Per variant (mean over runs)")
    lines.append("")
    headers = [
        "variant",
        "ok/total",
        "elapsed_s",
        "stem_len_mean",
        "stem_len_max",
        "long_count",
        "long_ratio",
        "unique_starts",
        "scenario_cnt",
        "cit_w_article",
        "multi_opt(min~max)",
    ]
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("|" + "|".join(["---"] * len(headers)) + "|")
    for v in variants:
        agg = per_variant.get(v, {})
        runs_info = raw_runs.get(v, [])
        ok_count = sum(1 for r in runs_info if r.get("ok"))
        if not agg:
            lines.append(f"| {v} | {ok_count}/{len(runs_info)} | — | — | — | — | — | — | — | — | — |")
            continue
        elapsed_mean = round(
            statistics.mean([r["elapsed_s"] for r in runs_info if r.get("ok")]), 1
        )
        lines.append(
            "| "
            + " | ".join(
                [
                    v,
                    f"{ok_count}/{len(runs_info)}",
                    f"{elapsed_mean}",
                    f"{agg['stem_len_mean']}",
                    f"{agg['stem_len_max']}",
                    f"{agg['long_stem_count']}",
                    f"{agg['long_stem_ratio']}",
                    f"{agg['unique_starts']} ({agg['unique_starts_ratio']})",
                    f"{agg['scenario_count']}",
                    f"{agg['cit_with_article_pct']}",
                    f"{agg['multi_opt_min']}~{agg['multi_opt_max']}",
                ]
            )
            + " |"
        )
    lines.append("")

    lines.append("## Δ vs reference (closer to 0 is better)")
    lines.append("")
    headers2 = [
        "variant",
        "Δ_long_count",
        "Δ_long_ratio",
        "Δ_unique_starts",
        "Δ_scenario_cnt",
        "Δ_stem_len_mean",
        "Δ_stem_len_max",
    ]
    lines.append("| " + " | ".join(headers2) + " |")
    lines.append("|" + "|".join(["---"] * len(headers2)) + "|")
    for v in variants:
        agg = per_variant.get(v, {})
        if not agg:
            lines.append(f"| {v} | — | — | — | — | — | — |")
            continue

        def d(k: str) -> float:
            return agg.get(k, 0) - ref_metrics.get(k, 0)

        lines.append(
            "| "
            + " | ".join(
                [
                    v,
                    fmt_delta(d("long_stem_count"), 1),
                    fmt_delta(d("long_stem_ratio"), 3),
                    fmt_delta(d("unique_starts"), 1),
                    fmt_delta(d("scenario_count"), 1),
                    fmt_delta(d("stem_len_mean"), 1),
                    fmt_delta(d("stem_len_max"), 1),
                ]
            )
            + " |"
        )
    lines.append("")

    # Failed runs detail
    fails = [
        (v, i, r)
        for v, runs_info in raw_runs.items()
        for i, r in enumerate(runs_info)
        if not r.get("ok")
    ]
    if fails:
        lines.append("## Failed runs")
        lines.append("")
        for v, i, r in fails:
            lines.append(f"- **{v} run {i+1}**: {r.get('error', '?')}")
        lines.append("")

    text = "\n".join(lines) + "\n"
    out_path.write_text(text, encoding="utf-8")
    return text


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variants", default="flash,pro")
    ap.add_argument("--runs", type=int, default=2)
    ap.add_argument("--golden", default="regulation")
    ap.add_argument("--out", default=None)
    ap.add_argument("--concurrency", type=int, default=3,
                    help="max simultaneous API calls (default 3)")
    args = ap.parse_args()

    variants = [v.strip() for v in args.variants.split(",") if v.strip()]
    for v in variants:
        if v not in VARIANTS:
            raise SystemExit(f"unknown variant: {v} (choose from {list(VARIANTS)})")

    eval_root = Path(__file__).parent
    golden_dir = eval_root / "golden" / args.golden
    ref_pdf = golden_dir / "reference.pdf"
    src_path = golden_dir / "source.md"
    if not ref_pdf.exists():
        raise SystemExit(f"missing reference: {ref_pdf}")
    if not src_path.exists():
        raise SystemExit(f"missing source: {src_path}")

    print(f"📂 golden: {args.golden}")
    print(f"   reference: {ref_pdf.name}  source: {src_path.name}")
    raw_ref = parse_document(ref_pdf)
    ref_metrics = reference_stats_from_text(raw_ref)
    pt = GOLDEN_BLUEPRINTS[args.golden].model_copy(
        update={
            "reference_text": _strip_answer_markers(raw_ref[:40000]),
            "reference_stats": ref_metrics,
        }
    )
    source_text = src_path.read_text(encoding="utf-8")
    print(
        f"📐 reference baseline: {ref_metrics['total_questions']} 题 · "
        f"avg stem {ref_metrics['stem_len_mean']} 字 · "
        f"long(≥80) {ref_metrics['long_stem_count']} · "
        f"unique starts {ref_metrics['unique_starts']}"
    )
    print()

    raw_runs: dict[str, list] = {v: [] for v in variants}
    per_variant: dict[str, dict] = {}

    total_tasks = len(variants) * args.runs
    print(
        f"🚀 {total_tasks} tasks · concurrency={args.concurrency} "
        f"({len(variants)} variant(s) × {args.runs} run(s))…"
    )
    print()

    sem = asyncio.Semaphore(args.concurrency)

    async def _run_task(v: str, idx: int) -> tuple[str, dict]:
        label = f"[{v} #{idx+1}]"
        async with sem:
            print(f"  ▶ {label} started", flush=True)
            try:
                r = await run_one(v, pt, source_text)
            except Exception as e:
                traceback.print_exc()
                r = {"ok": False, "error": str(e), "elapsed_s": 0}
        if r.get("ok"):
            metrics = compute_metrics(r["paper"])
            r["metrics"] = metrics
            print(
                f"  ✓ {label} {r['elapsed_s']}s · "
                f"{metrics.get('total_questions',0)} 题 · "
                f"avg {metrics.get('stem_len_mean',0)}字 · "
                f"long {metrics.get('long_stem_count',0)} · "
                f"unique_starts {metrics.get('unique_starts',0)} · "
                f"scenario {metrics.get('scenario_count',0)}"
            )
        else:
            print(f"  ❌ {label} {r.get('error','?')} ({r['elapsed_s']}s)")
        return v, r

    results = await asyncio.gather(
        *[_run_task(v, i) for v in variants for i in range(args.runs)]
    )
    print()

    for v, r in results:
        raw_runs[v].append(r)

    for v in variants:
        ok_metrics = [r["metrics"] for r in raw_runs[v] if r.get("ok")]
        per_variant[v] = aggregate(ok_metrics)

    out_path = (
        Path(args.out)
        if args.out
        else eval_root
        / "reports"
        / f"{args.golden}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    text = write_report(
        out_path=out_path,
        golden=args.golden,
        variants=variants,
        runs=args.runs,
        ref_metrics=ref_metrics,
        per_variant=per_variant,
        raw_runs=raw_runs,
    )
    print("=" * 70)
    print(text)
    print("=" * 70)
    print(f"📄 saved: {out_path.relative_to(eval_root.parent)}")


if __name__ == "__main__":
    asyncio.run(main())
