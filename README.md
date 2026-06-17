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
1. 在 [vercel.com](https://vercel.com) → **Add New → Project → Import** 本 GitHub 仓库。
2. Framework Preset 选 **Other**（无需 build）。
3. **Environment Variables** 添加 `ANTHROPIC_API_KEY` = 你的 Anthropic API 密钥。
4. **Deploy**。Vercel 会同时托管 `index.html`（静态）和 `/api/qual`（Serverless 函数）。
5. 打开 Vercel 给的域名即可——「🤖 AI 定性评分」按钮会联网研究当前股票并自动填分。

> 若想让 **GitHub Pages 前端** 也用 Vercel 后端：把 `index.html` 里的 `const QUAL_API=''` 改成你的 Vercel 域名（如 `'https://your-app.vercel.app'`），函数已开 CORS。

## 后端说明（`api/qual.js`）

用官方 `@anthropic-ai/sdk` 调 `claude-opus-4-8`，开启 `web_search` 联网研究目标公司，经一个 strict 的 `submit_scorecard` 工具返回 8 维 0–2 评分 + 每项依据 + 总评。密钥只存 Vercel 环境变量，**不进前端**。每次点击约 20–60 秒、消耗一次 Claude API 调用（含联网搜索）。

## 数据 & 免责

行情/年报来自东方财富、腾讯财经公开接口；定性研究来自 Claude 联网搜索。**仅供分析与教学，不构成投资建议。** DCF 对 WACC 与永续增速高度敏感，请结合敏感性矩阵综合判断。

---
🤖 本项目由 [Claude Code](https://claude.com/claude-code) 协助构建。
