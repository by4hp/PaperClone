# PaperClone · 出卷好帮手

基于「参考试卷 + 内容来源」生成同风格模拟试卷的 Web 应用。上传 PDF / Word 文档，系统自动脱敏（人名替换为常见严肃中文姓名，政府机构替换为虚构地名如「京海市场监督管理局」），调用大模型命题，输出带答案的 PDF。

## 架构

```
frontend/   Next.js 14 + Tailwind + lucide-react (Morandi 蓝绿 · 米白)
backend/    FastAPI + pdfplumber / python-docx + weasyprint
            LLM: kie.ai Gemini 3.1 Pro (默认) | Claude (可切换)
```

## 运行

### 后端

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env   # 填入 KIE_API_KEY
./run.sh               # = uvicorn + weasyprint 所需的 DYLD 库路径
```

> **macOS 必备**：`weasyprint` 依赖 `pango` / `cairo`，先 `brew install pango` 安装。
> `run.sh` 会自动把 `/opt/homebrew/lib`（Apple Silicon）或 `/usr/local/lib`（Intel Mac）加到 `DYLD_FALLBACK_LIBRARY_PATH`，否则启动会报 `cannot load library 'gobject-2.0-0'`。

### 前端

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev   # http://localhost:3000
```

## 关键模块

- `backend/app/parsers/` — PDF / Word 文本提取
- `backend/app/desensitize/` — 基于姓名池 + 政府机构后缀正则的脱敏引擎；同一 job 内同名实体替换保持一致；映射表不对外返回
- `backend/app/generator/` — `LLMClient` 抽象，默认 `gemini_kie`，OpenAI 兼容 `chat/completions`
- `backend/app/pdf/` — Jinja2 HTML 模板 + weasyprint 渲染，思源宋体/黑体
- `backend/app/services/pipeline.py` — 解析 → 脱敏 → 命题 → 渲染 全流程
- `frontend/app/page.tsx` — 双上传区 + 元信息表单 + 生成按钮 + 进度面板

## 切换 LLM

`.env` 设置：
```
LLM_PROVIDER=claude   # 或 gemini_kie
```

## 待办

- 脱敏：接入 HanLP NER 提升人名召回（目前为姓氏正则 MVP）
- 大文件：PDF 多模态模式（把页面作图片喂入 Gemini，保留表格/公式）
- 任务持久化：`JobStore` 切换到 Redis，支持多 worker 部署
