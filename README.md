# PaperClone · 出卷好帮手

基于「参考试卷 + 内容来源」生成同风格模拟试卷的 Web 应用。上传 PDF / Word 文档，系统自动脱敏（人名替换为常见严肃中文姓名，政府机构替换为虚构地名如「京海市场监督管理局」），调用大模型命题，输出带答案的 PDF。

**线上：https://shijuan.heydee.cc**

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

## 部署（生产环境）

线上跑在阿里云香港 SWAS（`8.210.30.23`），单机架构：

```
用户 → https://shijuan.heydee.cc
       ├── /          → Nginx 静态前端 (/var/www/paperclone)
       └── /api/*     → Nginx 反代 → uvicorn 127.0.0.1:8000 (systemd)
```

- 前端：Next.js 14 静态导出（`output: "export"`），用 rsync 推到服务器
- 后端：FastAPI + uvicorn，由 `paperclone-api.service` 守护
- SSL：Let's Encrypt（certbot 自动续期）
- DNS：Cloudflare（**仅 DNS、灰云**，不走 CF 代理）
- 字体：Ubuntu `apt install fonts-noto-cjk` 直接装好（包含 `Noto Serif CJK SC`，与 PDF 模板字体名匹配）
- 选址理由：HK 不需要 ICP 备案，到大陆延迟 50-100ms；上 CF Pages + CF Tunnel 会双跨境，慢且不稳

### 一键部署

```bash
./scripts/deploy.sh             # 前后端都更新
./scripts/deploy.sh frontend    # 只重新构建+上传前端
./scripts/deploy.sh backend     # 只 git pull + 重启后端
./scripts/deploy.sh status      # 查看健康
```

前提：
1. SSH 别名 `hk` 配在 `~/.ssh/config`，指向生产服务器
2. 后端的改动**必须先 `git push`**，因为 HK 用 `git pull` 从 GitHub 拉
3. 前端的改动可以是未提交的本地代码（`npm run build` 用工作树）

### 服务器上的关键路径

| 位置 | 内容 |
|---|---|
| `/root/PaperClone` | git 仓库（GitHub 镜像 `https://ghfast.top/...` 拉） |
| `/root/PaperClone/backend/.env` | 含 `KIE_API_KEY`、`FRONTEND_ORIGIN` |
| `/var/www/paperclone/` | 前端静态文件（`out/` 内容） |
| `/etc/nginx/sites-available/paperclone` | nginx 配置（certbot 自动改 SSL） |
| `/etc/systemd/system/paperclone-api.service` | 后端守护配置 |
| `/etc/letsencrypt/live/shijuan.heydee.cc/` | TLS 证书 |

### 常用运维

```bash
ssh hk                                              # 直连生产
ssh hk 'systemctl status paperclone-api.service'   # 看后端状态
ssh hk 'journalctl -u paperclone-api.service -f'   # 实时日志
ssh hk 'systemctl restart paperclone-api.service'  # 手动重启
ssh hk 'systemctl reload nginx'                    # 改完 nginx 配置
ssh hk 'certbot renew --dry-run'                   # 测试证书续期
```

## 待办

- 大文件：PDF 多模态模式（把页面作图片喂入 Gemini，保留表格/公式）
- 任务持久化：`JobStore` 切换到 Redis，支持多 worker 部署
- 重启时正在跑的 job 会变成僵尸（status 一直停在 `generating`）—— `services/job_store.py` 已加初始化时清理逻辑，但生成中重启仍会丢失结果
