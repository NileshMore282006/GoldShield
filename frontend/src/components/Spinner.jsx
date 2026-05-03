import { useApp } from '../state.jsx';

export default function Spinner() {
  return (
    <div className="spinner-overlay" id="spinner">
      <div className="spinner" />
      <div className="spinner-text" id="spinner-text">Loading…</div>
    </div>
  );
}

export function showSpinner(text = 'Loading…') {
  const el = document.getElementById('spinner');
  const t = document.getElementById('spinner-text');
  if (el) el.classList.add('visible');
  if (t) t.textContent = text;
}
export function hideSpinner() {
  const el = document.getElementById('spinner');
  if (el) el.classList.remove('visible');
}
