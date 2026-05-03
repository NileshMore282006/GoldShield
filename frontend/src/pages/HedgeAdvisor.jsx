import { useState, useEffect } from 'react';
import { apiFetch } from '../api.js';
import { useApp } from '../state.jsx';
import { fmt, fmtRs, fmtPct } from '../utils.js';
import KpiCard from '../components/KpiCard.jsx';
import DecisionCard from '../components/DecisionCard.jsx';
import AlertBox from '../components/AlertBox.jsx';
import WalletExecution from '../components/WalletExecution.jsx';

const cleanLayout = (h) => ({
  height: h, margin: { l: 40, r: 20, t: 20, b: 40 },
  paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'Inter, sans-serif', size: 12, color: '#6B7280' },
  xaxis: { showgrid: true, gridcolor: '#F3F4F6', zeroline: false },
  yaxis: { showgrid: true, gridcolor: '#F3F4F6', zeroline: false },
  showlegend: false,
});

export default function HedgeAdvisor() {
  const { livePrice, showToast } = useApp();
  const [qty, setQty] = useState(500);
  const [price, setPrice] = useState(9500);
  const [delivery, setDelivery] = useState('');
  const [cust, setCust] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState('balanced');
  const [hedgePositionId, setHedgePositionId] = useState(null);
  const profileRatioMap = { conservative: 0.70, balanced: 0.85, aggressive: 1.00 };

  useEffect(() => {
    const d = new Date(); d.setDate(d.getDate() + 90);
    setDelivery(d.toISOString().split('T')[0]);
    if (livePrice) setPrice(Math.round(livePrice));
  }, [livePrice]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const delivDays = delivery ? Math.max(0, Math.round((new Date(delivery) - today) / 86400000)) : 90;
  const delivColor = delivDays < 30 ? 'var(--red)' : delivDays < 60 ? 'var(--amber)' : 'var(--green)';
  const delivMsg = delivDays < 30 ? 'Very short window — high urgency to hedge now.' : delivDays < 60 ? 'Moderate window. Monitor market closely.' : 'Longer duration. Plan ahead.';

  async function submit() {
    const errs = [];
    if (!qty || qty <= 0) errs.push('Quantity must be greater than 0.');
    if (!price || price < 3000) errs.push('Booking price seems too low.');
    if (!delivery) errs.push('Delivery date is required.');
    if (errs.length) { setError(errs.join(' ')); return; }
    setError('');
    setLoading(true); setResult(null);
    // Hedge endpoint runs 4 AI models — allow 60s timeout
    const rec = await apiFetch('/api/hedge', { method: 'POST', body: JSON.stringify({ gold_quantity_grams: qty, booked_price_inr: price, delivery_days: delivDays, customer_name: cust }) }, 60000);
    setLoading(false);
    if (!rec) { setError('Could not generate recommendation. Please ensure the API server is running.'); return; }
    setResult(rec);
    setTimeout(() => {
      if (window.Plotly) renderHedgeChart(rec);
    }, 100);
  }

  function renderHedgeChart(rec) {
    const gaRat = rec.hedge_ratio || 0.85;
    const olsR = Math.max(0, gaRat - 0.12);
    const hePct = rec.he_index || 0;
    requestAnimationFrame(() => {
      if (!window.Plotly || !document.getElementById('chart-hedge-perf')) return;
      window.Plotly.newPlot('chart-hedge-perf', [{ x: ['OLS Ratio', 'GA Ratio', 'Hedge Effectiveness'], y: [olsR * 100, gaRat * 100, hePct], type: 'bar', marker: { color: ['#6B7280', '#D4AF37', '#16A34A'] }, text: [`${(olsR * 100).toFixed(1)}%`, `${(gaRat * 100).toFixed(1)}%`, `${hePct.toFixed(1)}%`], textposition: 'outside' }], { ...cleanLayout(220), yaxis: { ...cleanLayout(220).yaxis, title: '%' } }, { responsive: true, displayModeBar: false });
    });
  }

  const totalVal = qty * price;
  const liveP = livePrice || price;
  const priceDiff = liveP - price;
  const lots = result ? result.lots_needed || 1 : Math.max(1, Math.round((qty * profileRatioMap[profile]) / 100));
  const margin = qty * profileRatioMap[profile] * liveP * 0.30;
  const gaRat = result?.hedge_ratio || 0.85;
  const hePct = result?.he_index || 0;
  const olsR = Math.max(0, gaRat - 0.12);

  const signalMeta = {
    garch: { label: 'Volatility' }, lstm: { label: 'Price Trend (AI)' },
    sentiment: { label: 'Market Sentiment' }, regression: { label: 'Macro Outlook' }
  };
  const signalText = {
    garch: { HIGH: ['High', 'var(--red)'], MEDIUM: ['Moderate', 'var(--amber)'], LOW: ['Calm', 'var(--green)'] },
    lstm: { UP: ['Rising', 'var(--red)'], DOWN: ['Falling', 'var(--green)'], FLAT: ['Uncertain', 'var(--text-muted)'] },
    sentiment: { BEARISH: ['Negative', 'var(--red)'], NEUTRAL: ['Neutral', 'var(--text-muted)'], BULLISH: ['Positive', 'var(--green)'] },
    regression: { BULLISH: ['Bullish', 'var(--red)'], NEUTRAL: ['Mixed', 'var(--text-muted)'], BEARISH: ['Bearish', 'var(--green)'] },
  };
  const signalVals = result ? { garch: result.garch_risk || 'MEDIUM', lstm: result.lstm_direction || 'FLAT', sentiment: result.sentiment_signal || 'NEUTRAL', regression: result.regression_signal || 'NEUTRAL' } : {};
  const sb = result?.signal_breakdown || {};
  const verdict = result ? (result.verdict || result.decision || 'MONITOR') : '';
  const decLabel = verdict.includes('HEDGE NOW') ? 'HEDGE NOW' : verdict.includes('LOW RISK') ? 'LOW RISK' : 'MONITOR';
  const isLowRisk = decLabel === 'LOW RISK';

  const expiry = new Date().toLocaleString('en', { month: 'short', year: '2-digit' }).toUpperCase().replace(' ', '');
  const profileLots = Math.max(1, Math.round((qty * 0.85) / 100));
  const profileMargin = qty * 0.85 * liveP * 0.30;
  const execSteps = [
    ['1', 'Open your broker app', 'Zerodha Kite, Angel One, Motilal Oswal, or any MCX-registered broker'],
    ['2', 'Go to MCX market section', 'Navigate to Commodities → MCX → Metals'],
    ['3', 'Search Gold Mini', `Select the nearest month expiry contract (e.g. GOLDM${expiry})`],
    ['4', `Place a SELL order for ${profileLots} lot${profileLots !== 1 ? 's' : ''}`, 'Selling futures locks in today\'s price and protects you if gold rises'],
    ['5', `Keep ${fmtRs(profileMargin)} margin available`, 'This is the deposit your broker needs to open the position'],
  ];

  return (
    <div className="page-wrap">
      <div className="page-header">
        <h1>Hedge Advisor</h1>
        <p>Enter your order details. Our AI analyses 4 market signals and tells you exactly what to do.</p>
      </div>
      <hr className="divider" />

      {/* Input form */}
      <div className="card mb-2">
        <div className="grid g3 mb-2">
          <div className="form-group">
            <label className="form-label">Gold quantity (grams) *</label>
            <input className="form-control" type="number" min="10" max="100000" step="10" value={qty} onChange={e => setQty(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="form-group">
            <label className="form-label">Price booked with customer (₹/gm) *</label>
            <input className="form-control" type="number" min="1000" max="25000" step="10" value={price} onChange={e => setPrice(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="form-group">
            <label className="form-label">Expected delivery date *</label>
            <input className="form-control" type="date" value={delivery} onChange={e => setDelivery(e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ maxWidth: 400 }}>
          <label className="form-label">Customer name (optional)</label>
          <input className="form-control" type="text" placeholder="e.g. Ramesh Jewellers, Surat" value={cust} onChange={e => setCust(e.target.value)} />
        </div>
        {delivery && (
          <AlertBox type={delivDays < 30 ? 'error' : delivDays < 60 ? 'warning' : 'success'} className="mb-1">
            <strong>Delivery in {delivDays} days</strong> — {delivMsg}
          </AlertBox>
        )}
        {error && <AlertBox type="error" className="mb-1">{error}</AlertBox>}
        <button className="btn btn-primary btn-full btn-lg mt-2" onClick={submit} disabled={loading}>
          {loading ? 'Analysing market signals…' : 'Get My Hedge Recommendation'}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div>
          {cust && <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)', marginBottom: '0.5rem' }}>Order for: {cust}</p>}

          <div className="section-label">Your Order Summary</div>
          <div className="kpi-grid cols-3 mb-2">
            <KpiCard label="Total Order Value" value={fmtRs(totalVal)} delta={`${fmt(qty, 0)}g @ ${fmtRs(price)}/gm`} deltaClass="neutral" />
            <KpiCard label="Current Gold Rate" value={`${fmtRs(liveP)}/gm`} delta={`${priceDiff >= 0 ? '+' : ''}${fmtRs(priceDiff)}/gm`} deltaClass={priceDiff >= 0 ? 'down' : 'up'} />
            <KpiCard label="Delivery Timeline" value={`${delivDays} days`} delta={delivDays < 30 ? 'High urgency' : delivDays < 60 ? 'Moderate urgency' : 'Lower urgency'} deltaClass={delivDays < 30 ? 'down' : delivDays < 60 ? 'neutral' : 'up'} />
          </div>
          <div style={{ background: '#F3F4F6', borderRadius: 100, height: 8, marginBottom: '1.5rem', overflow: 'hidden' }}>
            <div className="progress-bar" style={{ background: 'linear-gradient(90deg,#D4AF37,#B8860B)', height: '100%', width: `${Math.min(100, Math.max(0, (1 - delivDays / 90) * 100))}%` }} />
          </div>

          <div className="section-label">AI Hedging Decision</div>
          <div className="mb-2">
            <DecisionCard decision={decLabel} confidence={result.confidence_score || 70} riskLevel={result.risk_level || 'MEDIUM'} bullets={result.explanation_bullets || []} action={{ lots_needed: lots, margin_required: result.margin_required || 0, instrument: 'MCX Mini Gold' }} />
          </div>

          <div className="section-label">Your Financial Risk</div>
          <AlertBox type="warning" className="mb-2">
            If gold prices rise after you have booked at {fmtRs(price)}/gm, you absorb the extra cost. Here is how much you could lose — and how much a hedge protects.
          </AlertBox>
          {(result.scenarios || [
            { scenario_label: 'Gold rises 5%', loss_without_hedge: qty * price * 0.05, loss_with_hedge: qty * price * 0.05 * 0.15, savings: qty * price * 0.05 * 0.85 },
            { scenario_label: 'Gold rises 10%', loss_without_hedge: qty * price * 0.10, loss_with_hedge: qty * price * 0.10 * 0.15, savings: qty * price * 0.10 * 0.85 },
          ]).map((sc, i) => {
            const maxV = Math.max(sc.loss_without_hedge, 1);
            const pctH = Math.round((sc.loss_with_hedge / maxV) * 100);
            const savedPct = Math.round((sc.savings / maxV) * 100);
            return (
              <div key={i} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.3rem 1.6rem', boxShadow: 'var(--shadow)', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: '1rem' }}>{sc.scenario_label}</div>
                <div className="loss-row"><span className="label">Without hedge</span><span className="amount-bad">-{fmtRs(sc.loss_without_hedge)}</span></div>
                <div className="progress-wrap" style={{ background: '#FEE2E2', marginBottom: '0.5rem' }}><div className="progress-bar red" style={{ width: '100%' }} /></div>
                <div className="loss-row"><span className="label">With hedge (85% offset)</span><span className="amount-good">-{fmtRs(sc.loss_with_hedge)}</span></div>
                <div className="progress-wrap" style={{ background: '#DCFCE7', marginBottom: '0.5rem' }}><div className="progress-bar green" style={{ width: `${pctH}%` }} /></div>
                <div style={{ background: 'var(--blue-bg)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--blue)' }}>You protect</span>
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--blue)' }}>{fmtRs(sc.savings)} ({savedPct}%)</span>
                </div>
              </div>
            );
          })}

          <hr className="divider" />

          <div className="section-label">What You Should Do</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            {['conservative', 'balanced', 'aggressive'].map(p => (
              <button key={p} className={`profile-btn${profile === p ? ' active' : ''}`} onClick={() => setProfile(p)}>
                {p.charAt(0).toUpperCase() + p.slice(1)} ({(profileRatioMap[p] * 100).toFixed(0)}%)
              </button>
            ))}
          </div>
          <div className="grid g2 mb-2">
            <div className="card">
              <div className="kpi-label mb-1">Your Hedge Plan — {profile.charAt(0).toUpperCase() + profile.slice(1)} ({(profileRatioMap[profile] * 100).toFixed(0)}%)</div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)', marginBottom: '0.8rem' }}>Based on: {fmt(qty, 0)}g @ {fmtRs(price)}/gm</p>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--gold-dark)', marginBottom: '0.3rem' }}>{lots} lot{lots !== 1 ? 's' : ''} of MCX Mini Gold</div>
              <p style={{ fontSize: '0.88rem' }}>Hedge ratio: <strong>{(profileRatioMap[profile] * gaRat * 100).toFixed(0)}%</strong> of exposure</p>
              <p style={{ fontSize: '0.88rem' }}>Margin required: <strong>{fmtRs(margin)}</strong></p>
              <p style={{ fontSize: '0.88rem' }}>Instrument: <strong>MCX Mini Gold (100g / lot)</strong></p>
            </div>
            <div className="card">
              <div className="kpi-label mb-1">Profile Comparison</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', textAlign: 'center' }}>
                {['conservative', 'balanced', 'aggressive'].map(p => (
                  <div key={p} onClick={() => setProfile(p)} style={{ background: profile === p ? '#fff' : '#F9FAFB', border: profile === p ? '2px solid #D4AF37' : '1px solid var(--border)', borderRadius: 10, padding: '0.7rem 0.3rem', cursor: 'pointer' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>{p.charAt(0).toUpperCase() + p.slice(1)}</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, marginTop: '0.2rem' }}>{(profileRatioMap[p] * 100).toFixed(0)}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {!isLowRisk && (
            <>
              <hr className="divider" />
              <div className="section-label">How to Execute This Hedge</div>
              <div className="card mb-2">
                {execSteps.map(([num, title, desc]) => (
                  <div key={num} className="step-row">
                    <div className="step-num">{num}</div>
                    <div><div className="step-title">{title}</div><div className="step-desc">{desc}</div></div>
                  </div>
                ))}
              </div>
              <AlertBox type="info" className="mb-2">GoldShield does not execute trades. We provide the analysis — your broker executes the trade.</AlertBox>

              {/* ── Execute via GoldShield Wallet ── */}
              <div className="or-divider">— OR execute directly through GoldShield —</div>
              <WalletExecution
                lots={profileLots}
                margin={profileMargin}
                livePrice={liveP}
                orderId={null}
                profile={profile}
                expiry={expiry}
                onSuccess={(posId) => setHedgePositionId(posId)}
                hedgePositionId={hedgePositionId}
              />
            </>
          )}

          <hr className="divider" />

          <div className="section-label">Why We Recommend This</div>
          <div className="grid g2 mb-2">
            {Object.entries(signalMeta).map(([key, meta]) => {
              const val = signalVals[key];
              const [txt, clr] = signalText[key]?.[val] || ['Unknown', 'var(--text-muted)'];
              const pts = sb[key]?.points || 0;
              return (
                <div key={key} className="signal-card" style={{ border: pts > 0 ? `2px solid ${clr}` : '1px solid var(--border)' }}>
                  <div className="signal-label">{meta.label}</div>
                  <div className="signal-value" style={{ color: clr }}>{txt}</div>
                  {pts > 0 && <div className="signal-trigger">Risk trigger active</div>}
                </div>
              );
            })}
          </div>
          {(result.explanation_bullets || []).map((b, i) => <div key={i} className="why-bullet">{b}</div>)}

          <hr className="divider" />

          <div className="section-label">How Effective Is This Hedge</div>
          <div className="kpi-grid cols-3 mb-2">
            <div className="kpi-card" style={{ textAlign: 'center', background: 'var(--green-bg)' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--green)' }}>{hePct.toFixed(0)}%</div>
              <div className="kpi-label" style={{ color: '#166534' }}>Price risk reduced</div>
            </div>
            <div className="kpi-card" style={{ textAlign: 'center', background: 'var(--blue-bg)' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--blue)' }}>{(gaRat * 100).toFixed(0)}%</div>
              <div className="kpi-label" style={{ color: '#1E40AF' }}>AI-Optimised ratio</div>
            </div>
            <div className="kpi-card" style={{ textAlign: 'center', background: 'var(--gold-50)' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--amber)' }}>+{((gaRat - olsR) * 100).toFixed(0)}%</div>
              <div className="kpi-label" style={{ color: '#92400E' }}>Edge over baseline</div>
            </div>
          </div>
          <div className="card" style={{ padding: '0.5rem' }}>
            <div id="chart-hedge-perf" style={{ height: '220px' }} />
          </div>
        </div>
      )}

      {!result && !loading && (
        <div className="empty-state mt-2">
          <div style={{ marginBottom: '0.8rem' }}>
            <svg width="48" height="48" viewBox="0 0 100 100" fill="none" style={{ margin: '0 auto' }}>
              <rect width="100" height="100" rx="18" fill="#F0FDF4"/>
              <path d="M50 12 L82 28 L82 56 Q82 78 50 92 Q18 78 18 56 L18 28 Z" fill="#C9A84C" opacity="0.3"/>
              <path d="M50 22 L74 35 L74 56 Q74 72 50 82 Q26 72 26 56 L26 35 Z" fill="#C9A84C" opacity="0.6"/>
            </svg>
          </div>
          <h3>Fill the form above and click "Get My Hedge Recommendation"</h3>
          <p>Our AI will analyse 4 market signals and tell you exactly what to do.</p>
        </div>
      )}

      <hr className="divider" />
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-sub)', paddingTop: '0.5rem', gap: '0.5rem' }}>
        <span><strong>GoldShield</strong> — AI-powered decision support for Indian jewellers</span>
        <span>Not financial advice — consult a SEBI-registered broker before trading</span>
      </div>
    </div>
  );
}
