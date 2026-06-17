# 股票 DCF 估值模型 · A股 / 港股 / 美股

交互式 DCF 估值计算器。前端是**单文件 `index.html`**（双击即可用浏览器打开，纯前端、无需后端）；外加一个**可选的 AI 定性评分后端**（Vercel 函数 + Anthropic Claude）。

## 功能

- **两种估值模式**：营收驱动 FCFF（A 股自动取年报营收）/ 净利驱动 FCFE（A/港/美通用，市值÷PE 反推净利）
- **多市场 + 货币自洽**：A 股 ¥ / 港股 HK$ / 美股 US$
- **实时抓取**：东方财富为主、腾讯行情为备用源（JSONP 绕过 CORS）
- **敏感性矩阵**、**反向 DCF**（现价隐含折现率/增长率）、**安全边际**（建议买入价）
- **三视角投资评判**（巴菲特/芒格/段永平）：通用框架 + 按当前股票实时量化初筛（ROE=PB/PE 等）
- **定性评分卡**：8 维（护城河/定价权/商业模式/轻资本 + 管理层/资本配置/文化/善待小股东），
  - 🤖 **AI 联网研究自动打分**（任意股票，需部署下方后端），或手动拖动滑块；按股票记忆（localStorage）
  - 合并量化生成「三视角综合结论」并据质量建议安全边际

## 部署

### 纯前端（GitHub Pages）
`index.html` 是自包含静态页，可直接放 GitHub Pages（Settings → Pages → Deploy from a branch → main / root）。此模式下 DCF 全功能可用，**AI 定性评分会回退到手动打分**（无后端）。

### 带 AI 后端（Vercel，推荐）
后端走 **OpenAI 兼容接口**，可接国内大模型（DeepSeek / Kimi / 通义 / 智谱）或 OpenAI。

1. 在 [vercel.com](https://vercel.com) → **Add New → Project → Import** 本 GitHub 仓库。
2. Framework Preset 选 **Other**（无需 build）。
3. **Environment Variables** 配置（按你用的模型选一行 base/model）：

   | 环境变量 | 说明 |
   |---|---|
   | `LLM_API_KEY` | **必填**，你的模型 API key |
   | `LLM_BASE_URL` | DeepSeek `https://api.deepseek.com/v1`（默认）· Kimi `https://api.moonshot.cn/v1` · 通义 `https://dashscope.aliyuncs.com/compatible-mode/v1` · 智谱 `https://open.bigmodel.cn/api/paas/v4` |
   | `LLM_MODEL` | DeepSeek `deepseek-chat`（默认）· Kimi `moonshot-v1-8k` · 通义 `qwen-plus` · 智谱 `glm-4-plus` |

   各家 key 在对应平台的「API 密钥」页获取（人民币充值、国内直连）。只用 DeepSeek 的话，只填 `LLM_API_KEY` 即可（base/model 用默认）。
4. **Deploy**。Vercel 同时托管 `index.html`（静态）和 `/api/qual`（Serverless 函数）。
5. 打开 Vercel 给的域名，点「🤖 AI 定性评分」即可自动填分。

> 若想让 **GitHub Pages 前端** 也用 Vercel 后端：把 `index.html` 里的 `const QUAL_API=''` 改成你的 Vercel 域名（如 `'https://your-app.vercel.app'`），函数已开 CORS。

## 后端说明（`api/qual.js`）

用 `openai` SDK 调 OpenAI 兼容接口，基于模型知识 + 前端传来的量化指标（ROE/PE/PB）输出 8 维 0–2 评分 + 每项依据 + 总评（JSON 模式）。密钥只存 Vercel 环境变量，**不进前端**。国内标准兼容接口无统一联网搜索，故评分基于模型自身知识——知名公司够用，冷门股可手动覆盖。每次约 5–20 秒、消耗一次模型调用。

## 数据 & 免责

行情/年报来自东方财富、腾讯财经公开接口；定性研究来自 Claude 联网搜索。**仅供分析与教学，不构成投资建议。** DCF 对 WACC 与永续增速高度敏感，请结合敏感性矩阵综合判断。

---
🤖 本项目由 [Claude Code](https://claude.com/claude-code) 协助构建。
