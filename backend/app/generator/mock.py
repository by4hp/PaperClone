from __future__ import annotations

import asyncio
import json

from .base import Message


_CANNED_EXAM = {
    "header_lines": [
        "2026 年 4 月京海市市场监督管理局",
        "\u201c全员法规通\u201d考法测试卷",
    ],
    "subtitle": "（A 卷）",
    "duration_minutes": 120,
    "total_score": 100,
    "show_name_score_row": True,
    "sections": [
        {
            "title": "一、单项选择题（共 3 题，每题 2 分）",
            "type": "single_choice",
            "questions": [
                {
                    "number": 1,
                    "stem": "根据材料，京海市市场监督管理局的首要职责是（ ）",
                    "options": [
                        {"label": "A", "text": "公共卫生监督"},
                        {"label": "B", "text": "市场秩序维护"},
                        {"label": "C", "text": "教育督导"},
                        {"label": "D", "text": "税收征管"},
                    ],
                    "answer": "B",
                    "explanation": "市场监督管理部门的法定核心职能是市场秩序维护，其他三项分属卫健、教育、税务等部门。",
                    "citation": "《京海市市场监督管理条例》第三条",
                    "source_quote": "市场监督管理部门的核心职责为市场秩序维护……",
                },
                {
                    "number": 2,
                    "stem": "滨江市税务局改革的核心方向是（ ）",
                    "options": [
                        {"label": "A", "text": "机构扩张"},
                        {"label": "B", "text": "流程再造与数字赋能"},
                        {"label": "C", "text": "人员精简"},
                        {"label": "D", "text": "行政审批集中"},
                    ],
                    "answer": "B",
                    "explanation": "材料强调改革以流程再造、减负便民、闭环监管为重点，核心依托数字化手段。",
                    "citation": None,
                    "source_quote": "改革主要内容：推行\u201c一件事一次办\u201d综合窗口，实现跨部门数据共享……",
                },
                {
                    "number": 3,
                    "stem": "下列表述，不属于政府职能转变方向的是（ ）",
                    "options": [
                        {"label": "A", "text": "强化事中事后监管"},
                        {"label": "B", "text": "减少行政审批"},
                        {"label": "C", "text": "扩大行政干预"},
                        {"label": "D", "text": "推进\u201c放管服\u201d改革"},
                    ],
                    "answer": "C",
                    "explanation": "扩大行政干预与政府职能转变的方向相悖；其余三项均为当前改革主流方向。",
                    "citation": "《优化营商环境条例》第十五条",
                    "source_quote": "改革成效：企业办事时间平均减少 70%，群众满意度从 82% 提升至 96%。",
                },
            ],
        },
        {
            "title": "二、判断题（共 2 题，每题 2 分）",
            "type": "true_false",
            "questions": [
                {
                    "number": 1,
                    "stem": "京海市市场监督管理局具备行政执法权。",
                    "options": [],
                    "answer": "√",
                    "explanation": "市场监督管理部门依法享有行政检查、行政处罚等执法权。",
                    "citation": "《京海市市场监督管理条例》第十八条",
                    "source_quote": "……市场监督管理部门依法开展市场监管执法工作。",
                },
                {
                    "number": 2,
                    "stem": "滨江市税务局属于垂直管理部门。",
                    "options": [],
                    "answer": "×",
                    "explanation": "税务系统确为垂直管理，但本题所述的\u201c市\u201d级税务局在材料中表述为地方改革单位。",
                    "citation": None,
                    "source_quote": "滨江市税务局同步开展改革试点……",
                },
            ],
        },
        {
            "title": "三、简答题（共 2 题，每题 10 分）",
            "type": "short_answer",
            "questions": [
                {
                    "number": 1,
                    "stem": "简述京海市市场监督管理局数字化改革的三项主要内容。",
                    "options": [],
                    "answer": "① 建立统一的市场主体信用库；② 推行\u201c一件事一次办\u201d综合窗口；③ 实现跨部门数据共享。",
                    "explanation": "三项内容在材料中逐条列出，属并列关系，答题应完整列出并简要说明。",
                    "citation": "《京海市数字政务改革办法》第九条",
                    "source_quote": "改革主要内容：1) 建立统一的市场主体信用库；2) 推行\u201c一件事一次办\u201d综合窗口；3) 实现跨部门数据共享。",
                },
                {
                    "number": 2,
                    "stem": "结合材料，谈谈数字化改革对群众满意度的影响及原因。",
                    "options": [],
                    "answer": "改革使群众满意度由 82% 提升至 96%。原因：办事时间缩短、流程更透明、跨部门数据共享减少重复提交。",
                    "explanation": "围绕\u201c效果 + 原因\u201d两方面作答；数据引自材料。",
                    "citation": None,
                    "source_quote": "改革成效：企业办事时间平均减少 70%，群众满意度从 82% 提升至 96%。",
                },
            ],
        },
        {
            "title": "四、论述题（共 1 题，40 分）",
            "type": "essay",
            "questions": [
                {
                    "number": 1,
                    "stem": "结合政府职能转变的总体要求，论述新时代基层监管部门应如何在数字化转型与群众满意度提升之间取得平衡。要求观点明确、论据充分、层次清晰，字数不少于 500 字。",
                    "options": [],
                    "answer": "要点：① 数字化转型是手段，群众满意度是目的；② 在技术应用中避免\u201c重技术轻服务\u201d；③ 建立以用户体验为核心的评价机制；④ 基层干部需具备数字素养与服务意识；⑤ 结论：两者相辅相成，核心是以人民为中心。",
                    "explanation": "论述题应围绕\u201c手段—目的\u2013机制\u2013主体\u2013结论\u201d层层展开，紧扣材料实例。",
                    "citation": None,
                    "source_quote": "改革成效显著，群众办事时间减少 70%，满意度大幅提升……",
                },
            ],
        },
    ],
}


class MockClient:
    """Offline stub returning a canned exam paper in the structured JSON format."""

    async def complete(
        self,
        messages: list[Message],
        *,
        reasoning_effort: str = "high",
        temperature: float | None = None,
    ) -> str:
        await asyncio.sleep(2.0)
        return json.dumps(_CANNED_EXAM, ensure_ascii=False)
