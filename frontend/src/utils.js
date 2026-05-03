// ── Number formatting (Indian system) ───────────────────────────────────
export const fmt = (n, d = 0) =>
  n == null ? '–' : new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

export const fmtRs = (n, d = 0) => n == null ? '–' : '₹' + fmt(n, d);

export const fmtPct = (n, d = 2) => n == null ? '–' : (n >= 0 ? '+' : '') + n.toFixed(d) + '%';

// ── Weight ───────────────────────────────────────────────────────────────
export const fmtGm = (n, d = 0) => n == null ? '–' : fmt(n, d) + ' gm';

// ── Date formatting (DD-MM-YYYY, IST) ───────────────────────────────────
export const fmtDate = (d) => {
  if (!d) return '–';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' }).replace(/\//g, '-');
};

export const fmtDateTime = (d) => {
  if (!d) return '–';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) + ' IST';
};

export const nowIST = () => fmtDateTime(new Date());

// ── Plotly common theme ──────────────────────────────────────────────────
export const plotlyLayout = (height = 300, opts = {}) => ({
  height,
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'Inter, sans-serif', size: 12, color: '#6b7280' },
  margin: { l: 52, r: 16, t: 16, b: 48 },
  xaxis: {
    gridcolor: '#e5e7eb', gridwidth: 0.5, linecolor: '#e5e7eb',
    tickfont: { size: 11 }, title: { font: { size: 11 } }, ...opts.xaxis,
  },
  yaxis: {
    gridcolor: '#e5e7eb', gridwidth: 0.5, linecolor: '#e5e7eb',
    tickfont: { size: 11 }, title: { font: { size: 11 } }, ...opts.yaxis,
  },
  legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: -0.22, font: { size: 11 } },
  hoverlabel: { bgcolor: '#1a1f2e', bordercolor: '#1a1f2e', font: { family: 'Inter', size: 12, color: '#fff' } },
  hovermode: 'x unified',
  ...opts,
});

export const plotlyConfig = { displayModeBar: false, responsive: true };

// ── Gold gradient (for Plotly fills) ────────────────────────────────────
export const goldGradientFill = [
  [0, 'rgba(212,160,23,0.25)'],
  [1, 'rgba(212,160,23,0)'],
];

// ── Misc helpers ─────────────────────────────────────────────────────────
export const stdDev = (arr) => {
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
};
export const riskArrow = (r) => r === 'HIGH' ? 'High' : r === 'LOW' ? 'Low' : 'Medium';
export const moodLabel = (s) => s === 'BULLISH' ? 'Positive' : s === 'BEARISH' ? 'Negative' : 'Neutral';
export const dirLabel = (d) => d === 'UP' ? 'Rising' : d === 'DOWN' ? 'Falling' : 'Stable';
export const dirSub = () => 'Next 14 days';
