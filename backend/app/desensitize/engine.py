"""Desensitization engine.

Strategy:
1. Replace government unit names first. We find a known suffix (市场监督管理局、
   公安局 …) then walk backward character-by-character to collect a geographic
   prefix that ends in one of 市/省/县/区/州/盟/旗/自治区. The whole matched span
   is replaced with `<fictional_city><original suffix>`.
2. Replace person names. Uses a surname-pool + 1~2 trailing CJK chars regex.
   The name pass operates on spans that were NOT touched by the gov pass, so
   we never re-replace characters that came from our own replacement pool.
3. One original → one replacement, consistent across the whole document. The
   mapping is kept in-memory only; never returned to the caller.
"""

from __future__ import annotations

import random
import re
from dataclasses import dataclass, field

from .pools import (
    FEMALE_NAMES,
    FICTIONAL_CITIES,
    GOV_UNIT_SUFFIXES,
    MALE_NAMES,
)

# Common Chinese surnames — used by the lightweight name detector.
_SURNAMES = (
    "王李张刘陈杨赵黄周吴徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯于董萧程曹袁邓"
    "许傅沈曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊"
    "金陆郝孔白崔康毛邱秦江史顾侯邵孟龙万段雷钱汤尹黎易常武乔贺赖龚文"
)

_NAME_RE = re.compile(rf"([{_SURNAMES}][\u4e00-\u9fff]{{1,2}})")

# Sentence-boundary particles: prepositions, conjunctions, copulas, auxiliary
# verbs. Used as the STOP boundary when walking back for a gov unit prefix.
# Deliberately excludes locatives like 上/下/中/前/后 because those legitimately
# appear inside place names (上海、下关、中山、前门、后溪).
_GOV_STOP_CHARS = set(
    "的是在和与也了都就将向对从到去被把给让使但而为所以如由及或若因其"
    "已又只更能会并同共今昨着过之乎者矣很最再经由于把让"
    "括含等该本任自沿替朝据按依随向着当使令"
)

# Trailing-char blacklist for person names. Applied as a trim pass after the
# greedy surname+1~2 regex match. These characters virtually never appear at
# the END of a Chinese given name.
_NAME_TAIL_STOP_CHARS = _GOV_STOP_CHARS | set(
    "两几多少某各每任此其那这哪位个件条幅份次回遍趟场届"
    "同志老师主任处长局长书记先生女士同学部长院长组长教授院士委员"
)

_GOV_SUFFIX_RE = re.compile("|".join(sorted(GOV_UNIT_SUFFIXES, key=len, reverse=True)))
_GEO_TAILS = ("自治区", "市", "省", "县", "区", "州", "盟", "旗")
_MAX_PREFIX_CJK_BEFORE_GEO = 8  # upper guard — stop sooner at particle boundary.

_CJK_LO, _CJK_HI = "\u4e00", "\u9fff"


@dataclass
class DesensitizeResult:
    text: str
    mapping: dict[str, str] = field(default_factory=dict)


def _is_cjk(ch: str) -> bool:
    return _CJK_LO <= ch <= _CJK_HI


def _find_gov_prefix_start(text: str, suffix_start: int) -> int | None:
    """Walk back from `suffix_start` to find a valid `<location><geo_tail>` prefix.

    Returns the start index (inclusive) of the prefix, or None if the text right
    before the gov suffix does not end with a geo tail.
    """
    # Step 1: the text immediately before suffix_start must end in a geo tail.
    tail_len = 0
    for tail in _GEO_TAILS:
        if text.endswith(tail, 0, suffix_start):
            tail_len = len(tail)
            break
    if tail_len == 0:
        return None

    # Step 2: walk further back across CJK chars. Stop at the first of:
    #   - non-CJK char (punctuation, digit, space)
    #   - a grammar particle/verb (在/由/对/的/…) that can't be part of a place name
    #   - exceeding _MAX_PREFIX_CJK_BEFORE_GEO (safety guard)
    geo_start = suffix_start - tail_len
    name_start = geo_start
    steps = 0
    while (
        name_start > 0
        and steps < _MAX_PREFIX_CJK_BEFORE_GEO
        and _is_cjk(text[name_start - 1])
        and text[name_start - 1] not in _GOV_STOP_CHARS
    ):
        name_start -= 1
        steps += 1
    # Require at least one CJK char before the geo tail — "市市场监督管理局" alone is nonsense.
    if name_start == geo_start:
        return None
    return name_start


