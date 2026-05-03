import { useEffect, useRef } from 'react';

export default function KpiCard({ label, value, delta, deltaClass = 'neutral', sub, loading = false, href }) {
  const valRef = useRef(null);
  const prevVal = useRef(value);

  // Flash gold on value change
  useEffect(() => {
    if (value !== prevVal.current && valRef.current) {
      valRef.current.classList.remove('value-flash');
      void valRef.current.offsetWidth; // force reflow
      valRef.current.classList.add('value-flash');
      prevVal.current = value;
    }
  }, [value]);

  if (loading) {
    return (
      <div className="kpi-card">
        <div className="skeleton skeleton-text short" style={{ marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 32, width: '70%', borderRadius: 6 }} />
        <div className="skeleton skeleton-text short" style={{ marginTop: 8, width: '45%' }} />
      </div>
    );
  }

  const inner = (
    <div className="kpi-card" style={href ? { cursor: 'pointer', transition: 'box-shadow 0.18s' } : undefined}
      onMouseEnter={href ? e => e.currentTarget.style.boxShadow = '0 4px 18px rgba(212,160,23,0.22)' : undefined}
      onMouseLeave={href ? e => e.currentTarget.style.boxShadow = '' : undefined}
    >
      <div className="kpi-label">
        {label}
        {href && <span style={{ marginLeft: '0.3rem', fontSize: '0.7rem', color: 'var(--gold)', opacity: 0.75 }}>↗</span>}
      </div>
      <div className="kpi-value" ref={valRef}>{value ?? '–'}</div>
      {delta && <div className={`kpi-delta ${deltaClass}`}>{delta}</div>}
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        {inner}
      </a>
    );
  }
  return inner;
}
