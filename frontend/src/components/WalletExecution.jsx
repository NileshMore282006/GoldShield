import { useState, useEffect } from 'react';
import { useApp } from '../state.jsx';
import { fmtRs } from '../utils.js';
import { apiFetch } from '../api.js';

const fmtIndian = (n) => {
  if (!n && n !== 0) return '₹0';
  return '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');
};

function getContractInfo() {
  const today = new Date();
  const d = today.getDate();
  let exp;
  if (d > 20) {
    exp = new Date(today.getFullYear(), today.getMonth() + 1, 28);
  } else {
    exp = new Date(today.getFullYear(), today.getMonth(), 28);
  }
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const label = `GOLDM${months[exp.getMonth()]}${exp.getFullYear()}`;
  const expStr = exp.toISOString().split('T')[0];
  const daysLeft = Math.max(0, Math.round((exp - new Date()) / 86400000));
  return { label, expStr, daysLeft };
}

export default function WalletExecution({ lots, margin, livePrice, orderId, expiry, onSuccess, hedgePositionId }) {
  const { walletBalance, freeBalance, lockedMargin, openPosition, showToast } = useApp();
  const [modal, setModal] = useState(false);
  const [success, setSuccess] = useState(hedgePositionId || null);
  const [loading, setLoading] = useState(false);
  const contract = getContractInfo();
  const marginNeeded = margin || (lots * 100 * livePrice * 0.30);
  const hasFunds = freeBalance >= marginNeeded;

  useEffect(() => { if (hedgePositionId) setSuccess(hedgePositionId); }, [hedgePositionId]);

  async function execute() {
    setLoading(true);
    try {
      // Create position via backend (persists across sessions) AND frontend state
      const res = await apiFetch('/api/positions', {
        method: 'POST',
        body: JSON.stringify({
          order_id: orderId || 0,
          lots: lots,
          entry_price: livePrice,
          margin_locked: marginNeeded,
          contract_month: contract.label,
          expiry_date: contract.expStr,
          lot_size: 100,
        }),
      }, 15000);
      const posId = res?.position_id || `H${String(Date.now()).slice(-3)}`;
      // Also update frontend state for wallet balance
      openPosition({
        orderId: orderId || 0,
        lots,
        entryPrice: livePrice,
        marginLocked: marginNeeded,
        contractMonth: contract.label,
        expiryDate: contract.expStr,
      });
      setSuccess(posId);
      setModal(false);
      showToast(`✅ Position ${posId} opened — margin locked`, 'success');
      if (onSuccess) onSuccess(posId);
    } catch (e) {
      // Fallback to local-only if backend unavailable
      const pos = openPosition({
        orderId: orderId || 0,
        lots,
        entryPrice: livePrice,
        marginLocked: marginNeeded,
        contractMonth: contract.label,
        expiryDate: contract.expStr,
      });
      const posId = pos?.position_id || 'H001';
      setSuccess(posId);
      setModal(false);
      showToast(`✅ Position ${posId} opened`, 'success');
      if (onSuccess) onSuccess(posId);
    }
    setLoading(false);
  }

  if (success) {
    return (
      <div className="success-screen mb-2">
        <div className="success-icon">🛡️</div>
        <div className="success-title">Hedge Position Active</div>
        <div className="success-pos-id">{success}</div>
        <p style={{ fontSize: '0.88rem', color: '#166534', marginBottom: '0.5rem' }}>
          Contract: {contract.label} · {lots} lot{lots !== 1 ? 's' : ''} SELL · Margin locked: {fmtIndian(marginNeeded)}
        </p>
        <p style={{ fontSize: '0.78rem', color: '#15803D' }}>
          View full position details in Order Manager → Portfolio Dashboard
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Pre-execution check card */}
      <div className={`exec-check-card mb-2 ${!hasFunds ? 'insufficient' : ''}`}>
        <div className="exec-status-row">
          {hasFunds
            ? <><span style={{ fontSize: '1.2rem' }}>✅</span> Sufficient margin available</>
            : <><span style={{ fontSize: '1.2rem' }}>❌</span> Insufficient margin — deposit more</>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1.5rem', fontSize: '0.88rem' }}>
          {[
            ['Margin Required', fmtIndian(marginNeeded)],
            ['Free Wallet Balance', fmtIndian(freeBalance)],
            ['Execution Price', `${fmtRs(livePrice)}/gm`],
            ['Contract', contract.label],
            ['Lots', `${lots} lot${lots !== 1 ? 's' : ''}`],
            ['Direction', 'SELL'],
            ['Lot Size', '100 gm / lot'],
            ['Estimated Slippage', '±₹2–5/gm'],
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '0.3rem 0' }}>
              <span style={{ color: hasFunds ? '#166534' : '#991B1B', fontWeight: 500 }}>{l}</span>
              <span style={{ fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        className="btn btn-primary btn-full btn-lg mb-1"
        style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '-0.01em' }}
        disabled={!hasFunds}
        onClick={() => setModal(true)}
      >
        Confirm &amp; Execute Hedge →
      </button>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-sub)', textAlign: 'center', marginBottom: '1.5rem', lineHeight: 1.6 }}>
        This executes a simulated hedge using real MCX prices. Your margin is locked from your GoldShield wallet.
        This is <strong>not</strong> actual MCX trading.
      </p>

      {/* Confirmation modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            <div className="modal-title">Confirm Hedge Execution</div>
            <div className="modal-sub">Review all details before confirming. This will lock margin from your wallet.</div>
            {[
              ['Instrument', 'MCX Mini Gold (Simulated)'],
              ['Contract', contract.label],
              ['Direction', 'SELL'],
              ['Lots', `${lots} lot${lots !== 1 ? 's' : ''} (${lots * 100}g)`],
              ['Entry Price', `${fmtRs(livePrice)}/gm`],
              ['Margin to Lock', fmtIndian(marginNeeded)],
              ['Your Free Balance', fmtIndian(freeBalance)],
              ['Balance After Lock', fmtIndian(freeBalance - marginNeeded)],
              ['Expiry', contract.expStr],
            ].map(([l, v]) => (
              <div className="modal-row" key={l}>
                <span className="modal-row-label">{l}</span>
                <span className="modal-row-value">{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button className="btn btn-ghost btn-full" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-full btn-lg" onClick={execute} disabled={loading}>
                {loading ? 'Opening position…' : '✅ Confirm & Execute'}
              </button>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-sub)', textAlign: 'center', marginTop: '1rem', lineHeight: 1.55 }}>
              🔒 Simulated hedge position · Not actual MCX trading · Margin locked from GoldShield wallet
            </p>
          </div>
        </div>
      )}
    </>
  );
}
