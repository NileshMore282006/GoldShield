import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api.js';
import { useApp } from '../state.jsx';
import { fmt, fmtRs, fmtPct } from '../utils.js';
import KpiCard from '../components/KpiCard.jsx';
import AlertBox from '../components/AlertBox.jsx';
import WalletExecution from '../components/WalletExecution.jsx';

const fmtIndian = (n) => '₹' + Math.abs(Math.round(n||0)).toLocaleString('en-IN');
const txnIcons = { deposit:'🟢', withdrawal:'🔴', margin_lock:'🔒', margin_release:'🔓', mtm_debit:'📊', mtm_credit:'📊', position_open:'⚙️', position_close:'⚙️' };

const cleanLayout = (h) => ({
  height: h, margin: { l: 40, r: 20, t: 20, b: 40 },
  paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'Inter, sans-serif', size: 12, color: '#6B7280' },
  xaxis: { showgrid: true, gridcolor: '#F3F4F6', zeroline: false },
  yaxis: { showgrid: true, gridcolor: '#F3F4F6', zeroline: false },
  showlegend: false,
});

function classifyRisk(order, liveP) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysLeft = Math.max(0, Math.round((new Date(order.delivery_date) - today) / 86400000));
  const pctDiff = ((liveP - order.booked_price) / order.booked_price) * 100;
  const pnl = (order.booked_price - liveP) * order.quantity;
  const absLoss = Math.abs(Math.min(pnl, 0));
  let score = 0;
  if (pctDiff > 5) score += 3; else if (pctDiff > 2) score += 2; else if (pctDiff > 0.5) score += 1;
  if (daysLeft < 30) score += 3; else if (daysLeft < 90) score += 2; else if (daysLeft < 180) score += 1;
  if (absLoss > 100000) score += 2; else if (absLoss > 10000) score += 1;
  return score >= 5 ? 'HIGH' : score >= 2 ? 'MEDIUM' : 'LOW';
}

