"""Auto-derived numeric stats from a reference paper's parsed text.

Pure regex — no LLM. Used by the extract pipeline to populate
`PaperType.reference_stats`, which the generation prompt then embeds as
"natural targets" (length distribution, stem diversity, etc.).

Same file is also imported by `eval/metrics.py` for benchmark consistency:
the metrics we measure on generated papers must match the metrics we
extract from reference papers.
"""

from __future__ import annotations

import re
import statistics
from typing import Any


# Stems beginning with these patterns are case-introduction questions
# (情境/案例题). Reference paper detection is approximate — used as a soft
# signal only.
_SCENARIO_RE = re.compile(
    r"^\s*(某|XX|小[A-Z甲乙丙丁戊己]|王某|张某|李某|赵某|钱某|刘某|根据案例|阅读)"
)

# Inline answer markers (（ B ） / （√） / （ABCD）). Stripped before
# stem-length computation so they don't add noise.
_ANSWER_MARKER_RE = re.compile(
    r"[（(]\s*[A-Za-zＡ-Ｚ√×ABCD]+\s*[）)]"
)


def reference_stats_from_text(reference_text: str) -> dict[str, Any]:
    """Heuristic baseline stats from the reference PDF's parsed text.

    Splits on "N、" markers and cuts before the first option line to
    isolate stems. Approximate but stable enough for relative comparison
    and as prompt-target hints.
    """
    text = "\n" + reference_text
    pattern = re.compile(
        r"\n(\d+)、(.+?)(?=\n\s*\d+、|\n\s*[一二三四五六七八九十]、|\Z)",
        re.S,
    )
    raw_blocks = pattern.findall(text)
    stems: list[str] = []
    for _num, body in raw_blocks:
        body = body.strip()
        m = re.search(r"(?:\n|\s)\s*[A-DＡ-Ｄ]\s*[．.\s、]", body)
        stem = body[: m.start()].rstrip() if m else body[:300].rstrip()
        stem = _ANSWER_MARKER_RE.sub("", stem).rstrip()
        stems.append(stem)

    if not stems:
        return {"valid": 0, "total_questions": 0}

    stem_lens = [len(s) for s in stems]
    long_count = sum(1 for L in stem_lens if L >= 80)
    mid_count = sum(1 for L in stem_lens if 30 <= L < 80)
    short_count = sum(1 for L in stem_lens if L < 30)
    starts = [s[:6] for s in stems]
    scenario = sum(1 for s in stems if _SCENARIO_RE.match(s))

    return {
        "valid": 1,
        "total_questions": len(stems),
        "stem_len_mean": round(statistics.mean(stem_lens), 1),
        "stem_len_std": round(statistics.stdev(stem_lens), 1) if len(stem_lens) > 1 else 0.0,
        "stem_len_max": max(stem_lens),
        "long_stem_count": long_count,
        "mid_stem_count": mid_count,
        "short_stem_count": short_count,
        "long_stem_ratio": round(long_count / len(stems), 3),
        "unique_starts": len(set(starts)),
        "unique_starts_ratio": round(len(set(starts)) / len(stems), 3),
        "scenario_count": scenario,
    }


def extract_fewshot_questions(reference_text: str, n: int = 2) -> list[str]:
    """Extract the N longest question blocks from reference text for few-shot injection.

    Returns raw question strings (number + stem + options, capped at 600 chars
    each) so the model can observe the structural upper-limit of complexity in
    this specific paper type.  Content is kept verbatim — the prompt wrapper
    tells the model to mimic *form*, not copy *content*.
    """
    if not reference_text:
        return []
    text = "\n" + reference_text
    pattern = re.compile(
        r"\n(\d+)、(.+?)(?=\n\s*\d+、|\n\s*[一二三四五六七八九十]、|\Z)",
        re.S,
    )
    blocks = pattern.findall(text)
    if not blocks:
        return []

    scored: list[tuple[int, str]] = []
    for num, body in blocks:
        body = body.strip()
        # Stem ends just before the first option line
        m = re.search(r"(?:\n|\s)\s*[A-DＡ-Ｄ]\s*[．.\s、]", body)
        stem = body[: m.start()].rstrip() if m else body[:300].rstrip()
        stem_clean = _ANSWER_MARKER_RE.sub("", stem).rstrip()
        stem_len = len(stem_clean)
        # Keep a reasonable slice of the block (stem + first few options)
        block_text = f"{num}、{body[:600].rstrip()}"
        scored.append((stem_len, block_text))

    scored.sort(key=lambda x: -x[0])
    return [t for _, t in scored[:n]]


def render_reference_stats(stats: dict | None) -> str:
    """Render reference_stats dict into a Chinese prompt block.

    Returns a fallback notice when stats are missing — the generator can
    still operate, just without numeric targets.
    """
    if not stats or not stats.get("valid"):
        return "（参考卷统计未提供。请直接观察上方「参考试卷原文」自行判断长短分布。）"

    n = stats.get("total_questions", 0)
    if n == 0:
        return "（参考卷无可识别题目，无统计可用。）"

    long_c = stats.get("long_stem_count", 0)
    mid_c = stats.get("mid_stem_count", 0)
    short_c = stats.get("short_stem_count", 0)
    mean = stats.get("stem_len_mean", 0)
    mx = stats.get("stem_len_max", 0)
    std = stats.get("stem_len_std", 0)
    uniq = stats.get("unique_starts", 0)
    uniq_ratio = stats.get("unique_starts_ratio", 0)
    scenario = stats.get("scenario_count", 0)

    if long_c >= 2:
        long_hint = f"（其中长题 {long_c} 道是参考卷的显著特征——你的输出应有数量相近的长题，**不要全做成短题**）"
    elif long_c == 1:
        long_hint = "（参考卷有 1 道长题，可保留 1-2 道）"
    else:
        long_hint = "（参考卷无明显长题，无需刻意造长题）"

    parts = [
        f"- 参考卷总题量：{n} 道",
        f"- 题干长度：平均 {mean} 字 · 最长 {mx} 字 · 标准差 {std}",
        f"- 长度分布：短题(<30字) {short_c} 道 / 中等(30~79字) {mid_c} 道 / **长题(≥80字) {long_c} 道**",
        f"  {long_hint}",
        f"- 句式多样性：题干前 6 字去重 {uniq}/{n} ≈ {int(uniq_ratio*100)}% — 你的输出**应力求达到接近的多样性**，避免反复套用同一句式",
    ]
    if scenario > 0:
        parts.append(f"- 案例/情境引入题：参考卷约 {scenario} 道（'某 X 公司 / 小 X / 案例'等开头），可适当保留")

    return "\n".join(parts)
