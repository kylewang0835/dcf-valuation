// Vercel Serverless Function — AI 定性评分（巴菲特/芒格/段永平 8 维框架）
// 用 OpenAI 兼容接口（DeepSeek / Kimi / 通义 / 智谱等国内模型，或 OpenAI）研究目标公司并返回结构化评分。
// 环境变量（在 Vercel 配置）：
//   LLM_API_KEY   你的模型 API key（必填）
//   LLM_BASE_URL  OpenAI 兼容 base url，默认 DeepSeek：https://api.deepseek.com/v1
//                 Kimi: https://api.moonshot.cn/v1 | 通义: https://dashscope.aliyuncs.com/compatible-mode/v1 | 智谱: https://open.bigmodel.cn/api/paas/v4
//   LLM_MODEL     模型名，默认 deepseek-chat（Kimi: moonshot-v1-8k | 通义: qwen-plus | 智谱: glm-4-plus）
import OpenAI from 'openai';

export const config = { maxDuration: 60 };

const SYSTEM = `你是一位严谨的股票分析师，融合巴菲特、芒格、段永平的真实投资框架，对一家公司做"定性画像"打分。
基于你对该公司的了解 + 用户提供的量化指标，对 8 个维度各打 0/1/2 三档，务必苛刻、校准（多数普通公司落 1，只有确有依据才给 2 或 0）：
【好生意】
- moat 护城河：0无/1窄/2宽（网络效应、转换成本、品牌、牌照、规模、成本优势，且能长期维持）
- pricing 定价权：0弱/1中/2强（能否不流失客户而持续涨价；同质化或被监管限价=弱）
- model 商业模式差异化：0同质化(价格战)/1一般/2强差异化
- light 轻资本：0重资本(花很多钱却不见来钱)/1中/2轻资本(再投资需求低、自由现金流强)
【好公司】
- mgmt 管理层诚信与能力：0差/1中/2优
- capital 资本配置：0差/1中/2优（低于内在价值回购、明智分红、再投资回报高于资本成本）
- culture 企业文化·长期主义：0弱/1中/2强
- minority 善待小股东：0差/1中/2优（国资/控股股东是否可能优先非股东目标=打折）

只输出 JSON（不要任何额外文字、不要 markdown 代码块），结构如下：
{"moat":0-2,"pricing":0-2,"model":0-2,"light":0-2,"mgmt":0-2,"capital":0-2,"culture":0-2,"minority":0-2,
 "reasons":{"moat":"一句中文依据","pricing":"...","model":"...","light":"...","mgmt":"...","capital":"...","culture":"...","minority":"..."},
 "summary":"一句话总评：是不是好生意 + 巴菲特/芒格/段永平大概率会不会买"}
reasons 每项一句话、引用具体事实或数字（如"ROE 仅约6%低于资本成本""提速降费压制定价权"）。本评分仅供教学，不构成投资建议。`;

const KEYS = ['moat', 'pricing', 'model', 'light', 'mgmt', 'capital', 'culture', 'minority'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.LLM_API_KEY) return res.status(500).json({ error: '后端未配置 LLM_API_KEY 环境变量' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { code, name, market, context } = body;
  if (!name && !code) return res.status(400).json({ error: '缺少 name/code' });

  const client = new OpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
  });
  const model = process.env.LLM_MODEL || 'deepseek-chat';

  const ctxLine = context
    ? `已知量化指标：现价 ${context.price} ${context.currency || ''}、PE ${context.pe ?? '—'}、PB ${context.pb ?? '—'}、ROE≈${context.roe ?? '—'}%。`
    : '';
  const userText = `请对【${name || ''}（${code || ''}，${market || ''}）】这家公司做定性评分。${ctxLine}\n严格按系统提示的 JSON 结构输出（只输出 JSON）。`;

  let content;
  try {
    const resp = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userText },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 2000,
    });
    content = resp.choices?.[0]?.message?.content || '';
  } catch (e) {
    return res.status(502).json({ error: '模型 API 调用失败：' + (e?.message || String(e)) });
  }

  let data;
  try {
    data = JSON.parse(content);
  } catch (e) {
    const m = content.match(/\{[\s\S]*\}/); // 兜底：抽取首个 JSON 块
    if (!m) return res.status(502).json({ error: 'AI 返回非 JSON：' + content.slice(0, 200) });
    try { data = JSON.parse(m[0]); } catch (e2) { return res.status(502).json({ error: 'AI JSON 解析失败' }); }
  }

  const scores = {};
  KEYS.forEach((k) => { scores[k] = Math.max(0, Math.min(2, parseInt(data[k], 10) || 0)); });
  return res.status(200).json({ scores, reasons: data.reasons || {}, summary: data.summary || '' });
}
