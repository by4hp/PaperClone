"""Extraction prompt — resolves the **structural blueprint** of an uploaded
reference paper (sections / counts / scores / header / duration). Style is
NOT abstracted into prose: the full reference text is kept verbatim and
passed to the generator as the style anchor; DeepSeek's prefix cache makes
this cheap on repeat generations of the same paper type."""

from __future__ import annotations


EXTRACT_SYSTEM_PROMPT = """你是一位资深命题专家，任务是阅读用户上传的「参考试卷」并抽取它的**结构信息**。本工具是通用出卷工具，参考卷可能来自任何领域（法规、教材、行业培训、公考、学科考试、英语、医学、理工等）；不要为字段塞入领域预设。

你必须仅输出一个 JSON 对象（不含任何前后文字、不含 Markdown 代码围栏），严格遵循下列 schema：

{
  "name": string,                    // 可读名称，建议「[原标题摘要] · 用户卷型」；保留原卷领域味道，不强加分类
  "description": string,             // 一句话说明用途与适用场景，<= 40 字
  "default_header_lines": [string],  // 参考卷顶部居中文字（机构名/卷名等），按原顺序
  "default_subtitle": string | null, // 副标题（如「（A 卷）」），无则 null
  "default_duration_minutes": integer, // 从参考卷里读不出时填 120
  "sections": [
    {
      "title": string,               // 大题标题，沿用原卷措辞
      "type": "single_choice" | "multi_choice" | "true_false" | "short_answer" | "essay",
      "question_count": integer,
      "score_per_question": number   // 可为小数
    }
  ]
}

抽取要求：
1. **题型与题量必须忠于参考卷**——逐节清点题数与分值，不要省略，不要合并相似大题。
2. 如果参考卷里某节标题已写明「共 X 题，每题 X 分」，直接沿用其措辞作为 `title`。
3. 不要抽取风格描述、不要抽取示例题——风格交给下游命题模型直接读完整参考卷原文判断。
4. 若某字段从参考卷里读不出，字符串字段填空字符串、可空字段填 null，**不要编造**。
5. 严禁输出任何非 JSON 内容。
"""


EXTRACT_USER_PROMPT_TEMPLATE = """# 参考试卷原文（已解析为纯文本）
{reference}

请抽取出这份参考卷对应的结构 JSON。
"""


def build_extract_messages(reference_text: str):
    from .base import Message

    return [
        Message(role="system", content=EXTRACT_SYSTEM_PROMPT),
        Message(
            role="user",
            content=EXTRACT_USER_PROMPT_TEMPLATE.format(reference=reference_text),
        ),
    ]
