import { fmtRs } from '../utils.js';

export default function DecisionCard({ decision, confidence, riskLevel, bullets = [], action }) {
  const key = (decision || '').toUpperCase();
  const cssClass = key.includes('HEDGE NOW') ? 'hedge-now' : key.includes('LOW RISK') ? 'low-risk' : 'monitor';
  const badgeText = key.includes('HEDGE NOW') ? 'Hedge Now' : key.includes('LOW RISK') ? 'Low Risk' : 'Monitor';
  const riskCls = (riskLevel || 'medium').toLowerCase();
  const lots = action?.lots_needed || 1;
  const margin = action?.margin_required || 0;
  const instr = action?.instrument || 'MCX Mini Gold';

  return (
    <div className={`decision-card ${cssClass}`}>
      <div style={{ marginBottom: '0.6rem' }}>
        <span className={`decision-badge ${cssClass}`}>{badgeText}</span>
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <span className="confidence-badge">Confidence: {confidence}%</span>
        <span className={`risk-badge ${riskCls}`}>Risk: {riskLevel}</span>
      </div>
      {bullets.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Why this recommendation</div>
          {bullets.map((b, i) => <div key={i} className="why-bullet">{b}</div>)}
        </div>
      )}
      {cssClass === 'low-risk' ? (
        <div className="action-box" style={{ background: 'linear-gradient(135deg,#052e16,#14532d)' }}>
          <h4>Recommended Action</h4>
          <div className="action-highlight">No immediate hedge required</div>
          <p style={{ fontSize: '0.85rem', color: '#D1D5DB' }}>Continue monitoring — re-check in 48 hours</p>
        </div>
      ) : (
        <div className="action-box">
          <h4>Recommended Action</h4>
          <div className="action-highlight">Buy {lots} lot{lots !== 1 ? 's' : ''} of {instr}</div>
          <p style={{ fontSize: '0.85rem', color: '#D1D5DB' }}>Estimated margin required: <strong>{fmtRs(margin)}</strong></p>
        </div>
      )}
    </div>
  );
}
