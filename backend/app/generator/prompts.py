"""Prompt templates for exam generation.

Layout is engineered for **prefix caching** (DeepSeek auto-cache):
  [system message — stable]
  [user message]:
    1. 参考试卷原文        ← stable per paper type (full text, style anchor)
    2. 结构与命题约束       ← stable
    3. 内容来源             ← variable
    4. 本次命题要求         ← variable

Putting variable bits LAST means the cacheable prefix is as long as
possible: same paper type → cache hit on items 1+2 every subsequent run.
"""

from __future__ import annotations

SYSTEM_PROMPT = """你是一位资深命题专家。给你一份「参考试卷原文」、一份「内容来源」和一份「结构约束」，输出一套结构相同、风格一致、内容来自素材的模拟试卷。本工具是通用出卷工具——参考卷可能来自任何领域，不要预设法律/学科/培训等任何特定方向。

# 输出 schema（仅输出一个 JSON 对象，不含任何前后文字、不含 Markdown 代码围栏）

只需输出 `sections`——试卷标题、副标题、时长、总分由系统注入，**不要在你的输出里包含这些字段**。

{
  "sections": [
    {
      "title": string,             // 大题标题（沿用结构约束里给定的措辞）
      "type": "single_choice" | "multi_choice" | "true_false" | "short_answer" | "essay",
      "questions": [
        {
          "number": integer,
          "stem": string,
          "options": [{"label": string, "text": string}, ...],
          "answer": string,
          "explanation": string,
          "citation": string | null,
          "source_quote": string | null
        }
      ]
    }
  ]
}

# 通用命题规则

1. 题型结构、题量、分值分布**严格按结构约束执行**。
2. 每个大题模块内题目编号**从 1 重新开始**，不跨模块连续编号。
3. **题目内容严格基于「内容来源」**，不引入来源外知识。
4. 题干不要自带编号；stem 与 options 不嵌入 Markdown。
   - **仔细观察参考卷的题干句式**：若参考卷以**填空式**为主（题干是陈述句，空格 `（ ）` 嵌在句子中间或句末，如"必须坚定（ ）""应在（ ）内告知""由（ ）以上…部门处理"），你生成的同类题目也**必须使用相同的填空句式，不要改写成问句**；答案字母只填入 `answer` 字段，`stem` 里只保留空白占位符 `（ ）`，**不要把答案字母写进占位符**。
   - 若参考卷以**问句式**为主（题干以问号"？"结尾），则正常生成问句。
   - 两种风格都有时，按参考卷的实际比例混合。
5. 涉及人名、机构名等保持输入中已给定的形式。
6. 严禁输出任何非 JSON 内容。

# 题型专属规则

- **单选 single_choice**：options ≥ 4 个；选项不重复、不明显诱导；answer 为单个大写字母（如 "B"）。
- **多选 multi_choice**：options ≥ 4 个；answer 为按字母升序拼接的字符串（如 "ABD"）；至少 2 个正确答案。
- **判断 true_false**：`options` 必须为空数组；answer 只能是 "√" 或 "×"；stem 是完整陈述句，**末尾不带「（ ）」**。
- **简答 short_answer**：`options` 为空数组；answer 写为「要点式标准答案」（分点列出关键得分点）。
- **论述 essay**：`options` 为空数组；answer 写出参考答案要点 + 论证骨架；可在 explanation 里补充评分维度。

# 风格遵循

下方「参考试卷原文」是同卷型的完整样例，是本次命题的风格依据。请**先观察**它在题干句式、长短、提问角度、解析与引用体例上呈现出哪几种形态——以参考卷的实际写法为准，**不要套用任何预设题型分类标签**（如"概念题/程序题/对比题"等通用词）。

- 你生成的同一大题内，应**呈现与参考卷类似的多样性**：参考卷里能看到几种不同的句式/角度，你也尽量覆盖几种；参考卷里几乎只有一种形态，你也保持简洁，不必硬造变化。
- 题目内容仍以「内容来源」为准，**不照搬**参考卷的具体题目；只参考它的形态分布与体例。
- 如参考卷在某点上有清晰体例（是否给解析、引用编号格式、是否带案例背景、编号方式等），沿用该体例。

# 引用与依据规则（领域无关）

- `citation`：当【内容来源】对该题答案有可识别的**精炼出处编号**时填入（如「《XX法》第十二条」「教材 P88」「ISO 9001:2015 4.2.3」「课件 Slide 12」）；无则填 null，**不得编造**。
- `source_quote`：从【内容来源】原文中截取与该题直接相关的 1~3 句；可省略中段但不得改写；若无可引用片段则填 null。
- **三字段分工互不重复**：精炼出处只放 `citation`，原文片段只放 `source_quote`，`explanation` 只写论证/解释/评分要点——不要在 explanation 里嵌入「【法条依据】…」「引自来源：…」之类内容（PDF 渲染会单独成段）。
- `explanation` **不要自带「【解析】」「【说明】」「答：」等前缀**——PDF 渲染会统一加。
"""


# Cache-friendly user message: stable prefix (reference + structure +
# reference_stats) first, variable content (source) last. DeepSeek's prefix
# cache hits items 1+2+3 every subsequent generation of the same paper type.
USER_PROMPT_TEMPLATE = """# 参考试卷原文（同卷型的完整样例，本次命题的风格依据；请仔细观察其句式、解析格式、引用方式）

{reference_text}

---

# 结构约束（题型 / 题量 / 每题分值；必须严格执行）

{structure}

---

# 参考卷关键分布（自动统计；用于校准你的输出，请力求自然达到类似水平）

{reference_stats_block}

---

# 内容来源（命题素材，所有题目必须来源于此）

{source}

---

# 本次命题要求

- 试卷标题：{title}
- 考试时长：{duration} 分钟
- 总分：{total_score} 分

请输出符合 schema 的 JSON。
"""


_FEWSHOT_HEADER = """
# 参考卷长题示例（形态参考，禁止照搬内容）

以下是从参考卷中提取的最复杂/最长的题目，展示了这份试卷题干的写法上限（情境长度、复合条件、选项粒度）。
**你的输出中应当有数道接近此类长度和复杂度的题目。**
不得照搬以下题目的内容——只参考其形态。

"""

_FEWSHOT_FOOTER = "\n（以上为形态示例，内容来自参考卷；命题内容仍以「内容来源」为准。）\n"


def build_messages(
    *,
    reference_text: str,
    structure: str,
    source_text: str,
    title: str,
    duration: int,
    total_score: int,
    reference_stats: dict | None = None,
    fewshot_stems: list[str] | None = None,
):
    from .base import Message
    from ..paper_types.stats import render_reference_stats

    system = SYSTEM_PROMPT
    if fewshot_stems:
        examples = "\n\n".join(
            f"**示例 {i}：**\n{ex}" for i, ex in enumerate(fewshot_stems, 1)
        )
        system = SYSTEM_PROMPT + _FEWSHOT_HEADER + examples + _FEWSHOT_FOOTER

    user_content = USER_PROMPT_TEMPLATE.format(
        reference_text=reference_text or "（未提供参考试卷原文，按结构约束 + 通用风格命题）",
        structure=structure,
        reference_stats_block=render_reference_stats(reference_stats),
        source=source_text,
        title=title,
        duration=duration,
        total_score=total_score,
    )
    return [
        Message(role="system", content=system),
        Message(role="user", content=user_content),
    ]
