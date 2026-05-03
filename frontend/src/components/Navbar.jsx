import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart2, Shield, ClipboardList, TrendingUp } from 'lucide-react';
import { useApp } from '../state.jsx';
import { fmtRs, fmtPct } from '../utils.js';

const navItems = [
  { to: '/', label: 'Dashboard', icon: BarChart2 },
  { to: '/hedge', label: 'Hedge Advisor', icon: Shield },
  { to: '/orders', label: 'Orders', icon: ClipboardList },
  { to: '/markets', label: 'Markets', icon: TrendingUp },
];

export default function Navbar() {
  const { livePrice, dashData } = useApp();
  const [timeIST, setTimeIST] = useState('');

  useEffect(() => {
    const tick = () => {
      setTimeIST(new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
      }) + ' IST');
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, []);

  const pct = dashData?.gold_change_pct;

  return (
    <nav className="navbar">
      <NavLink to="/" className="nav-brand">
        <svg width="28" height="28" viewBox="0 0 100 100" fill="none">
          <rect width="100" height="100" rx="18" fill="#D4A017"/>
          <path d="M50 12 L82 28 L82 56 Q82 78 50 92 Q18 78 18 56 L18 28 Z" fill="white" opacity="0.92"/>
          <path d="M50 22 L74 35 L74 56 Q74 72 50 82 Q26 72 26 56 L26 35 Z" fill="#D4A017"/>
        </svg>
        <span className="nav-brand-name">Gold<span>Shield</span></span>
      </NavLink>

      <div className="nav-links">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
          >
            <Icon size={15} strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: 'auto' }}>
        {livePrice && (
          <a
            href="https://allindiabullion.com/gold-rate/maharashtra/mumbai"
            target="_blank"
            rel="noopener noreferrer"
            title="View live Mumbai gold rates on AllIndiaBullion.com ↗"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div className="nav-price-pill" style={{ cursor: 'pointer' }}>
              <span className="live-dot" />
              <span>{fmtRs(livePrice)}/gm</span>
              {pct != null && (
                <span style={{ fontSize: '0.78rem', color: pct >= 0 ? '#86EFAC' : '#FCA5A5' }}>
                  {fmtPct(pct)}
                </span>
              )}
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: '0.5rem' }}>
                {timeIST}
              </span>
            </div>
          </a>
        )}
      </div>
    </nav>
  );
}
