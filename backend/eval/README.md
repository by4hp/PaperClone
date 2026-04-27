# Benchmark — 试卷生成质量评测

MVP 版：用客观文本指标对比"参考卷 vs 不同 variant 生成的卷"，把"感觉好像变好了"换成可复跑的数字。

## 用法

```bash
cd backend
DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib \
  .venv/bin/python -m eval.runner --variants flash,pro --runs 2
```

参数：
- `--variants` 逗号分隔，可选 `flash`、`pro`（在 `runner.py` 的 `VARIANTS` 表里加更多）
- `--runs` 每个 variant 跑几次（默认 2，方差小则 2 够；想看稳定性可设 3-5）
- `--golden` 用哪份参考卷（默认 `regulation`，对应 `eval/golden/regulation/`）
- `--out` 报告输出路径（默认 `eval/reports/<golden>_<时间戳>.md`）

## 一份 golden set 包含

```
eval/golden/<name>/
  reference.pdf    # 参考试卷
  source.md        # 命题素材（每次生成都用同一份，保证可比）
```

加新 golden：建目录 + 放两个文件 + 在 `runner.py` 的 `GOLDEN_BLUEPRINTS` 加一份骨架（手写题型/题量，避免依赖 LLM extract 引入随机性）。

## 看什么指标

参考卷的对应指标作为 target，生成卷的指标算差值（Δ），越接近 0 越好。

| 指标 | 含义 | 解读 |
|---|---|---|
| `stem_len_mean` | 题干平均字数 | 太低说明全是短题 |
| `stem_len_max` | 最长题干 | 反映有没有长情境题 |
| `long_stem_count` | 题干 ≥ 80 字的题数 | **核心**：长情境题塌缩程度 |
| `long_stem_ratio` | 同上的比例 | |
| `unique_starts` | 题干前 6 字去重后的数量 | 句式多样性硬指标 |
| `scenario_count` | 含"某 X 公司 / 某地某店 / 王某"等情境引入的题数 | 案例题塌缩程度 |
| `cit_with_article_pct` | citation 含"第 X 条"的占比 | 引用粒度 |
| `multi_opt(min~max)` | 多选题选项数范围 | 是否过度模仿（参考卷一般 4~6 混合） |

## 加新 variant

在 `runner.py` 的 `VARIANTS` 字典加一项：

```python
VARIANTS = {
    "flash": {"model": "deepseek-v4-flash", "reasoning_effort": "high"},
    "pro": {"model": "deepseek-v4-pro", "reasoning_effort": "high"},
    # 例：
    "flash_low_temp": {"model": "deepseek-v4-flash", "reasoning_effort": "low"},
}
```

prompt-level variant（few-shot / persona / hard-constraint 等）需要先扩展 `build_messages` 让它接受变体参数，再在这里指定。当前 MVP 只支持模型/思考强度切换。

## 已知局限

- **没有 judge LLM 打分** —— MVP 只算客观文本指标，不评内容准确性
- **没有去重检测** —— 题干两两相似度暂未实现
- **`reference_metrics_from_text` 是启发式** —— regex 解析 PDF 文本，可能漏掉部分题
- **只支持 1 份 golden** —— 加更多卷型才能避免对单一卷型过拟合
- **没有 judge 一致性测试** —— 每次跑 N=2~3，方差大时需要更多 runs
