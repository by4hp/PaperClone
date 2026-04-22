"""Prompt templates for exam generation (structured JSON output)."""

from __future__ import annotations

SYSTEM_PROMPT = """你是一位资深命题专家，负责根据「参考试卷」与「内容来源」命制同风格同结构的模拟试卷。

你必须仅输出一个 JSON 对象（不含任何前后文字、不含 Markdown 代码围栏），严格遵循下列 schema：

{
  "header_lines": ["第一行机构+卷名", "第二行副标题"],
  "subtitle": "（A 卷）" 或 null,
  "duration_minutes": <整数>,
  "total_score": <整数>,
  "show_name_score_row": true,
  "sections": [
    {
      "title": "一、单项选择题（共 X 题，每题 X 分）",
      "type": "single_choice" | "multi_choice" | "true_false" | "short_answer" | "essay",
      "questions": [
        {
          "number": 1,
          "stem": "题干，题干中不要自带编号；单选/多选题可在题干中保留（ ）；判断题题干不要自带（ ）",
          "options": [{"label": "A", "text": "选项内容"}, ...] 或 [],
          "answer": "B"（单选）| "ABCD"（多选）| "√" 或 "×"（判断）| "要点式标准答案"（主观题）,
          "explanation": "答案解析：条文依据 + 推理要点",
          "legal_basis": "如《XX法》第十二条；若内容来源里没有明确法条号则填 null",
          "source_quote": "从【内容来源】原文中截取的、与该题直接相关的 1~3 句；若无可引用片段则填 null"
        }
      ]
    }
  ]
}

命题要求：
1. 题型结构、题量、分值分布与参考试卷一致；若参考有多份，取最主流的组合。
2. 每个大题模块内的题目编号都要**从 1 重新开始**，不要跨模块连续编号。
3. 选择题选项至少 4 个；选项文本不重复、不明显诱导。
4. **题目内容严格基于「内容来源」**，不得引入来源外知识；source_quote 必须是原文片段（可略作省略号处理，不得篡改）。
5. 对于参考答案，若【内容来源】里出现了明确的法条编号、条款编号或类似“第X条”，必须把它提取到 `legal_basis`；没有明确编号时填 null，不要编造。
6. 判断题答案只能是 "√" 或 "×"，并且 `options` 必须为空数组，不要生成 A/B、正确/错误 之类选项；判断题 `stem` 末尾不要自带 `（ ）`。
7. 不要在题干里写答案；不要在 stem 或 options 中嵌入 Markdown。
8. 涉及人名、机构名等保持输入中已给定的形式（输入已脱敏），不要再自行替换。
9. 严禁输出任何非 JSON 内容，包括解释、注释、代码围栏。
"""


USER_PROMPT_TEMPLATE = """# 参考试卷（提供题型结构与风格）
{reference}

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


def build_messages(
    reference_text: str,
    source_text: str,
    title: str,
    duration: int,
    total_score: int,
):
    from .base import Message

    user_content = USER_PROMPT_TEMPLATE.format(
        reference=reference_text,
        source=source_text,
        title=title,
        duration=duration,
        total_score=total_score,
    )
    return [
        Message(role="system", content=SYSTEM_PROMPT),
        Message(role="user", content=user_content),
    ]