def _pick_name(rng: random.Random, used: set[str]) -> str:
    pool = MALE_NAMES + FEMALE_NAMES
    rng.shuffle(pool)
    for candidate in pool:
        if candidate not in used:
            return candidate
    return f"{rng.choice(pool)}{rng.randint(1, 99)}"


def _pick_city(rng: random.Random, used: set[str]) -> str:
    pool = list(FICTIONAL_CITIES)
    rng.shuffle(pool)
    for candidate in pool:
        if candidate not in used:
            return candidate
    return rng.choice(pool)


def desensitize(text: str, seed: int | None = None) -> DesensitizeResult:
    rng = random.Random(seed)
    mapping: dict[str, str] = {}
    used_names: set[str] = set()
    used_cities: set[str] = set()

    # --- Pass 1: government units ---
    # Build a list of (start, end, replacement) for non-overlapping matches,
    # then stitch the text back together. Also collect the index spans that
    # were replaced so pass 2 can skip them.
    replacements: list[tuple[int, int, str]] = []
    replaced_spans: list[tuple[int, int]] = []

    cursor = 0
    for m in _GOV_SUFFIX_RE.finditer(text):
        s, e = m.span()
        if s < cursor:
            # Overlaps with a previous (longer) match — skip.
            continue
        prefix_start = _find_gov_prefix_start(text, s)
        if prefix_start is None:
            continue
        original_full = text[prefix_start:e]
        original_suffix = text[s:e]
        if original_full not in mapping:
            city = _pick_city(rng, used_cities)
            used_cities.add(city)
            mapping[original_full] = city + original_suffix
        replacements.append((prefix_start, e, mapping[original_full]))
        replaced_spans.append((prefix_start, e))
        cursor = e

    out_parts: list[str] = []
    out_spans: list[tuple[int, int, bool]] = []  # (start_in_out, end_in_out, is_replacement)
    last = 0
    pos = 0
    for s, e, rep in replacements:
        original_chunk = text[last:s]
        out_parts.append(original_chunk)
        out_spans.append((pos, pos + len(original_chunk), False))
        pos += len(original_chunk)

        out_parts.append(rep)
        out_spans.append((pos, pos + len(rep), True))
        pos += len(rep)
        last = e
    trailing = text[last:]
    out_parts.append(trailing)
    out_spans.append((pos, pos + len(trailing), False))
    interim = "".join(out_parts)

    # --- Pass 2: person names — only over the non-replacement regions. ---
    def replace_name(match: re.Match[str]) -> str:
        original = match.group(1)
        # Trim trailing particles that the greedy regex accidentally captured
        # (e.g. "张三在" -> "张三", "李华主" -> "李华"). If trimming leaves just
        # the surname, skip the replacement — one char alone is not a name.
        trimmed = original
        while len(trimmed) > 1 and trimmed[-1] in _NAME_TAIL_STOP_CHARS:
            trimmed = trimmed[:-1]
        if len(trimmed) <= 1:
            return original
        suffix = original[len(trimmed):]
        if trimmed not in mapping:
            replacement = _pick_name(rng, used_names)
            used_names.add(replacement)
            mapping[trimmed] = replacement
        return mapping[trimmed] + suffix

    final_parts: list[str] = []
    for start, end, is_replacement in out_spans:
        chunk = interim[start:end]
        if is_replacement:
            final_parts.append(chunk)
        else:
            final_parts.append(_NAME_RE.sub(replace_name, chunk))
    return DesensitizeResult(text="".join(final_parts), mapping=mapping)
