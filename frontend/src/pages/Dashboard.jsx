import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Radio, Clock, Target } from 'lucide-react';
import { apiFetch } from '../api.js';
import { useApp } from '../state.jsx';
import { fmt, fmtRs, fmtPct, fmtDate, stdDev, riskArrow, moodLabel, dirLabel, plotlyLayout, plotlyConfig, goldGradientFill } from '../utils.js';
import KpiCard from '../components/KpiCard.jsx';
import DecisionCard from '../components/DecisionCard.jsx';
import AlertBox from '../components/AlertBox.jsx';

const cleanLayout = (h, xTitle = 'Date', yTitle = '₹/gm') => ({
  ...plotlyLayout(h, {
    xaxis: { title: { text: xTitle, font: { size: 11 } }, showgrid: true, gridcolor: '#e5e7eb', gridwidth: 0.5, zeroline: false },
    yaxis: { title: { text: yTitle, font: { size: 11 } }, showgrid: true, gridcolor: '#e5e7eb', gridwidth: 0.5, zeroline: false },
  }),
  showlegend: true,
});

export default function Dashboard() {
  // ── Read from global cache — no local fetching on mount ──
  const { dashData, macroData, volData, fcData, globalLoading, preloadData, showToast } = useApp();
  const data = dashData;
  const mac  = macroData;
  const vol  = volData;
  const loading = globalLoading && !data;

  // Local interactive state only
  const [fcHorizon, setFcHorizon] = useState(14);
  const [localFc, setLocalFc]     = useState(null); // trimmed view of global fcData
  const [simQty, setSimQty]       = useState(500);
  const [simPrice, setSimPrice]   = useState(() => Math.round(dashData?.gold_price) || 9500);
  const [lossData, setLossData]   = useState(null);

  // Sync simPrice when live price arrives
  useEffect(() => {
    if (data?.gold_price) setSimPrice(Math.round(data.gold_price));
  }, [data?.gold_price]);

  // Render charts whenever global data changes
  useEffect(() => { if (vol && window.Plotly) renderVolChart(); }, [vol]);
  useEffect(() => { if (mac && data && window.Plotly) renderMacroChart(); }, [mac, data]);

  // Load / re-render forecast when fcData arrives or horizon changes
  useEffect(() => {
    if (!data || loading) return;
    renderForecast(fcHorizon, fcData);
  }, [data, loading, fcData, fcHorizon]);

  // Loss sim whenever inputs change
  useEffect(() => { if (data) updateLoss(); }, [simQty, simPrice, data]);


  async function updateLoss() {
    const body = JSON.stringify({ quantity_grams: simQty, booking_price: simPrice, hedge_offset: 0.85 });
    const d = await apiFetch('/loss-simulation', { method: 'POST', body });
    if (d?.scenarios) setLossData(d.scenarios);
    else {
      const p = simPrice;
      setLossData([
        { scenario_label: 'Gold rises 5%', future_price: p * 1.05, loss_without_hedge: simQty * p * 0.05, loss_with_hedge: simQty * p * 0.05 * 0.15, savings: simQty * p * 0.05 * 0.85 },
        { scenario_label: 'Gold rises 10%', future_price: p * 1.10, loss_without_hedge: simQty * p * 0.10, loss_with_hedge: simQty * p * 0.10 * 0.15, savings: simQty * p * 0.10 * 0.85 },
      ]);
    }
  }

  function renderForecast(n, fcRaw) {
    if (!fcRaw) return;
    const hist = fcRaw.historical_prices || [];
    const histD = fcRaw.historical_dates || [];
    const fcP = (fcRaw.forecast_prices || []).slice(0, n);
    const fcD = (fcRaw.forecast_dates || []).slice(0, n);
    const dir = fcRaw.direction || 'FLAT';
    const fcColor = dir === 'UP' ? '#EF4444' : dir === 'DOWN' ? '#16A34A' : '#6B7280';
    const sd = hist.length > 1 ? stdDev(hist.slice(-30)) : 0;
    const upper = fcP.map(p => p + sd), lower = fcP.map(p => p - sd);
    const fillColor = dir === 'UP' ? 'rgba(239,68,68,0.08)' : dir === 'DOWN' ? 'rgba(22,163,74,0.08)' : 'rgba(107,114,128,0.08)';
    requestAnimationFrame(() => {
      if (!window.Plotly || !document.getElementById('chart-forecast')) return;
      window.Plotly.newPlot('chart-forecast', [
        { x: histD, y: hist, mode: 'lines', name: 'Historical (90 days)', line: { color: '#2563EB', width: 2 }, hovertemplate: '<b>%{x}</b><br>₹%{y:,.0f}/gm<extra></extra>' },
        { x: [...fcD, ...fcD.slice().reverse()], y: [...upper, ...lower.reverse()], fill: 'toself', fillcolor: fillColor, line: { color: 'rgba(255,255,255,0)' }, hoverinfo: 'skip', name: 'Confidence band' },
        { x: fcD, y: fcP, mode: 'lines+markers', name: `${n}-day Forecast`, line: { color: fcColor, width: 2.5, dash: 'dash' }, marker: { size: 5, color: fcColor }, hovertemplate: '<b>Forecast %{x}</b><br>₹%{y:,.0f}/gm<extra></extra>' },
      ], cleanLayout(380), { responsive: true, displayModeBar: false });
    });
  }

  function renderVolChart() {
    requestAnimationFrame(() => {
      if (!window.Plotly || !document.getElementById('chart-vol')) return;
      window.Plotly.newPlot('chart-vol', [{ x: vol.dates || [], y: vol.volatility_values || [], type: 'scatter', mode: 'lines', fill: 'tozeroy', fillcolor: 'rgba(212,160,23,0.12)', line: { color: '#D4A017', width: 2 }, name: '30-day Rolling Volatility', hovertemplate: '<b>%{x}</b><br>Volatility: %{y:.2f}%<extra></extra>' }], cleanLayout(300, 'Date', 'Volatility (%)'), plotlyConfig);
    });
  }

  function renderMacroChart() {
    if (!mac.macro_contributions) return;
    const contrib = mac.macro_contributions;
    const labels = Object.keys(contrib);
    const values = Object.values(contrib);
    const sorted = labels.map((l, i) => ({ l, v: values[i] })).sort((a, b) => a.v - b.v);
    const nameMap = { usd_inr: 'USD/INR Rate', oil: 'Crude Oil', nifty: 'Nifty Index', int_gold_usd: 'Intl Gold (USD)' };
    requestAnimationFrame(() => {
      if (!window.Plotly || !document.getElementById('chart-macro-contrib')) return;
      window.Plotly.newPlot('chart-macro-contrib', [{ x: sorted.map(i => i.v), y: sorted.map(i => nameMap[i.l] || i.l), orientation: 'h', type: 'bar', marker: { color: sorted.map(i => i.v < 0 ? '#dc2626' : '#16a34a') }, text: sorted.map(i => (i.v >= 0 ? '+' : '') + fmt(i.v, 0)), textposition: 'outside', hovertemplate: '<b>%{y}</b><br>₹%{x:,.0f}<extra></extra>' }], { ...cleanLayout(260, '₹ Contribution', 'Factor'), xaxis: { ...cleanLayout(260).xaxis, title: { text: 'Price Contribution (₹/gm)', font:{size:11} } } }, plotlyConfig);
    });
  }

  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const driverKeys = ['usd_inr', 'oil', 'nifty', 'int_gold_usd'];
  const driverLabels = { usd_inr: 'Dollar Rate', oil: 'Crude Oil (USD)', nifty: 'Nifty Index', int_gold_usd: 'Intl Gold (USD/oz)' };

  return (
    <div className="page-wrap">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1>{greeting}</h1>
          <p>Gold market summary for today — {dateStr}</p>
        </div>
        <button className="btn btn-ghost" style={{ fontSize: '0.85rem' }} onClick={() => preloadData(true)}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Trust bar */}
      <div className="trust-bar">
        <span><span className="live-dot" />Live</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Clock size={13} /> Updated just now</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Radio size={13} /> Sources: MCX · RBI · Global Markets</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Target size={13} /> Forecast accuracy: 97.1%</span>
      </div>

      <hr className="divider" />

      {/* Decision card */}
      <div className="section-label">AI Hedging Decision</div>
      {loading ? <div className="skeleton skeleton-card mb-2" /> : data ? (
        <DecisionCard decision={data.decision} confidence={data.confidence_score} riskLevel={data.decision_risk_level} bullets={data.explanation_bullets} action={data.recommended_action} />
      ) : <AlertBox type="error">API server offline — start it with <code>python api.py</code></AlertBox>}

      <hr className="divider" />

      {/* Loss simulation */}
      <div className="section-label">Potential Loss Without Hedging</div>
      <div className="grid g2 mb-2">
        <div className="form-group">
          <label className="form-label">Order quantity (grams)</label>
          <input className="form-control" type="number" min="100" max="100000" step="100" value={simQty} onChange={e => setSimQty(parseFloat(e.target.value) || 500)} />
        </div>
        <div className="form-group">
          <label className="form-label">Price booked with customer (₹/gm)</label>
          <input className="form-control" type="number" min="3000" max="25000" step="50" value={simPrice} onChange={e => setSimPrice(parseFloat(e.target.value) || 9500)} />
        </div>
      </div>
      <div className="grid g2">
        {lossData ? lossData.map((sc, i) => {
          const maxV = Math.max(sc.loss_without_hedge, 1);
          const pctH = Math.round((sc.loss_with_hedge / maxV) * 100);
          return (
            <div key={i} className="loss-card">
              <h3>{sc.scenario_label}</h3>
              <div className="loss-row"><span className="label">Future gold price</span><span style={{ fontWeight: 700 }}>{fmtRs(sc.future_price)}/gm</span></div>
              <div className="loss-row"><span className="label">Without hedge</span><span className="amount-bad">-{fmtRs(sc.loss_without_hedge)}</span></div>
              <div className="progress-wrap" style={{ background: '#FEE2E2', marginBottom: '0.5rem' }}><div className="progress-bar red" style={{ width: '100%' }} /></div>
              <div className="loss-row"><span className="label">With hedge (85% offset)</span><span className="amount-good">-{fmtRs(sc.loss_with_hedge)}</span></div>
              <div className="progress-wrap" style={{ background: '#DCFCE7', marginBottom: '0.5rem' }}><div className="progress-bar green" style={{ width: `${pctH}%` }} /></div>
              <div className="loss-row"><span className="label">You save</span><span className="amount-save">{fmtRs(sc.savings)}</span></div>
            </div>
          );
        }) : [0, 1].map(i => <div key={i} className="loss-card"><div className="skeleton skeleton-card" /></div>)}
      </div>

      <hr className="divider" />

      {/* KPI snapshot */}
      <div className="section-label">Market Snapshot</div>
      <div className="kpi-grid cols-4 mb-2">
        {loading || !data ? [0,1,2,3].map(i => <div key={i} className="kpi-card"><div className="skeleton skeleton-kpi" /></div>) : <>
          <KpiCard label="Gold Rate Now" value={fmtRs(data.gold_price) + ' /gm'} delta={fmtPct(data.gold_change_pct) + ' vs yesterday'} deltaClass={data.gold_change_pct >= 0 ? 'up' : 'down'} sub="MCX · COMEX (15-min delay)" href="https://allindiabullion.com/gold-rate/maharashtra/mumbai" />
          <KpiCard label="Market Risk" value={riskArrow(data.risk_level)} delta={'Volatility: ' + data.volatility?.toFixed(2) + '%'} deltaClass={data.risk_level === 'HIGH' ? 'down' : data.risk_level === 'LOW' ? 'up' : 'neutral'} />
          <KpiCard label="Market Mood" value={moodLabel(data.sentiment_signal)} delta={data.sentiment_signal} deltaClass="neutral" />
          <KpiCard label="Price Direction" value={dirLabel(data.lstm_direction)} delta="Next 14 days" deltaClass="neutral" />
        </>}
      </div>

      <hr className="divider" />

      {/* Forecast chart */}
      <div className="flex justify-between items-center mb-2">
        <div className="section-title">Gold Price Forecast</div>
        <div className="radio-toggle">
          {[7, 14, 30].map(n => (
            <button key={n} className={`radio-toggle-btn${fcHorizon === n ? ' active' : ''}`} onClick={() => setFcHorizon(n)}>{n} days</button>
          ))}
        </div>
      </div>
      <div className="card" style={{ padding: '0.5rem' }}>
        <div id="chart-forecast" style={{ height: '380px' }} />
      </div>
      <div className="kpi-grid cols-3 mt-2 mb-2">
        <KpiCard label="Forecast Accuracy" value="97.1% (MAPE 2.88%)" />
        <KpiCard label="Forecast Horizon" value={`${fcHorizon} days`} />
        <KpiCard label="Model" value="LSTM + GARCH" sub="AI-powered ensemble" />
      </div>

      <hr className="divider" />

      {/* Sentiment */}
      <div className="section-title">What the Market Is Saying</div>
      <div className="grid g2 mb-2">
        <div className="card">
          {data ? (
            <div>
              <div className="kpi-label" style={{ marginBottom: '0.5rem' }}>Market Mood</div>
              <span className={`mood-pill ${moodLabel(data.sentiment_signal).toLowerCase()}`}>{moodLabel(data.sentiment_signal)}</span>
              <p style={{ marginTop: '0.8rem', fontSize: '0.92rem', color: 'var(--text)', fontWeight: 500, lineHeight: 1.55 }}>
                {data.mood_interpretation || 'Market sentiment analysis based on recent financial news.'}
              </p>
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--green)', fontWeight: 600 }}>{data.positive_count || 0} positive</span>
                <span style={{ fontSize: '0.82rem', color: 'var(--red)', fontWeight: 600 }}>{data.negative_count || 0} negative</span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>{data.neutral_count || 0} neutral</span>
              </div>
              <p style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-sub)' }}>Based on {data.total_articles || 0} financial news articles</p>
            </div>
          ) : <div className="skeleton skeleton-card" />}
        </div>
        <div className="card">
          <div className="kpi-label" style={{ marginBottom: '0.6rem' }}>Recent News Headlines</div>
          {data?.articles?.slice(0, 6).map((a, i) => {
            const lbl = (a.label || 'Neutral').toLowerCase();
            return (
              <div key={i} className="news-article">
                <div className="news-headline">{(a.title || '').substring(0, 85)}{a.title?.length > 85 ? '…' : ''}</div>
                <div className="news-meta"><span className={`news-dot ${lbl}`} /><span>{a.source || 'NewsAPI'}</span><span>·</span><span>{a.label || 'Neutral'}</span></div>
              </div>
            );
          }) || <div className="skeleton skeleton-card" />}
        </div>
      </div>

      <hr className="divider" />

      {/* Market drivers */}
      <div className="section-title">What Is Moving Gold Prices Today</div>
      <div className="kpi-grid cols-4 mb-2">
        {mac ? driverKeys.map(k => {
          const val = mac[k], chg = mac[k + '_7d_change'];
          if (val == null) return <KpiCard key={k} label={driverLabels[k]} value="–" />;
          const dCls = chg > 0.5 ? 'up' : chg < -0.5 ? 'down' : 'neutral';
          return <KpiCard key={k} label={driverLabels[k]} value={fmt(val, 2)} delta={(chg >= 0 ? '+' : '') + chg?.toFixed(2) + '% (7d)'} deltaClass={dCls} />;
        }) : [0,1,2,3].map(i => <div key={i} className="kpi-card"><div className="skeleton skeleton-kpi" /></div>)}
      </div>
      {mac && data && (
        <AlertBox type={data.regression_signal === 'BULLISH' ? 'warning' : data.regression_signal === 'BEARISH' ? 'error' : 'info'} className="mb-2">
          Gold prices may <strong>{data.regression_signal === 'BULLISH' ? 'rise' : data.regression_signal === 'BEARISH' ? 'fall' : 'remain stable'}</strong> in the short term based on macro factors.
        </AlertBox>
      )}
      <div className="card" style={{ padding: '0.5rem', marginBottom: '1rem' }}>
        <div id="chart-macro-contrib" style={{ height: '260px' }} />
      </div>

      <hr className="divider" />

      {/* Volatility */}
      <div className="section-title">Price Volatility — Last 12 Months</div>
      <div className="card" style={{ padding: '0.5rem', marginBottom: '1rem' }}>
        <div id="chart-vol" style={{ height: '300px' }} />
      </div>
      <div className="kpi-grid cols-3 mb-2">
        <KpiCard label="Current Volatility" value={vol ? vol.current?.toFixed(2) + '%' : '–'} />
        <KpiCard label="30-Day Average" value={vol ? vol.avg_30d?.toFixed(2) + '%' : '–'} />
        <KpiCard label="Peak This Year" value={vol ? vol.peak_year?.toFixed(2) + '%' : '–'} />
      </div>

      <hr className="divider" />
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--text-sub)', paddingTop: '0.5rem' }}>
        <span><strong>GoldShield</strong> — AI-powered hedging for Indian jewellers</span>
        <span>Data: MCX · RBI · Global Markets</span>
        <span>Not financial advice — consult a SEBI broker</span>
      </div>
    </div>
  );
}
