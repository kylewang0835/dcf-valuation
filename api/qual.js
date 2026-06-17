// Vercel Serverless Function — AI 定性评分（巴菲特/芒格/段永平 8 维框架）
// 用 Claude (claude-opus-4-8) 联网研究目标公司，返回结构化评分。密钥存 Vercel 环境变量 ANTHROPIC_API_KEY。
import Anthropic from '@anthropic-ai/sdk';

export const config = { maxDuration: 60 };

const EFFORT = 'medium'; // low|medium|high|max —— 研究质量↔成本/延迟，可调

const SYSTEM = `你是一位严谨的股票分析师，融合巴菲特、芒格、段永平的真实投资框架，对一家公司做"定性画像"打分。
你必须先用 web_search（必要时 web_fetch）联网研究该公司的真实情况（最近年报、护城河、竞争格局、ROE/ROIC、定价权、资本配置、管理层、文化、是否亏损/重资本），再调用 submit_scorecard 工具给出评分。

每个维度打 0/1/2 三档，务必基于证据、保持苛刻与校准（多数普通公司应落在 1，只有确有证据的才给 2 或 0）：
【好生意】
- moat 护城河：0无 / 1窄 / 2宽（网络效应、转换成本、品牌、牌照、规模、成本优势，且能长期维持）
- pricing 定价权：0弱 / 1中 / 2强（能否不流失客户而持续涨价；同质化/被监管限价=弱）
- model 商业模式差异化：0同质化(价格战) / 1一般 / 2强差异化
- light 轻资本：0重资本(花很多钱却不见来钱) / 1中 / 2轻资本(再投资需求低、owner earnings 高)
【好公司】
- mgmt 管理层诚信与能力：0差 / 1中 / 2优
- capital 资本配置：0差 / 1中 / 2优（低于内在价值时回购、明智分红、再投资回报高于资本成本）
- culture 企业文化·长期主义：0弱 / 1中 / 2强
- minority 善待小股东：0差 / 1中 / 2优（国资委/控股股东是否可能优先非股东目标=打折）

reasons 每项一句中文依据（引用具体事实/数字，如"ROE 仅约6%低于资本成本""提速降费压制定价权"）。summary 一句话总评（是不是好生意+三人会不会买）。
诚实边界：若某投资人从未公开评论该公司/该行业，按其框架推断即可，不要编造语录。本评分仅供教学，不构成投资建议。`;

const SCORECARD_TOOL = {
  name: 'submit_scorecard',
  description: '提交对该公司的 8 维定性评分（每项 0-2 整数）、每项简短中文依据、一句话总评。',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      moat: { type: 'integer', enum: [0, 1, 2] },
      pricing: { type: 'integer', enum: [0, 1, 2] },
      model: { type: 'integer', enum: [0, 1, 2] },
      light: { type: 'integer', enum: [0, 1, 2] },
      mgmt: { type: 'integer', enum: [0, 1, 2] },
      capital: { type: 'integer', enum: [0, 1, 2] },
      culture: { type: 'integer', enum: [0, 1, 2] },
      minority: { type: 'integer', enum: [0, 1, 2] },
      reasons: {
        type: 'object',
        properties: {
          moat: { type: 'string' }, pricing: { type: 'string' }, model: { type: 'string' }, light: { type: 'string' },
          mgmt: { type: 'string' }, capital: { type: 'string' }, culture: { type: 'string' }, minority: { type: 'string' },
        },
        required: ['moat', 'pricing', 'model', 'light', 'mgmt', 'capital', 'culture', 'minority'],
        additionalProperties: false,
      },
      summary: { type: 'string' },
    },
    required: ['moat', 'pricing', 'model', 'light', 'mgmt', 'capital', 'culture', 'minority', 'reasons', 'summary'],
    additionalProperties: false,
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: '后端未配置 ANTHROPIC_API_KEY 环境变量' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { code, name, market, context } = body;
  if (!name && !code) return res.status(400).json({ error: '缺少 name/code' });

  const client = new Anthropic();
  const ctxLine = context
    ? `已知量化指标：现价 ${context.price} ${context.currency || ''}、PE ${context.pe ?? '—'}、PB ${context.pb ?? '—'}、ROE≈${context.roe ?? '—'}% 。`
    : '';
  const userText =
    `请研究并对【${name || ''}（${code || ''}，${market || ''}）】这家公司做定性评分。${ctxLine}\n` +
    `先用 web_search/web_fetch 查最近年报与公开资料核实，再调用 submit_scorecard 工具提交结果。`;

  const tools = [
    { type: 'web_search_20260209', name: 'web_search' },
    { type: 'web_fetch_20260209', name: 'web_fetch' },
    SCORECARD_TOOL,
  ];

  const messages = [{ role: 'user', content: userText }];
  let scorecard = null;

  try {
    for (let i = 0; i < 6 && !scorecard; i++) {
      const resp = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 6000,
        thinking: { type: 'adaptive' },
        output_config: { effort: EFFORT },
        system: SYSTEM,
        tools,
        messages,
      });
      const sc = resp.content.find((b) => b.type === 'tool_use' && b.name === 'submit_scorecard');
      if (sc) { scorecard = sc.input; break; }
      if (resp.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: resp.content }); continue; }
      // 模型结束但没调工具 → 追加 assistant 回复并明确要求调用工具
      messages.push({ role: 'assistant', content: resp.content });
      messages.push({ role: 'user', content: '请基于以上研究，现在调用 submit_scorecard 工具给出 8 维评分与依据。' });
    }
  } catch (e) {
    return res.status(502).json({ error: 'Claude API 调用失败：' + (e?.message || String(e)) });
  }

  if (!scorecard) return res.status(502).json({ error: 'AI 未能在限定轮次内产出评分，请重试' });

  const keys = ['moat', 'pricing', 'model', 'light', 'mgmt', 'capital', 'culture', 'minority'];
  const scores = {};
  keys.forEach((k) => { scores[k] = Math.max(0, Math.min(2, parseInt(scorecard[k], 10) || 0)); });
  return res.status(200).json({ scores, reasons: scorecard.reasons || {}, summary: scorecard.summary || '' });
}
