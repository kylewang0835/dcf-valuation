// Vercel Serverless Function — 机构一致预期净利增速（东方财富 F10·盈利预测）
// 前端无法直连 emweb（无 CORS/JSONP），故服务端代理抓取并加 CORS 返回。
// 取「近六月平均」机构一致预期的按年归母净利（含 E 预测年），用前端传来的真实 TTM/年报基数（np0）
// 锚定出逐年增速，使预测净利路径穿过卖方一致预期的绝对水平。仅 A 股有覆盖；港股/美股返回 available:false。
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
  const np0 = parseFloat(q.np0); // 亿元，前端传来的基准归母净利（TTM 或最近年报）

  if (!code) return res.status(400).json({ error: '缺少 code' });
  if (market !== 'A')
    return res.status(200).json({ available: false, reason: '仅 A 股支持机构一致预期自动填充（港股/美股分析师覆盖薄、东财无现成接口）', years: [] });

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
    return res.status(200).json({ available: false, reason: '盈利预测接口抓取失败：' + (e?.message || e), years: [] });
  }

  // yctj_chart：按年（含 E 预测）归母净利绝对值 + 同比
  const chart = Array.isArray(d?.yctj_chart) ? d.yctj_chart : [];
  const rows = chart
    .filter(x => x && x.PARENT_NETPROFIT != null && x.YEAR != null)
    .map(x => ({ year: +x.YEAR, mark: x.YEAR_MARK, np: x.PARENT_NETPROFIT / 1e8, yoy: x.PARENT_NETPROFIT_RATIO }))
    .sort((a, b) => a.year - b.year);
  const est = rows.filter(x => x.mark === 'E'); // 仅取预测年（通常 2~3 个）
  if (!est.length)
    return res.status(200).json({ available: false, reason: '该股暂无机构盈利预测', years: [] });

  // 逐年增速：Y1 用真实基数 np0 锚定到首个预测年的绝对净利；其后用预测年间环比（=东财官方同比）
  const actual = rows.filter(x => x.mark === 'A').sort((a, b) => b.year - a.year)[0];
  let prev = (isFinite(np0) && np0 > 0) ? np0 : (actual ? actual.np : est[0].np / (1 + (est[0].yoy || 0) / 100));
  const years = est.map(e => {
    let g = (prev > 0) ? (e.np / prev - 1) * 100 : (e.yoy || 0);
    if (!isFinite(g)) g = e.yoy || 0;
    g = clamp(g, -40, 80); // 夹逼，防个别口径毛刺（如某年实际值缺失）放大
    prev = e.np;
    return { year: e.year, mark: 'E', np: +e.np.toFixed(2), growth: +g.toFixed(1) };
  });

  return res.status(200).json({
    available: true,
    source: '东方财富·机构一致预期（近六月平均）',
    base: { np0: isFinite(np0) ? np0 : (actual ? +actual.np.toFixed(2) : null), actualYear: actual?.year || null },
    years,
  });
}
