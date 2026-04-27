"""Aggregate job-store records into a small usage dashboard.

Domain classification is intentionally rough — keyword matching against
job title + paper-type name. The categories are tuned for the kinds of
papers PaperClone has historically produced; unmatched titles fall into
「其他」rather than being silently dropped."""

from __future__ import annotations

from collections import Counter
from typing import Iterable

from .job_store import Job


# (domain_label, keyword_set) — order matters: first match wins.
_DOMAIN_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("法规/合规", ("法规", "法律", "法条", "条例", "执法", "监管", "市场监督", "行政", "合规", "纪检", "党纪")),
    ("公考/事业单位", ("公务员", "行测", "申论", "事业单位", "选调", "国考", "省考")),
    ("安全/质量", ("安全", "应急", "消防", "质量", "ISO", "标准化", "生产")),
    ("数学", ("数学", "高数", "微积分", "几何", "代数", "概率")),
    ("英语", ("英语", "english", "雅思", "托福", "阅读理解", "完形填空")),
    ("理综", ("物理", "化学", "生物")),
    ("文综/政史", ("历史", "政治", "思政", "党史", "马原", "毛概")),
    ("入职/培训", ("入职", "培训", "新员工", "业务知识", "岗前", "晋升")),
    ("党建/理论", ("党建", "党课", "理论学习", "二十大", "主题教育")),
]


def classify_domain(*texts: str | None) -> str:
    """Return a single domain label by matching keywords across the
    provided text fragments (paper-type name + job title)."""
    haystack = " ".join(t for t in texts if t).lower()
    if not haystack:
        return "其他"
    for label, keywords in _DOMAIN_RULES:
        for kw in keywords:
            if kw.lower() in haystack:
                return label
    return "其他"


def compute_stats(jobs: Iterable[Job]) -> dict:
    job_list = list(jobs)
    total = len(job_list)
    completed = sum(1 for j in job_list if j.status.value == "completed")
    failed = sum(1 for j in job_list if j.status.value == "failed")

    by_model: Counter[str] = Counter()
    by_domain: Counter[str] = Counter()
    by_paper_type: Counter[str] = Counter()
    for j in job_list:
        # Only count jobs that actually consumed an LLM call (i.e. not
        # pending — but completed and failed both did, so we count both).
        if j.status.value not in {"completed", "failed", "generating", "rendering"}:
            continue
        model_label = j.model or "未记录"
        by_model[model_label] += 1
        domain = classify_domain(j.paper_type_name, j.title)
        by_domain[domain] += 1
        if j.paper_type_name:
            by_paper_type[j.paper_type_name] += 1

    counted = sum(by_model.values())

    # Token + cache aggregates (DeepSeek + Claude expose; kie.ai does not).
    total_prompt = 0
    total_completion = 0
    total_cached = 0
    for j in job_list:
        total_prompt += j.prompt_tokens
        total_completion += j.completion_tokens
        total_cached += j.cached_tokens

    cache_hit_ratio = (
        round(total_cached / total_prompt * 100, 1) if total_prompt else 0.0
    )

    def _ranked(c: Counter) -> list[dict]:
        return [
            {"label": label, "count": cnt, "percent": round(cnt / counted * 100, 1) if counted else 0.0}
            for label, cnt in c.most_common()
        ]

    return {
        "total": total,
        "counted": counted,  # jobs that actually consumed an LLM call
        "completed": completed,
        "failed": failed,
        "tokens": {
            "prompt": total_prompt,
            "completion": total_completion,
            "cached": total_cached,
            "cache_hit_ratio": cache_hit_ratio,
        },
        "by_model": _ranked(by_model),
        "by_domain": _ranked(by_domain),
        "by_paper_type": _ranked(by_paper_type),
    }