export default function Orders() {
  const navigate = useNavigate();
  const { livePrice, orders, addOrder, updateOrder, deleteOrder,
    walletBalance, deposit, withdraw, transactions, addTransaction,
    positions, openPosition, closePosition, updatePositionMTM, rolloverPosition,
    lockedMargin, freeBalance, todayMtm,
    bankAccounts, linkBankAccount, verifyBankAccount, removeBankAccount,
    showToast } = useApp();
  const liveP = livePrice || 9500;
  const [activeTab, setActiveTab] = useState('portfolio');
  const [analyticsTab, setAnalyticsTab] = useState('pv');
  const [chartTab, setChartTab] = useState('breakdown');
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [hedgeFilter, setHedgeFilter] = useState('');
  const [sortBy, setSortBy] = useState('pnl');
  const [addOpen, setAddOpen] = useState(false);
  const [metrics, setMetrics] = useState(null);
  // Wallet state
  const [depAmt, setDepAmt] = useState(50000);
  const [depUpi, setDepUpi] = useState('');
  const [depTab, setDepTab] = useState('upi');
  const [witAmt, setWitAmt] = useState(10000);
  const [witBank, setWitBank] = useState('');
  const [witNote, setWitNote] = useState('');
  const [vaDetails, setVaDetails] = useState(null);
  const [bankForm, setBankForm] = useState({ holder:'', account:'', confirm:'', ifsc:'', bank:'', type:'Savings' });
  const [bankVerifying, setBankVerifying] = useState(false);
  const [txnTypeFilter, setTxnTypeFilter] = useState('');
  const [txnSearch, setTxnSearch] = useState('');
  // Execution modal
  const [execOrder, setExecOrder] = useState(null);
  const [viewPos, setViewPos] = useState(null);
  // MTM statement
  const [mtmStatement, setMtmStatement] = useState({ rows: [], total_pnl: 0 });

  // Add order form
  const [oForm, setOForm] = useState({ customer: '', phone: '', type: 'Necklace', quantity: 100, price: Math.round(liveP), date: '', advance: 0, notes: '' });

  useEffect(() => {
    const d = new Date(); d.setDate(d.getDate() + 90);
    setOForm(f => ({ ...f, date: d.toISOString().split('T')[0], price: Math.round(liveP) }));
  }, [liveP]);

  const active = orders.filter(o => o.status === 'Active');

  useEffect(() => {
    const fetchMetrics = async () => {
      const res = await apiFetch('/api/portfolio-metrics', { method: 'POST', body: JSON.stringify({ orders, wallet_balance: walletBalance, live_price: liveP }) });
      if (res) setMetrics(res);
    };
    fetchMetrics();
  }, [orders, walletBalance, liveP]);

  useEffect(() => {
    if (!window.Plotly) return;
    renderCharts();
  }, [active, metrics, analyticsTab, chartTab]);

  function renderCharts() {
    const today = new Date(); today.setHours(0,0,0,0);
    const portVal = active.reduce((s, o) => s + o.quantity * liveP, 0);
    if (analyticsTab === 'pv') {
      const sparkDates = [], sparkVals = [];
      for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); sparkDates.push(d.toLocaleDateString('en', { day: 'numeric', month: 'short' })); sparkVals.push(portVal * (0.97 + Math.random() * 0.06)); }
      sparkVals[sparkVals.length - 1] = portVal;
      if (document.getElementById('chart-portfolio-val')) window.Plotly.newPlot('chart-portfolio-val', [{ x: sparkDates, y: sparkVals, mode: 'lines+markers', line: { color: '#C9A84C', width: 2 }, marker: { size: 5 }, fill: 'tozeroy', fillcolor: 'rgba(201,168,76,0.08)' }], { ...cleanLayout(300), showlegend: false }, { responsive: true, displayModeBar: false });
    }
    if (chartTab === 'breakdown' && document.getElementById('chart-orders-breakdown')) {
      const risk = active.reduce((m, o) => { const r = classifyRisk(o, liveP); m[r] = (m[r] || 0) + 1; return m; }, {});
      window.Plotly.newPlot('chart-orders-breakdown', [{ labels: Object.keys(risk), values: Object.values(risk), type: 'pie', marker: { colors: ['#DC2626', '#D97706', '#16A34A'] }, hole: 0.4 }], { ...cleanLayout(260), showlegend: true }, { responsive: true, displayModeBar: false });
    }
    if (chartTab === 'hedged' && document.getElementById('chart-orders-hedged')) {
      const h = active.filter(o => o.hedged).length, uh = active.filter(o => !o.hedged).length;
      window.Plotly.newPlot('chart-orders-hedged', [{ labels: ['Hedged', 'Unhedged'], values: [h, uh], type: 'pie', marker: { colors: ['#16A34A', '#D97706'] }, hole: 0.4 }], { ...cleanLayout(260), showlegend: true }, { responsive: true, displayModeBar: false });
    }
  }

  function submitOrder() {
    const { customer, phone, quantity, price, date } = oForm;
    if (!customer || !phone || !quantity || !price || !date) { showToast('Please fill all required fields.', 'error'); return; }
    addOrder({ customer, phone, jewellery_type: oForm.type, quantity: parseFloat(quantity), booked_price: parseFloat(price), delivery_date: date, advance: parseFloat(oForm.advance) || 0, notes: oForm.notes, hedged: false, status: 'Active' });
    showToast(`Order added for ${customer}`, 'success');
    setAddOpen(false);
  }

  function executeHedgeForOrder(order) {
    const lots = Math.max(1, Math.round(order.quantity / 100));
    const marginNeeded = order.quantity * liveP * 0.30;
    if (freeBalance < marginNeeded) { showToast('Insufficient wallet balance. Please deposit more.', 'error'); return; }
    const pos = openPosition({ orderId: order.id, lots, entryPrice: liveP, marginLocked: marginNeeded, contractMonth: '', expiryDate: '' });
    updateOrder(order.id, { hedged: true, position_id: pos.position_id });
    showToast(`✅ Position ${pos.position_id} opened for order #${order.id}`, 'success');
  }

  function closeHedgeForOrder(order) {
    const pos = positions.find(p => p.order_id === order.id && p.status === 'OPEN');
    if (!pos) { updateOrder(order.id, { hedged: false, position_id: null }); showToast('Hedge removed.', 'info'); return; }
    closePosition(pos.position_id, liveP);
    updateOrder(order.id, { hedged: false, position_id: null });
    showToast(`Position ${pos.position_id} closed. P&L settled.`, 'info');
  }

  function autoHedge() {
    const highRisk = active.filter(o => classifyRisk(o, liveP) === 'HIGH' && !o.hedged);
    highRisk.forEach(o => executeHedgeForOrder(o));
    showToast(`${highRisk.length} HIGH risk order(s) auto-hedged.`, 'success');
  }

  async function verifyBank() {
    if (!bankForm.holder || !bankForm.account || !bankForm.ifsc) { showToast('Fill all bank fields', 'error'); return; }
    if (bankForm.account !== bankForm.confirm) { showToast('Account numbers do not match', 'error'); return; }
    setBankVerifying(true);
    try {
      const res = await apiFetch('/api/wallet/verify-bank', { method:'POST', body: JSON.stringify({ account_number: bankForm.account, ifsc: bankForm.ifsc, account_holder: bankForm.holder }) }, 10000);
      if (res?.verified) {
        linkBankAccount({ holder: bankForm.holder, account: bankForm.account, ifsc: bankForm.ifsc, bank: res.bank_name || bankForm.bank, type: bankForm.type });
        setBankForm({ holder:'', account:'', confirm:'', ifsc:'', bank:'', type:'Savings' });
        showToast('Bank account verified & linked ✅', 'success');
      }
    } catch(e) { showToast('Verification failed. Try again.', 'error'); }
    setBankVerifying(false);
  }

  async function handleDeposit() {
    if (depAmt < 100) { showToast('Minimum deposit is ₹100', 'error'); return; }
    if (depTab === 'upi') {
      const res = await apiFetch('/api/wallet/initiate-deposit', { method:'POST', body: JSON.stringify({ amount: depAmt, upi_id: depUpi, mode:'UPI' }) }, 10000);
      if (res) showToast(`Payment link generated! Ref: ${res.reference_id}`, 'success');
    }
    // Also credit wallet directly for demo
    deposit(depAmt, depTab === 'upi' ? 'UPI' : 'NEFT', 'Manual deposit');
    showToast(`₹${depAmt.toLocaleString('en-IN')} added to wallet`, 'success');
  }

  async function handleWithdraw() {
    if (witAmt < 1000) { showToast('Minimum withdrawal ₹1,000', 'error'); return; }
    if (witAmt > freeBalance) { showToast('Cannot withdraw more than free balance', 'error'); return; }
    const ok = withdraw(witAmt, 'NEFT', witNote);
    if (ok) {
      await apiFetch('/api/wallet/withdraw', { method:'POST', body: JSON.stringify({ amount: witAmt, bank_account_id: witBank, note: witNote }) }, 10000);
      showToast(`₹${witAmt.toLocaleString('en-IN')} withdrawal initiated`, 'success');
    }
  }

  useEffect(() => {
    apiFetch('/api/wallet/virtual-account', {}, 10000).then(d => { if(d) setVaDetails(d); });
    apiFetch('/api/positions/mtm-statement', {}, 10000).then(d => { if(d) setMtmStatement(d); });
  }, []);


  const totalQty = active.reduce((s, o) => s + o.quantity, 0);
  const portVal = totalQty * liveP;
  const totalExposure = active.reduce((s, o) => s + o.quantity * o.booked_price, 0);
  const upnl = portVal - totalExposure;
  const upnlPct = totalExposure > 0 ? (upnl / totalExposure) * 100 : 0;
  const hedgedCount = active.filter(o => o.hedged).length;
  const hedgeRatio = active.length > 0 ? (hedgedCount / active.length) * 100 : 0;
  const highRisk = active.filter(o => classifyRisk(o, liveP) === 'HIGH');
  const medRisk = active.filter(o => classifyRisk(o, liveP) === 'MEDIUM');

  const filtered = active
    .filter(o => !search || o.customer?.toLowerCase().includes(search.toLowerCase()) || String(o.id).includes(search))
    .filter(o => !riskFilter || classifyRisk(o, liveP) === riskFilter)
    .filter(o => !hedgeFilter || (hedgeFilter === 'hedged' ? o.hedged : !o.hedged))
    .sort((a, b) => {
      if (sortBy === 'pnl') return ((b.booked_price - liveP) * b.quantity) - ((a.booked_price - liveP) * a.quantity);
      if (sortBy === 'days') { const today = new Date(); return Math.round((new Date(a.delivery_date) - today) / 86400000) - Math.round((new Date(b.delivery_date) - today) / 86400000); }
      if (sortBy === 'exposure') return b.quantity * b.booked_price - a.quantity * a.booked_price;
      return a.id - b.id;
    });

  return (
    <div className="page-wrap">
      <div className="page-header">
        <h1>Order Manager</h1>
        <p>Track all customer gold orders, monitor your portfolio and get AI-powered risk insights.</p>
      </div>
      <hr className="divider" />

      <div className="tabs">
        <button className={`tab-btn${activeTab === 'portfolio' ? ' active' : ''}`} onClick={() => setActiveTab('portfolio')}>Portfolio Dashboard</button>
        <button className={`tab-btn${activeTab === 'orders' ? ' active' : ''}`} onClick={() => setActiveTab('orders')}>My Orders</button>
      </div>

      {/* Portfolio Tab */}
      {activeTab === 'portfolio' && (
        <div>
          {highRisk.length > 0 && <AlertBox type="error" className="mb-1">{highRisk.length} HIGH risk order(s) need immediate attention: {highRisk.map(o => o.customer).join(', ')}</AlertBox>}
          {medRisk.length > 0 && <AlertBox type="warning" className="mb-1">{medRisk.length} MEDIUM risk order(s): {medRisk.map(o => o.customer).join(', ')}</AlertBox>}
          {highRisk.length === 0 && medRisk.length === 0 && <AlertBox type="success" className="mb-1">No urgent alerts. Portfolio is in healthy condition.</AlertBox>}

          <div className="section-title">Portfolio Overview</div>
          <div className="kpi-grid cols-3 mb-1">
            <KpiCard label="Portfolio Value" value={fmtRs(portVal)} delta={upnl >= 0 ? `+${fmtRs(upnl)} unrealised` : `${fmtRs(upnl)} unrealised`} deltaClass={upnl >= 0 ? 'up' : 'down'} />
            <KpiCard label="Unrealised P&L" value={`${upnl >= 0 ? '+' : ''}${fmtRs(upnl)}`} delta={fmtPct(upnlPct)} deltaClass={upnl >= 0 ? 'up' : 'down'} />
            <KpiCard label="Hedged Ratio" value={`${hedgeRatio.toFixed(1)}%`} delta={hedgeRatio >= 50 ? 'Good coverage' : 'Low coverage'} deltaClass={hedgeRatio >= 50 ? 'up' : 'down'} />
          </div>
          <div className="kpi-grid cols-3 mb-2">
            <KpiCard label="Gold Holdings" value={`${fmt(totalQty, 0)} gm`} />
            <KpiCard label="Cash Balance" value={fmtRs(walletBalance)} sub={`Margin locked: ${fmtRs(portVal * 0.30)}`} />
            <KpiCard label="Active Orders" value={active.length} />
          </div>

          <div className="tabs mt-2">
            <button className={`tab-btn${analyticsTab === 'pv' ? ' active' : ''}`} onClick={() => setAnalyticsTab('pv')}>Portfolio Value</button>
            <button className={`tab-btn${analyticsTab === 'dpnl' ? ' active' : ''}`} onClick={() => setAnalyticsTab('dpnl')}>Daily P&L</button>
          </div>
          {analyticsTab === 'pv' && <div className="card" style={{ padding: '0.5rem' }}><div id="chart-portfolio-val" style={{ height: 300 }} /></div>}
          {analyticsTab === 'dpnl' && <div className="card" style={{ padding: '0.5rem' }}><div id="chart-daily-pnl" style={{ height: 260 }} /></div>}

          <hr className="divider" />

          {/* ── OPEN POSITIONS PANEL ── */}
          <div className="section-title">🛡️ Open Positions Panel</div>
          {positions.filter(p => p.status === 'OPEN').length === 0 ? (
            <div className="empty-state mb-2">
              <h3>No active hedge positions</h3>
              <p>Go to My Orders tab and click ⚡ Execute to open a simulated hedge position.</p>
            </div>
          ) : positions.filter(p => p.status === 'OPEN').map(pos => {
            const mtm = (pos.entry_price - liveP) * pos.lots * pos.lot_size;
            const expDays = Math.max(0, Math.round((new Date(pos.expiry_date) - new Date()) / 86400000));
            return (
              <div className="position-card mb-2" key={pos.position_id}>
                <div className="position-card-header">
                  <div>
                    <span className="position-id">Position {pos.position_id}</span>
                    <span className="simulated-badge" style={{ marginLeft: 8 }}>🔒 Simulated</span>
                  </div>
                  <div className="position-status active"><div className="position-status-dot" />ACTIVE</div>
                </div>
                <div className="position-grid">
                  {[['Contract', pos.contract_month || '—'], ['Direction', pos.direction], ['Lots', `${pos.lots} × ${pos.lot_size}g`],
                    ['Entry Price', fmtIndian(pos.entry_price)+'/gm'], ['Current Price', fmtIndian(liveP)+'/gm'],
                    ['MTM P&L', <span className={mtm >= 0 ? 'mtm-positive' : 'mtm-negative'}>{mtm >= 0 ? '+' : ''}{fmtIndian(mtm)}</span>],
                    ['Margin Locked', fmtIndian(pos.margin_locked)], ['Expiry', `${expDays} days`], ['Linked Order', pos.order_id ? `#${pos.order_id}` : '—']
                  ].map(([l,v]) => (
                    <div className="position-field" key={l}><div className="position-field-label">{l}</div><div className="position-field-value">{v}</div></div>
                  ))}
                </div>
                <div className="position-actions">
                  <button className="btn btn-ghost" onClick={() => { rolloverPosition(pos.position_id,'','',liveP,liveP); showToast('Position rolled over','success'); }}>🔄 Roll Over</button>
                  <button className="btn btn-danger" onClick={() => { closePosition(pos.position_id, liveP); const o = active.find(x => x.id === pos.order_id); if(o) updateOrder(o.id,{hedged:false,position_id:null}); showToast(`Position ${pos.position_id} closed`,'info'); }}>Close Position</button>
                </div>
              </div>
            );
          })}

          {/* ── RISK & EXPOSURE ── */}
          <div className="kpi-grid cols-4 mb-2">
            <KpiCard label="Open Positions" value={positions.filter(p=>p.status==='OPEN').length} />
            <KpiCard label="Margin Locked" value={fmtIndian(lockedMargin)} />
            <KpiCard label="Free Margin" value={fmtIndian(freeBalance)} deltaClass="up" />
            <KpiCard label="MTM Today" value={fmtIndian(todayMtm)} deltaClass={todayMtm >= 0 ? 'up' : 'down'} />
          </div>

          {/* ── DAILY MTM STATEMENT ── */}
          <hr className="divider" />
          <div className="section-title">📊 Daily MTM Statement</div>
          {mtmStatement.rows.length === 0 ? (
            <div className="empty-state mb-2"><p>No MTM history yet. Execute a hedge to start tracking.</p></div>
          ) : (
            <div className="table-wrap mb-2">
              <table>
                <thead><tr><th>Date</th><th>Position ID</th><th>MCX Price</th><th>Daily MTM</th><th>Cumulative MTM</th><th>Status</th></tr></thead>
                <tbody>
                  {mtmStatement.rows.map((r,i) => (
                    <tr key={i} style={{ background: r.daily_mtm > 0 ? 'var(--green-bg)' : r.daily_mtm < 0 ? 'var(--red-bg)' : undefined }}>
                      <td>{r.date}</td><td>{r.position_id}</td><td>{fmtIndian(r.mcx_price)}</td>
                      <td className={r.daily_mtm >= 0 ? 'text-green' : 'text-red'}>{r.daily_mtm >= 0 ? '+' : ''}{fmtIndian(r.daily_mtm)}</td>
                      <td className={r.cumulative_mtm >= 0 ? 'text-green' : 'text-red'}>{fmtIndian(r.cumulative_mtm)}</td>
                      <td><span className={`badge ${r.status === 'OPEN' ? 'yes' : 'no'}`}>{r.status}</span></td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, background: '#F9FAFB' }}>
                    <td colSpan={3}>Total Hedge P&L</td>
                    <td className={mtmStatement.total_pnl >= 0 ? 'text-green' : 'text-red'} colSpan={3}>{mtmStatement.total_pnl >= 0 ? '+' : ''}{fmtIndian(mtmStatement.total_pnl)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* ── LIVE HEDGE EFFECTIVENESS ── */}
          <hr className="divider" />
          <div className="section-title">⚡ Live Hedge Effectiveness</div>
          {(() => {
            const origExp = totalExposure;
            const hedgePnl = mtmStatement.total_pnl || 0;
            const effectiveRate = totalQty > 0 ? (origExp - hedgePnl) / totalQty : 0;
            const saving = hedgePnl;
            const withoutHedge = origExp;
            const withHedge = origExp - hedgePnl;
            const savingPct = origExp > 0 ? (saving / origExp) * 100 : 0;
            return (
              <>
                <div className="kpi-grid cols-4 mb-2">
                  <KpiCard label="Original Exposure" value={fmtIndian(origExp)} />
                  <KpiCard label="Hedge P&L to Date" value={fmtIndian(hedgePnl)} deltaClass={hedgePnl >= 0 ? 'up' : 'down'} />
                  <KpiCard label="Net Effective Rate" value={totalQty > 0 ? fmtIndian(effectiveRate)+'/gm' : '—'} />
                  <KpiCard label="Total Saving" value={fmtIndian(saving)} deltaClass={saving >= 0 ? 'up' : 'down'} />
                </div>
                <div className="comparison-bar">
                  <div className="comparison-row"><span>Without hedge you would pay</span><span style={{ fontWeight: 700 }}>{fmtIndian(withoutHedge)}</span></div>
                  <div className="comparison-row"><span>With GoldShield hedge</span><span style={{ fontWeight: 700, color: 'var(--blue)' }}>{fmtIndian(withHedge)}</span></div>
                  <div className="comparison-row"><span className="comparison-saving">You saved: {fmtIndian(saving)} ({savingPct.toFixed(1)}%)</span></div>
                </div>
              </>
            );
          })()}

          {/* ── SMART WALLET ── */}
          <hr className="divider" />
          <div className="section-title">💳 Smart Wallet</div>

          {/* Balance Overview */}
          <div className="wallet-balance-card">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem' }}>
              {[['Total Balance', fmtIndian(walletBalance)], ['Locked as Margin', fmtIndian(lockedMargin)], ['MTM Adjustment', (todayMtm >= 0 ? '+' : '') + fmtIndian(todayMtm)], ['Free Balance', fmtIndian(freeBalance)]].map(([l,v]) => (
                <div key={l}><div className="wallet-balance-label">{l}</div><div className="wallet-balance-amount" style={{ fontSize: '1.3rem' }}>{v}</div></div>
              ))}
            </div>
          </div>

          {/* Bank Accounts */}
          <div className="wallet-section">
            <div className="wallet-section-title">🏦 Linked Bank Accounts</div>
            {bankAccounts.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>No bank accounts linked yet.</p>}
            {bankAccounts.map(b => (
              <div className={`bank-account-row ${b.verified ? 'verified' : ''}`} key={b.id}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{b.bank || 'Bank'} — {b.type} — XXXX{b.account?.slice(-4)}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>IFSC: {b.ifsc} · {b.holder}</div>
                  {b.verified && <span className="bank-verified-badge">✅ Verified</span>}
                </div>
                <button className="btn-xs btn-xs-danger" onClick={() => removeBankAccount(b.id)}>Remove</button>
              </div>
            ))}
            <div className="card" style={{ marginTop: '0.75rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.75rem' }}>Add Bank Account</div>
              <div className="grid g2 mb-1">
                <div className="form-group"><label className="form-label">Account Holder Name *</label><input className="form-control" placeholder="As per bank records" value={bankForm.holder} onChange={e => setBankForm(f=>({...f,holder:e.target.value}))} /></div>
                <div className="form-group"><label className="form-label">Account Type</label><select className="form-control" value={bankForm.type} onChange={e => setBankForm(f=>({...f,type:e.target.value}))}><option>Savings</option><option>Current</option></select></div>
              </div>
              <div className="grid g2 mb-1">
                <div className="form-group"><label className="form-label">Account Number *</label><input className="form-control" placeholder="Enter account number" value={bankForm.account} onChange={e => setBankForm(f=>({...f,account:e.target.value}))} /></div>
                <div className="form-group"><label className="form-label">Confirm Account Number *</label><input className="form-control" placeholder="Re-enter account number" value={bankForm.confirm} onChange={e => setBankForm(f=>({...f,confirm:e.target.value}))} /></div>
              </div>
              <div className="grid g2 mb-1">
                <div className="form-group"><label className="form-label">IFSC Code *</label><input className="form-control" placeholder="e.g. HDFC0001234" value={bankForm.ifsc} onChange={e => setBankForm(f=>({...f,ifsc:e.target.value}))} /></div>
                <div className="form-group"><label className="form-label">Bank Name</label><input className="form-control" placeholder="Auto-filled from IFSC" value={bankForm.bank} onChange={e => setBankForm(f=>({...f,bank:e.target.value}))} /></div>
              </div>
              <button className="btn btn-primary btn-full" onClick={verifyBank} disabled={bankVerifying}>{bankVerifying ? 'Verifying via penny drop…' : '🔒 Verify & Link Account'}</button>
            </div>
          </div>

          {/* Deposit */}
          <div className="wallet-section">
            <div className="wallet-section-title">⬇️ Deposit Funds</div>
            <div className="deposit-tab">
              <button className={`deposit-tab-btn ${depTab==='upi'?'active':''}`} onClick={()=>setDepTab('upi')}>UPI Payment</button>
              <button className={`deposit-tab-btn ${depTab==='neft'?'active':''}`} onClick={()=>{setDepTab('neft'); apiFetch('/api/wallet/virtual-account',{},5000).then(d=>d&&setVaDetails(d));}}>Bank Transfer (NEFT)</button>
            </div>
            <div className="card">
              <div className="form-group"><label className="form-label">Amount (₹)</label><input className="form-control" type="number" min="100" step="100" value={depAmt} onChange={e=>setDepAmt(parseFloat(e.target.value)||0)} /></div>
              {depTab === 'upi' ? (
                <>
                  <div className="form-group"><label className="form-label">UPI ID</label><input className="form-control" placeholder="e.g. jeweller@upi" value={depUpi} onChange={e=>setDepUpi(e.target.value)} /></div>
                  <div className="qr-placeholder"><div style={{fontSize:'2rem'}}>📱</div><div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>QR Code</div><div style={{fontSize:'0.68rem',color:'var(--text-sub)'}}>Integrate Razorpay</div></div>
                </>
              ) : (
                vaDetails && (
                  <div style={{ background: '#F9FAFB', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1rem', fontSize: '0.88rem' }}>
                    {[['Account Name', vaDetails.account_name], ['Account Number', vaDetails.account_number], ['IFSC', vaDetails.ifsc], ['Bank', vaDetails.bank_name]].map(([l,v]) => (
                      <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'0.3rem 0', borderBottom:'1px solid var(--border-light)' }}><span style={{color:'var(--text-muted)'}}>{l}</span><strong>{v}</strong></div>
                    ))}
                    <p style={{ fontSize:'0.75rem', color:'var(--text-sub)', marginTop:'0.5rem' }}>Transfers reflect within 30 minutes during banking hours.</p>
                  </div>
                )
              )}
              <button className="btn btn-primary btn-full" onClick={handleDeposit}>⬇️ Add ₹{(depAmt||0).toLocaleString('en-IN')} to Wallet</button>
            </div>
          </div>

          {/* Withdrawal */}
          <div className="wallet-section">
            <div className="wallet-section-title">⬆️ Withdraw Funds</div>
            <div className="card">
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Available to withdraw: <strong>{fmtIndian(freeBalance)}</strong></p>
              <div className="grid g2 mb-1">
                <div className="form-group"><label className="form-label">Amount (₹) · Min ₹1,000</label><input className="form-control" type="number" min="1000" step="500" value={witAmt} onChange={e=>setWitAmt(parseFloat(e.target.value)||0)} /></div>
                <div className="form-group"><label className="form-label">Bank Account</label>
                  <select className="form-control" value={witBank} onChange={e=>setWitBank(e.target.value)}>
                    <option value="">Select verified account</option>
                    {bankAccounts.filter(b=>b.verified).map(b => <option key={b.id} value={b.id}>{b.bank} — XXXX{b.account?.slice(-4)}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group"><label className="form-label">Note (optional)</label><input className="form-control" placeholder="Reason for withdrawal" value={witNote} onChange={e=>setWitNote(e.target.value)} /></div>
              <button className="btn btn-ghost btn-full" onClick={handleWithdraw} disabled={witAmt > freeBalance || witAmt < 1000}>⬆️ Withdraw Funds</button>
              <p style={{ fontSize:'0.75rem', color:'var(--text-sub)', marginTop:'0.5rem', textAlign:'center' }}>Processed via NEFT · 1–2 business days (Razorpay Payouts)</p>
            </div>
          </div>

          {/* Transaction History */}
          <div className="wallet-section">
            <div className="wallet-section-title">📋 Transaction History</div>
            <div style={{ display:'flex', gap:'0.75rem', marginBottom:'1rem', flexWrap:'wrap' }}>
              <select className="form-control" style={{width:'auto'}} value={txnTypeFilter} onChange={e=>setTxnTypeFilter(e.target.value)}>
                <option value="">All Types</option>
                {['deposit','withdrawal','margin_lock','margin_release','mtm_debit','mtm_credit','position_open','position_close'].map(t=><option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
              </select>
              <input className="form-control" style={{width:'auto',flex:1}} placeholder="Search by reference ID…" value={txnSearch} onChange={e=>setTxnSearch(e.target.value)} />
            </div>
            {(() => {
              const txns = [...transactions].reverse()
                .filter(t => !txnTypeFilter || t.type === txnTypeFilter)
                .filter(t => !txnSearch || (t.reference||'').toLowerCase().includes(txnSearch.toLowerCase()));
              const totalDep = transactions.filter(t=>t.type==='deposit').reduce((s,t)=>s+t.amount,0);
              const totalWit = transactions.filter(t=>t.type==='withdrawal').reduce((s,t)=>s+t.amount,0);
              const netPnl = transactions.filter(t=>t.type==='mtm_credit').reduce((s,t)=>s+t.amount,0) - transactions.filter(t=>t.type==='mtm_debit').reduce((s,t)=>s+t.amount,0);
              return (
                <>
                  <div style={{ display:'flex', gap:'1.5rem', fontSize:'0.82rem', color:'var(--text-muted)', marginBottom:'0.75rem', flexWrap:'wrap' }}>
                    <span>Total Deposited: <strong style={{color:'var(--green)'}}>{fmtIndian(totalDep)}</strong></span>
                    <span>Total Withdrawn: <strong style={{color:'var(--red)'}}>{fmtIndian(totalWit)}</strong></span>
                    <span>Net Hedge P&L: <strong style={{color: netPnl>=0?'var(--green)':'var(--red)'}}>{netPnl>=0?'+':''}{fmtIndian(netPnl)}</strong></span>
                  </div>
                  {txns.length === 0 ? <p style={{color:'var(--text-muted)',fontSize:'0.88rem'}}>No transactions yet.</p> : (
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Date & Time</th><th>Type</th><th>Amount</th><th>Mode</th><th>Reference</th><th>Status</th><th>Note</th></tr></thead>
                        <tbody>
                          {txns.slice(0,50).map((t,i) => (
                            <tr key={i} className={`txn-${t.type}`}>
                              <td style={{whiteSpace:'nowrap',fontSize:'0.8rem'}}>{t.datetime || t.date || '—'}</td>
                              <td><span style={{display:'flex',alignItems:'center',gap:4}}>{txnIcons[t.type]||'•'} {t.type?.replace(/_/g,' ')}</span></td>
                              <td style={{fontWeight:700, color: ['deposit','mtm_credit','margin_release'].includes(t.type)?'var(--green)':'var(--red)'}}>
                                {['deposit','mtm_credit','margin_release'].includes(t.type)?'+':'-'}{fmtIndian(t.amount)}
                              </td>
                              <td>{t.mode||'—'}</td>
                              <td style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>{t.reference||'—'}</td>
                              <td><span className={`badge ${t.status==='Completed'?'LOW':'MEDIUM'}`}>{t.status||'—'}</span></td>
                              <td style={{fontSize:'0.78rem',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis'}}>{t.note||'—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          <p style={{ fontSize:'0.72rem', color:'var(--text-sub)', textAlign:'center', padding:'1rem 0', lineHeight:1.6, borderTop:'1px solid var(--border-light)' }}>
            GoldShield wallet is a margin simulation account. Funds are held securely and used to simulate hedging outcomes against real MCX prices. This is not commodity trading.
          </p>

          <hr className="divider" />
          <div className="section-title">🔒 Hedge Control</div>
          <div className="grid g2">
            <button className="btn btn-primary btn-full" onClick={autoHedge}>Auto-Hedge HIGH Risk Orders</button>
            <AlertBox type="info">Executes simulated hedge positions for all HIGH risk unhedged orders using live MCX prices.</AlertBox>
          </div>
        </div>
      )}


      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <div>
          <div className="kpi-grid cols-5 mb-2">
            <KpiCard label="Total Orders" value={active.length} />
            <KpiCard label="Total Exposure" value={fmtRs(totalExposure)} />
            <KpiCard label="HIGH Risk" value={highRisk.length} deltaClass="down" />
            <KpiCard label="Hedged" value={hedgedCount} deltaClass="up" />
            <KpiCard label="Unrealised P&L" value={`${upnl >= 0 ? '+' : ''}${fmtRs(upnl)}`} deltaClass={upnl >= 0 ? 'up' : 'down'} />
          </div>

          <div className="card mb-2">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setAddOpen(o => !o)}>
              <span style={{ fontWeight: 700 }}>Add New Order</span>
              <span>{addOpen ? '▲' : '▼'}</span>
            </div>
            {addOpen && (
              <div style={{ marginTop: '1rem' }}>
                <div className="grid g3 mb-1">
                  <div className="form-group"><label className="form-label">Customer name *</label><input className="form-control" placeholder="e.g. Mehta Jewellers" value={oForm.customer} onChange={e => setOForm(f => ({...f, customer: e.target.value}))} /></div>
                  <div className="form-group"><label className="form-label">Phone *</label><input className="form-control" placeholder="98XXXXXXXX" maxLength={10} value={oForm.phone} onChange={e => setOForm(f => ({...f, phone: e.target.value}))} /></div>
                  <div className="form-group"><label className="form-label">Jewellery type</label><select className="form-control" value={oForm.type} onChange={e => setOForm(f => ({...f, type: e.target.value}))}><option>Necklace</option><option>Bangles</option><option>Ring</option><option>Earrings</option><option>Chain</option><option>Anklet</option><option>Other</option></select></div>
                </div>
                <div className="grid g3 mb-1">
                  <div className="form-group"><label className="form-label">Quantity (grams) *</label><input className="form-control" type="number" min="1" value={oForm.quantity} onChange={e => setOForm(f => ({...f, quantity: e.target.value}))} /></div>
                  <div className="form-group"><label className="form-label">Price booked (₹/gm) *</label><input className="form-control" type="number" min="1000" value={oForm.price} onChange={e => setOForm(f => ({...f, price: e.target.value}))} /></div>
                  <div className="form-group"><label className="form-label">Delivery date *</label><input className="form-control" type="date" value={oForm.date} onChange={e => setOForm(f => ({...f, date: e.target.value}))} /></div>
                </div>
                <div className="grid g2 mb-1">
                  <div className="form-group"><label className="form-label">Advance received (₹)</label><input className="form-control" type="number" min="0" value={oForm.advance} onChange={e => setOForm(f => ({...f, advance: e.target.value}))} /></div>
                  <div className="form-group"><label className="form-label">Notes (optional)</label><input className="form-control" placeholder="Any special instructions…" value={oForm.notes} onChange={e => setOForm(f => ({...f, notes: e.target.value}))} /></div>
                </div>
                <AlertBox type="info" className="mb-1">Order value: <strong>{fmtRs((parseFloat(oForm.quantity)||0) * (parseFloat(oForm.price)||0))}</strong></AlertBox>
                <button className="btn btn-primary btn-full btn-lg" onClick={submitOrder}>Add Order</button>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <input className="form-control" placeholder="Search by customer / order ID…" value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-control" value={riskFilter} onChange={e => setRiskFilter(e.target.value)}><option value="">All Risks</option><option value="HIGH">HIGH</option><option value="MEDIUM">MEDIUM</option><option value="LOW">LOW</option></select>
            <select className="form-control" value={hedgeFilter} onChange={e => setHedgeFilter(e.target.value)}><option value="">All Hedge Status</option><option value="hedged">Hedged</option><option value="unhedged">Unhedged</option></select>
            <select className="form-control" value={sortBy} onChange={e => setSortBy(e.target.value)}><option value="pnl">Sort: P&L</option><option value="days">Sort: Days left</option><option value="exposure">Sort: Exposure</option><option value="id">Sort: Order ID</option></select>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-sub)', marginBottom: '0.5rem' }}>Showing {filtered.length} of {active.length} active orders</p>

          <div className="table-wrap mb-2">
            <table>
              <thead><tr><th>Order ID</th><th>Customer</th><th>Qty (g)</th><th>Booked (₹/gm)</th><th>Live (₹/gm)</th><th>P&amp;L</th><th>Days Left</th><th>Risk</th><th>Hedged</th><th>Position</th><th>MTM P&amp;L</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={12} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No orders found. Add one above.</td></tr>
                ) : filtered.map(o => {
                  const risk = classifyRisk(o, liveP);
                  const pnl = (o.booked_price - liveP) * o.quantity;
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const days = Math.max(0, Math.round((new Date(o.delivery_date) - today) / 86400000));
                  const linkedPos = positions.find(p => p.order_id === o.id && p.status === 'OPEN');
                  const posId = o.position_id || linkedPos?.position_id;
                  const posExpDays = linkedPos ? Math.max(0, Math.round((new Date(linkedPos.expiry_date) - new Date()) / 86400000)) : null;
                  const needsRollover = posExpDays !== null && posExpDays <= 15;
                  const mtm = linkedPos?.current_mtm || 0;
                  return (
                    <tr key={o.id} className={`risk-${risk.toLowerCase()}`}>
                      <td style={{ fontWeight: 600 }}>#{o.id}</td>
                      <td>{o.customer}</td>
                      <td>{fmt(o.quantity, 0)}</td>
                      <td>{fmtRs(o.booked_price)}</td>
                      <td>{fmtRs(liveP)}</td>
                      <td className={pnl >= 0 ? 'text-green' : 'text-red'}>{pnl >= 0 ? '+' : ''}{fmtRs(pnl)}</td>
                      <td>{days}d</td>
                      <td><span className={`badge ${risk}`}>{risk}</span></td>
                      <td>{o.hedged ? <span className="badge yes">✅ Hedged</span> : <span className="badge no">No</span>}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {posId ? <><span style={{ fontWeight: 700, fontSize: '0.82rem' }}>#{posId}</span>{needsRollover && <span className="rollover-badge" style={{ marginLeft: 4, display: 'inline-flex' }} onClick={() => { rolloverPosition(posId, '', '', liveP, liveP); showToast('Position rolled over', 'success'); }}>🔄 {posExpDays}d [Roll]</span>}</> : <span style={{ color: 'var(--text-sub)' }}>—</span>}
                      </td>
                      <td><span className={mtm > 0 ? 'mtm-positive' : mtm < 0 ? 'mtm-negative' : 'mtm-zero'}>{mtm >= 0 ? '+' : ''}{fmtIndian(mtm)}</span></td>
                      <td>
                        <div className="order-actions">
                          {!o.hedged ? (
                            <>
                              <button className="btn-xs btn-xs-ghost" onClick={() => navigate(`/hedge?qty=${o.quantity}&price=${o.booked_price}&cust=${encodeURIComponent(o.customer)}`)}>💡 Advice</button>
                              <button className="btn-xs btn-xs-primary" onClick={() => setExecOrder(o)}>⚡ Execute</button>
                            </>
                          ) : (
                            <>
                              <button className="btn-xs btn-xs-green" onClick={() => setViewPos(linkedPos || null)}>📄 Position</button>
                              <button className="btn-xs btn-xs-danger" onClick={() => closeHedgeForOrder(o)}>❌ Close</button>
                            </>
                          )}
                          <button className="btn-xs btn-xs-ghost" onClick={() => { updateOrder(o.id, { status:'Delivered' }); showToast('Marked delivered','success'); }}>✓ Deliver</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>


          {/* Execution modal */}
          {execOrder && (
            <div className="modal-overlay" onClick={() => setExecOrder(null)}>
              <div className="modal-box" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={() => setExecOrder(null)}>✕</button>
                <div className="modal-title">Execute Hedge for Order #{execOrder.id}</div>
                <div className="modal-sub">{execOrder.customer} · {fmt(execOrder.quantity,0)}g</div>
                <WalletExecution
                  lots={Math.max(1, Math.round(execOrder.quantity/100))}
                  margin={execOrder.quantity * liveP * 0.30}
                  livePrice={liveP}
                  orderId={execOrder.id}
                  expiry={''}
                  onSuccess={(posId) => { updateOrder(execOrder.id,{ hedged:true, position_id:posId }); setExecOrder(null); }}
                  hedgePositionId={null}
                />
              </div>
            </div>
          )}

          {/* View position modal */}
          {viewPos && (
            <div className="modal-overlay" onClick={() => setViewPos(null)}>
              <div className="modal-box" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={() => setViewPos(null)}>✕</button>
                <div className="modal-title">Position {viewPos.position_id}</div>
                <div className="modal-sub"><span className="simulated-badge">🔒 Simulated</span></div>
                {[['Contract', viewPos.contract_month],['Direction', viewPos.direction],['Lots', `${viewPos.lots} × ${viewPos.lot_size}g`],['Entry Price', fmtIndian(viewPos.entry_price)+'/gm'],['Current MTM', fmtIndian(viewPos.current_mtm)],['Margin Locked', fmtIndian(viewPos.margin_locked)],['Expiry', viewPos.expiry_date]].map(([l,v]) => (
                  <div className="modal-row" key={l}><span className="modal-row-label">{l}</span><span className="modal-row-value">{v}</span></div>
                ))}
                <button className="btn btn-ghost btn-full mt-2" onClick={() => setViewPos(null)}>Close</button>
              </div>
            </div>
          )}

          <div className="section-title">Portfolio Charts</div>
          <div className="tabs">
            <button className={`tab-btn${chartTab === 'breakdown' ? ' active' : ''}`} onClick={() => setChartTab('breakdown')}>Order Breakdown</button>
            <button className={`tab-btn${chartTab === 'hedged' ? ' active' : ''}`} onClick={() => setChartTab('hedged')}>Hedged vs Unhedged</button>
          </div>
          {chartTab === 'breakdown' && <div className="card" style={{ padding: '0.5rem' }}><div id="chart-orders-breakdown" style={{ height: 260 }} /></div>}
          {chartTab === 'hedged' && <div className="card" style={{ padding: '0.5rem' }}><div id="chart-orders-hedged" style={{ height: 260 }} /></div>}
        </div>
      )}

      <hr className="divider" />
      <p style={{ fontSize: '0.78rem', color: 'var(--text-sub)' }}>Order data stored in session. Live gold price: {fmtRs(liveP, 2)}/gm</p>
    </div>
  );
}
