import { useEffect, useState } from 'react';
import { useApp } from '../state.jsx';
import { fmt, fmtRs, fmtPct, plotlyLayout, plotlyConfig } from '../utils.js';
import KpiCard from '../components/KpiCard.jsx';
import AlertBox from '../components/AlertBox.jsx';

const cleanLayout = (h, xTitle = 'Date', yTitle = '₹/gm') => ({
  ...plotlyLayout(h, {
    xaxis: { title: { text: xTitle, font: { size: 11 } }, showgrid: true, gridcolor: '#e5e7eb', gridwidth: 0.5, zeroline: false },
    yaxis: { title: { text: yTitle, font: { size: 11 } }, showgrid: true, gridcolor: '#e5e7eb', gridwidth: 0.5, zeroline: false },
  }),
  showlegend: true,
});

export default function Markets() {
  // ── All data from global cache — no re-fetch on navigation ──
  const { dashData, macroData, volData: volDataG, fcData, mktHistData, globalLoading, preloadData } = useApp();
  const [mktTab, setMktTab] = useState('gold-price');
  const loading = globalLoading && !dashData;

  const d        = dashData;
  const macData  = macroData;
  const volData  = volDataG;
  const timestamp = dashData?.timestamp
    ? new Date(dashData.timestamp).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:true, timeZone:'Asia/Kolkata' }) + ' IST'
    : '';

  // Re-render charts when global data or active tab changes
  useEffect(() => {
    if (!loading) renderCharts();
  }, [d, mktHistData, volData, macData, fcData, mktTab, loading]);

  function renderCharts() {
    if (!window.Plotly) return;
    requestAnimationFrame(() => {
      if (mktTab === 'gold-price' && mktHistData && document.getElementById('chart-mkt-price')) {
        // Use real market history from /api/market-data
        const dates = mktHistData.dates || [];
        const closes = mktHistData.closes || [];
        const ma20 = mktHistData.ma20 || [];
        const ma50 = mktHistData.ma50 || [];
        window.Plotly.newPlot('chart-mkt-price', [
          { x: dates, y: closes, mode: 'lines', name: 'Gold Price (USD/oz)', line: { color: '#D4A017', width: 2.5 }, fill: 'tozeroy', fillcolor: 'rgba(212,160,23,0.1)', hovertemplate: '<b>%{x}</b><br>$%{y:,.0f}/oz<extra></extra>' },
          { x: dates, y: ma20.map(v => v || null), mode: 'lines', name: 'MA 20', line: { color: '#2563eb', width: 1.5, dash: 'dot' }, hovertemplate: '<b>%{x}</b><br>MA20: $%{y:,.0f}<extra></extra>' },
          { x: dates, y: ma50.map(v => v || null), mode: 'lines', name: 'MA 50', line: { color: '#dc2626', width: 1.5, dash: 'dot' }, hovertemplate: '<b>%{x}</b><br>MA50: $%{y:,.0f}<extra></extra>' },
        ], cleanLayout(480, 'Date', 'USD/oz'), plotlyConfig);
      }
      if (mktTab === 'forecast' && fcData && document.getElementById('chart-mkt-forecast')) {
        const hist = fcData.historical_prices || [], histD = fcData.historical_dates || [];
        const fcP = (fcData.forecast_prices || []).slice(0, 14), fcD = (fcData.forecast_dates || []).slice(0, 14);
        const dir = fcData.direction || 'FLAT';
        const fcColor = dir === 'UP' ? '#EF4444' : dir === 'DOWN' ? '#16A34A' : '#6B7280';
        window.Plotly.newPlot('chart-mkt-forecast', [
          { x: histD, y: hist, mode: 'lines', name: 'Historical', line: { color: '#2563eb', width: 2 }, hovertemplate: '<b>%{x}</b><br>₹%{y:,.0f}/gm<extra></extra>' },
          { x: fcD, y: fcP, mode: 'lines+markers', name: '14-day Forecast', line: { color: fcColor, width: 2.5, dash: 'dash' }, marker: { size: 4, color: fcColor }, hovertemplate: '<b>%{x}</b><br>Forecast: ₹%{y:,.0f}<extra></extra>' }
        ], cleanLayout(380, 'Date', '₹/gm'), plotlyConfig);
      }
      if (mktTab === 'vol' && volData && document.getElementById('chart-mkt-vol')) {
        window.Plotly.newPlot('chart-mkt-vol', [{ x: volData.dates || [], y: volData.volatility_values || [], type: 'scatter', mode: 'lines', fill: 'tozeroy', fillcolor: 'rgba(212,160,23,0.12)', line: { color: '#D4A017', width: 2 }, name: '30-day Rolling Volatility', hovertemplate: '<b>%{x}</b><br>Vol: %{y:.2f}%<extra></extra>' }], cleanLayout(300, 'Date', 'Volatility (%)'), plotlyConfig);
      }
      if (macData?.macro_contributions && document.getElementById('chart-macro-contrib-mkt')) {
        const contrib = macData.macro_contributions;
        const labels = Object.keys(contrib), values = Object.values(contrib);
        const sorted = labels.map((l, i) => ({ l, v: values[i] })).sort((a, b) => a.v - b.v);
        const nameMap = { usd_inr: 'USD/INR Rate', oil: 'Crude Oil', nifty: 'Nifty Index', int_gold_usd: 'Intl Gold (USD)' };
        window.Plotly.newPlot('chart-macro-contrib-mkt', [{ x: sorted.map(i => i.v), y: sorted.map(i => nameMap[i.l] || i.l), orientation: 'h', type: 'bar', marker: { color: sorted.map(i => i.v < 0 ? '#dc2626' : '#16a34a') }, text: sorted.map(i => (i.v >= 0 ? '+' : '') + Math.round(i.v)), textposition: 'outside', hovertemplate: '<b>%{y}</b><br>₹%{x:,.0f}<extra></extra>' }], { ...cleanLayout(260, '₹ Contribution', 'Factor'), xaxis: { ...cleanLayout(260).xaxis, title: { text: 'Price Contribution (₹/gm)', font:{size:11} } } }, plotlyConfig);
      }
    });
  }

  const driverKeys = ['usd_inr', 'oil', 'nifty', 'int_gold_usd'];
  const driverLabels = { usd_inr: 'Dollar Rate (₹)', oil: 'Crude Oil (USD/bbl)', nifty: 'Nifty Index', int_gold_usd: 'Intl Gold (USD/oz)' };

  return (
    <div className="page-wrap">
      <div className="page-header">
        <h1>Markets</h1>
        <p>Live gold market data, price trends, and economic indicators affecting your business.</p>
      </div>
      <hr className="divider" />

      {/* Live snapshot */}
      <div className="kpi-grid cols-6 mb-2">
        {loading || !d ? [0,1,2,3,4,5].map(i => <div key={i} className="kpi-card"><div className="skeleton skeleton-kpi" /></div>) : <>
          <KpiCard label="Gold (₹/gm)" value={fmtRs(d.gold_price)} delta={fmtPct(d.gold_change_pct)} deltaClass={d.gold_change_pct >= 0 ? 'up' : 'down'} href="https://allindiabullion.com/gold-rate/maharashtra/mumbai" />
          <KpiCard label="Gold (USD/oz)" value={`$${fmt(d.gold_usd_oz || 0, 0)}`} />
          <KpiCard label="USD/INR" value={fmt(macData?.usd_inr, 2)} delta={macData?.usd_inr_7d_change != null ? (macData.usd_inr_7d_change >= 0 ? '+' : '') + macData.usd_inr_7d_change?.toFixed(2) + '% (7d)' : ''} deltaClass={macData?.usd_inr_7d_change >= 0 ? 'up' : 'down'} />
          <KpiCard label="Crude Oil (USD)" value={fmt(macData?.oil, 1)} />
          <KpiCard label="Nifty 50" value={fmt(macData?.nifty, 0)} />
          <KpiCard label="Volatility" value={d.volatility?.toFixed(2) + '%'} delta={d.risk_level} deltaClass={d.risk_level === 'HIGH' ? 'down' : d.risk_level === 'LOW' ? 'up' : 'neutral'} />
        </>}
      </div>

      {/* Chart tabs */}
      <div className="tabs">
        <button className={`tab-btn${mktTab === 'gold-price' ? ' active' : ''}`} onClick={() => setMktTab('gold-price')}>Gold Price</button>
        <button className={`tab-btn${mktTab === 'forecast' ? ' active' : ''}`} onClick={() => setMktTab('forecast')}>Price Forecast</button>
        <button className={`tab-btn${mktTab === 'vol' ? ' active' : ''}`} onClick={() => setMktTab('vol')}>Volatility</button>
        <button className={`tab-btn${mktTab === 'sent' ? ' active' : ''}`} onClick={() => setMktTab('sent')}>Sentiment</button>
      </div>
      {mktTab === 'gold-price' && (
        <>
          <div className="card" style={{ padding: '0.5rem', marginBottom: '1rem' }}><div id="chart-mkt-price" style={{ height: 480 }} /></div>
          <div className="kpi-grid cols-3">
            {d ? <>
              <KpiCard label="Current Price" value={fmtRs(d.gold_price) + '/gm'} delta={fmtPct(d.gold_change_pct)} deltaClass={d.gold_change_pct >= 0 ? 'up' : 'down'} />
              <KpiCard label="Market Risk" value={d.risk_level} deltaClass={d.risk_level === 'HIGH' ? 'down' : 'up'} />
              <KpiCard label="Price Direction" value={d.lstm_direction === 'UP' ? 'Rising' : d.lstm_direction === 'DOWN' ? 'Falling' : 'Stable'} sub="AI LSTM forecast" />
            </> : null}
          </div>
        </>
      )}
      {mktTab === 'forecast' && (
        <>
          <div className="card" style={{ padding: '0.5rem', marginBottom: '1rem' }}><div id="chart-mkt-forecast" style={{ height: 380 }} /></div>
          <div className="kpi-grid cols-3">
            <KpiCard label="Forecast Accuracy" value="97.1% (MAPE 2.88%)" />
            <KpiCard label="Forecast Horizon" value="14 days" />
            <KpiCard label="Expected Direction" value={fcData ? (fcData.direction === 'UP' ? 'Rising' : fcData.direction === 'DOWN' ? 'Falling' : 'Stable') : '–'} />
          </div>
        </>
      )}
      {mktTab === 'vol' && (
        <>
          <div className="card" style={{ padding: '0.5rem', marginBottom: '1rem' }}><div id="chart-mkt-vol" style={{ height: 300 }} /></div>
          <div className="kpi-grid cols-3 mb-1">
            <KpiCard label="Current Volatility" value={volData ? volData.current?.toFixed(2) + '%' : '–'} />
            <KpiCard label="30-Day Average" value={volData ? volData.avg_30d?.toFixed(2) + '%' : '–'} />
            <KpiCard label="Peak This Year" value={volData ? volData.peak_year?.toFixed(2) + '%' : '–'} />
          </div>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>Higher volatility means gold prices are moving more unpredictably — increasing the risk to your unhedged orders.</p>
        </>
      )}
      {mktTab === 'sent' && sentData && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="kpi-label mb-1">Market Sentiment</div>
          <span className={`mood-pill ${sentData.signal === 'BULLISH' ? 'positive' : sentData.signal === 'BEARISH' ? 'negative' : 'neutral'}`}>
            {sentData.signal === 'BULLISH' ? 'Positive' : sentData.signal === 'BEARISH' ? 'Negative' : 'Neutral'}
          </span>
          <p style={{ marginTop: '0.8rem', fontSize: '0.92rem', lineHeight: 1.6 }}>{sentData.interpretation || 'Sentiment analysis based on recent financial news headlines.'}</p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--green)', fontWeight: 600 }}>{sentData.positive_count || 0} positive</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--red)', fontWeight: 600 }}>{sentData.negative_count || 0} negative</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>{sentData.neutral_count || 0} neutral</span>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-sub)', marginTop: '0.4rem' }}>Based on {sentData.total_articles || 0} articles analysed by FinBERT AI</p>
          <div style={{ marginTop: '1.25rem' }}>
            {(sentData.articles || []).slice(0, 8).map((a, i) => {
              const lbl = (a.label || 'Neutral').toLowerCase();
              return (
                <div key={i} className="news-article">
                  <div className="news-headline">{(a.title || '').substring(0, 90)}{a.title?.length > 90 ? '…' : ''}</div>
                  <div className="news-meta"><span className={`news-dot ${lbl}`} /><span>{a.source || 'NewsAPI'}</span><span>·</span><span>{a.label || 'Neutral'}</span></div>
                </div>
              );
            })}
            {(!sentData.articles || sentData.articles.length === 0) && (
              <p style={{ fontSize: '0.88rem', color: 'var(--text-sub)' }}>Sentiment data loading… check back in a moment.</p>
            )}
          </div>
        </div>
      )}
      {mktTab === 'sent' && !sentData && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="skeleton skeleton-card" style={{ height: 180 }} />
          <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)', marginTop: '0.75rem' }}>Loading sentiment analysis (FinBERT AI)…</p>
        </div>
      )}

      <hr className="divider" />

      {/* Futures health */}
      <div className="section-title">Futures Market Health</div>
      <div className="grid g2 mb-2">
        <div className="card">
          <div className="kpi-label mb-1">MCX Basis (Spot vs Futures)</div>
          {d ? <>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.25rem' }}>
              {d.mcx_basis != null ? (d.mcx_basis >= 0 ? '+' : '') + d.mcx_basis?.toFixed(2) + ' ₹/gm' : 'Contango'}
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              {d.mcx_basis != null && d.mcx_basis > 0 ? 'Contango — futures are priced higher than spot. Normal market.' : 'Backwardation — futures priced below spot. Unusual condition.'}
            </p>
          </> : <div className="skeleton skeleton-card" />}
        </div>
        <div className="card">
          <div className="kpi-label mb-1">Johansen Cointegration Test</div>
          {d ? (
            <AlertBox type={d.johansen_cointegrated !== false ? 'success' : 'warning'}>
              {d.johansen_cointegrated !== false ? 'MCX futures closely track spot gold. Reliable hedging instrument.' : 'Caution — some divergence between MCX and spot. Hedge cautiously.'}
            </AlertBox>
          ) : <div className="skeleton skeleton-card" />}
        </div>
      </div>

      <hr className="divider" />

      {/* Macro factors */}
      <div className="section-title">Economic Factors Driving Gold Prices</div>
      <div className="kpi-grid cols-4 mb-2">
        {macData ? driverKeys.map(k => {
          const val = macData[k], chg = macData[k + '_7d_change'];
          if (val == null) return <KpiCard key={k} label={driverLabels[k]} value="–" />;
          return <KpiCard key={k} label={driverLabels[k]} value={fmt(val, 2)} delta={(chg >= 0 ? '+' : '') + chg?.toFixed(2) + '% (7d)'} deltaClass={chg > 0.5 ? 'up' : chg < -0.5 ? 'down' : 'neutral'} />;
        }) : [0,1,2,3].map(i => <div key={i} className="kpi-card"><div className="skeleton skeleton-kpi" /></div>)}
      </div>
      <div className="card mb-2" style={{ padding: '0.5rem' }}><div id="chart-macro-contrib-mkt" style={{ height: 260 }} /></div>
      {d && macData && (
        <AlertBox type={d.regression_signal === 'BULLISH' ? 'warning' : d.regression_signal === 'BEARISH' ? 'error' : 'info'} className="mb-2">
          Based on macroeconomic indicators, gold prices may <strong>{d.regression_signal === 'BULLISH' ? 'rise' : d.regression_signal === 'BEARISH' ? 'fall' : 'remain stable'}</strong> in the short term.
        </AlertBox>
      )}

      <hr className="divider" />

      {/* Other metals */}
      <div className="section-title">Other Metals Today</div>
      <div className="kpi-grid cols-3 mb-2">
        {macData ? <>
          <KpiCard label="Silver (USD/oz)" value={macData.silver_usd != null ? `$${fmt(macData.silver_usd, 2)}` : '–'} />
          <KpiCard label="Platinum (USD/oz)" value={macData.platinum != null ? `$${fmt(macData.platinum, 0)}` : '–'} />
          <KpiCard label="Palladium (USD/oz)" value={macData.palladium != null ? `$${fmt(macData.palladium, 0)}` : '–'} />
        </> : [0,1,2].map(i => <div key={i} className="kpi-card"><div className="skeleton skeleton-kpi" /></div>)}
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>Gold often moves in correlation with other precious metals. Sharp moves in silver or platinum can signal upcoming gold price changes.</p>

      <hr className="divider" />
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--text-sub)', paddingTop: '0.5rem' }}>
        <span>Market data sourced from global commodity exchanges via yfinance. 15-minute delay.</span>
        <span>Last updated: {timestamp}</span>
      </div>
    </div>
  );
}
