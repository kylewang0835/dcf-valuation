// Vercel Serverless Function — 机构一致预期增速（东方财富 F10·盈利预测）
// 前端无法直连 emweb（无 CORS/JSONP），故服务端代理抓取并加 CORS 返回。
// 取「近六月平均」机构一致预期，按年（含 E 预测年）同时返回【营收】与【净利】两套同比增速
// （东财自带的逐年同比，单位无关），前端按当前估值模式选用：
//   营收驱动(详细) → 营收增速；净利驱动 → 净利增速。
// 仅 A 股有覆盖；港股/美股返回 available:false。
export const config = { maxDuration: 15 };

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const q = req.method === 'POST'
    ? (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}))
    : (req.query || {});
  const market = String(q.market || 'A').toUpperCase();
  const code = String(q.code || '').replace(/\D/g, '');

  if (!code) return res.status(400).json({ error: '缺少 code' });
  if (market !== 'A')
    return res.status(200).json({ available: false, reason: '仅 A 股支持机构一致预期自动填充（港股/美股分析师覆盖薄、东财无现成接口）', revenue: [], netprofit: [] });

  // 沪市 6/9 开头 → SH；北交所 8/4 → BJ；其余（0/3）→ SZ
  const pfx = /^[69]/.test(code) ? 'SH' : (/^[84]/.test(code) ? 'BJ' : 'SZ');
  const url = `https://emweb.securities.eastmoney.com/PC_HSF10/ProfitForecast/PageAjax?code=${pfx}${code}`;

  let d;
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://emweb.securities.eastmoney.com/',
        'Accept': 'application/json,text/plain,*/*',
      },
    });
    d = await r.json();
  } catch (e) {
    return res.status(200).json({ available: false, reason: '盈利预测接口抓取失败：' + (e?.message || e), revenue: [], netprofit: [] });
  }

  // yctj_chart：按年（含 E 预测）的营收/归母净利绝对值 + 同比
  const chart = Array.isArray(d?.yctj_chart) ? d.yctj_chart : [];
  const rows = chart
    .filter(x => x && x.YEAR != null)
    .map(x => ({
      year: +x.YEAR, mark: x.YEAR_MARK,
      revRatio: x.TOTAL_OPERATE_INCOME_RATIO, npRatio: x.PARENT_NETPROFIT_RATIO,
      rev: x.TOTAL_OPERATE_INCOME != null ? x.TOTAL_OPERATE_INCOME / 1e8 : null,
      np: x.PARENT_NETPROFIT != null ? x.PARENT_NETPROFIT / 1e8 : null,
    }))
    .sort((a, b) => a.year - b.year);
  const est = rows.filter(x => x.mark === 'E'); // 仅取预测年（通常 2~3 个）
  if (!est.length)
    return res.status(200).json({ available: false, reason: '该股暂无机构盈利预测', revenue: [], netprofit: [] });

  // 直接用东财逐年同比（单位无关，规避基数口径/单位错配）；夹逼防个别口径毛刺
  const pick = (ratioKey, absKey) => est
    .filter(e => e[ratioKey] != null && isFinite(e[ratioKey]))
    .map(e => ({ year: e.year, mark: 'E', growth: +clamp(e[ratioKey], -40, 80).toFixed(1), level: e[absKey] != null ? +e[absKey].toFixed(2) : null }));

  return res.status(200).json({
    available: true,
    source: '东方财富·机构一致预期（近六月平均）',
    revenue: pick('revRatio', 'rev'),     // 营收一致预期增速（供「营收驱动」详细模式）
    netprofit: pick('npRatio', 'np'),     // 净利一致预期增速（供「净利驱动」模式）
  });
}
