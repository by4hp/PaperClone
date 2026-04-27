"""Style-fidelity metrics for benchmarking generated papers vs a reference.

All metrics are computed from text alone — no LLM judge in MVP. Each metric
is intentionally simple so it can be sanity-checked by eye.

The **reference baseline** is computed by the same module the production
extract pipeline uses (`app.paper_types.stats`), so the targets we measure
against are identical to the targets we feed into the generator's prompt.
"""

from __future__ import annotations

import re
import statistics
from typing import Any

# Re-export the shared reference-side computation so eval and production
# stay in lockstep. Keep the legacy name `reference_metrics_from_text` as
# an alias for backward compatibility with old runner scripts.
from app.paper_types.stats import (  # noqa: F401
    reference_stats_from_text as reference_metrics_from_text,
)


# Citations like "《广告法》第十二条" or "《XX条例》第8条". Matching this
# tells us whether the model bothers to cite a specific article.
_ARTICLE_RE = re.compile(r"第\s*[一-龥\d]+\s*条")

# Stems beginning with these patterns are case-introduction questions
# (情境/案例题). Mirrors the producer-side pattern in app.paper_types.stats.
_SCENARIO_RE = re.compile(
    r"^\s*(某|XX|小[A-Z甲乙丙丁戊己]|王某|张某|李某|赵某|钱某|刘某|根据案例|阅读)"
)


def compute_metrics(paper: dict[str, Any]) -> dict[str, Any]:
    """Compute style metrics from a generated paper JSON dict (the LLM output).

    Returns a flat dict; missing fields default to 0 / [].
    """
    sections = paper.get("sections", []) or []
    all_qs = [q for s in sections for q in s.get("questions", []) or []]
    if not all_qs:
        return {"valid": 0, "total_questions": 0}

    stems = [(q.get("stem") or "").strip() for q in all_qs]
    stem_lens = [len(s) for s in stems]

    # Length distribution
    long_stem_count = sum(1 for L in stem_lens if L >= 80)
    mid_stem_count = sum(1 for L in stem_lens if 30 <= L < 80)
    short_stem_count = sum(1 for L in stem_lens if L < 30)

    # Diversity: first-6-char dedup ratio
    starts = [s[:6] for s in stems]
    unique_starts = len(set(starts))

    # Scenario / case-intro question count
    scenario_count = sum(1 for s in stems if _SCENARIO_RE.match(s))

    # Citation granularity (only on questions that have any citation)
    citations = [(q.get("citation") or "").strip() for q in all_qs]
    cited = [c for c in citations if c]
    cit_with_article = sum(1 for c in cited if _ARTICLE_RE.search(c))

    # Multi-choice options distribution
    multi_qs = [
        q for s in sections if s.get("type") == "multi_choice"
        for q in s.get("questions", []) or []
    ]
    multi_opt_counts = [len(q.get("options") or []) for q in multi_qs]

    # Structure summary (used for sanity check, not scored)
    sections_summary = [
        {
            "type": s.get("type"),
            "count": len(s.get("questions") or []),
        }
        for s in sections
    ]

    return {
        "valid": 1,
        "total_questions": len(stems),
        "stem_len_mean": round(statistics.mean(stem_lens), 1),
        "stem_len_std": round(statistics.stdev(stem_lens), 1) if len(stem_lens) > 1 else 0.0,
        "stem_len_max": max(stem_lens),
        "long_stem_count": long_stem_count,
        "mid_stem_count": mid_stem_count,
        "short_stem_count": short_stem_count,
        "long_stem_ratio": round(long_stem_count / len(stems), 3),
        "unique_starts": unique_starts,
        "unique_starts_ratio": round(unique_starts / len(stems), 3),
        "scenario_count": scenario_count,
        "cited_questions": len(cited),
        "cit_with_article": cit_with_article,
        "cit_with_article_pct": round(cit_with_article / len(cited), 3) if cited else 0.0,
        "multi_opt_min": min(multi_opt_counts) if multi_opt_counts else 0,
        "multi_opt_max": max(multi_opt_counts) if multi_opt_counts else 0,
        "sections_summary": sections_summary,
    }


