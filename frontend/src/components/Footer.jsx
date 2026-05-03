export default function Footer() {
  const version = '2.1.0';
  const updated = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'
  });

  return (
    <footer className="site-footer">
      <div className="footer-trust">
        <span>📊 Data: MCX · RBI · Global Markets</span>
        <span>🔒 SSL Secured</span>
        <span>🇮🇳 IST Live Prices</span>
        <span>⚡ AI-Powered Analysis</span>
      </div>
      <div className="footer-disclaimer">
        ⚠️ Not financial advice — consult a SEBI-registered broker before trading.
      </div>
      <div className="footer-disclaimer">
        🔬 Simulation only — not actual commodity trading on MCX.
        MCX lot size: 100 gm (Mini) · 1 kg (Standard).
      </div>
      <div className="footer-version">
        GoldShield v{version} · Last updated {updated} IST
      </div>
    </footer>
  );
}
