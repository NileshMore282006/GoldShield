# -*- coding: utf-8 -*-
"""Backend integration test. Run: python test_backend.py"""
import sys, traceback
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def section(title):
    print("\n" + "="*60)
    print("  " + title)
    print("="*60)

prices_series = None
df = None
current_macro = None

# ── 1. Data Pipeline ────────────────────────
section("1. DATA PIPELINE")
try:
    import data_pipeline as dp
    price = dp.get_live_gold_price()
    prev  = dp.get_previous_close()
    silv  = dp.get_live_silver_price()
    df    = dp.load_data()
    prices_series = df['Gold_Close'] if 'Gold_Close' in df.columns else df['Close']
    print(f"  Gold live price : INR {price:.2f}/gm")
    print(f"  Prev close      : INR {prev:.2f}/gm")
    print(f"  Silver price    : INR {silv:.2f}/gm")
    print(f"  CSV shape       : {df.shape}")
    print(f"  Last Gold_Close : {prices_series.iloc[-1]:.2f} (raw CSV value - USD/oz)")
    print("  [OK] data_pipeline")
except Exception as e:
    print(f"  [FAIL] data_pipeline: {e}")
    traceback.print_exc()

# ── 2. GARCH  ────────────────────────────────
section("2. GARCH MODEL")
try:
    import garch_model
    risk = garch_model.get_risk_summary(prices_series)
    print(f"  Volatility  : {risk.get('volatility')}")
    print(f"  Risk level  : {risk.get('risk_level')}")
    print(f"  Persistence : {risk.get('persistence')}")
    print(f"  EGARCH      : {risk.get('egarch_signal')}")
    print("  [OK] garch_model")
except Exception as e:
    print(f"  [FAIL] garch_model: {e}")
    traceback.print_exc()

# ── 3. LSTM  ─────────────────────────────────
section("3. LSTM MODEL")
try:
    import lstm_model, joblib, numpy as np
    model, _ = lstm_model.load_lstm_model()
    scaler    = joblib.load("scaler.pkl")
    prices_arr = prices_series.values
    fc = lstm_model.forecast_next_days(model, scaler, prices_arr, n_days=14)
    direction = lstm_model.get_forecast_direction(fc, float(prices_arr[-1]))
    print(f"  CSV last price (USD/oz)  : {prices_arr[-1]:.2f}")
    print(f"  LSTM forecast day-1      : {fc[0]:.2f}")
    print(f"  LSTM forecast day-14     : {fc[-1]:.2f}")
    print(f"  Direction                : {direction}")
    print("  NOTE: CSV prices in USD/oz. Live price is INR/gm via conversion.")
    if fc[0] > prices_arr[-1] * 1.5 or fc[0] < prices_arr[-1] * 0.5:
        print("  [WARN] Forecast diverges > 50% from last CSV price - scaler may be stale")
    print("  [OK] lstm_model")
except Exception as e:
    print(f"  [FAIL] lstm_model: {e}")
    traceback.print_exc()

# ── 4. Sentiment ─────────────────────────────
section("4. SENTIMENT MODEL")
try:
    from config import NEWS_API_KEY
    import sentiment_model
    key_ok = NEWS_API_KEY and len(NEWS_API_KEY) > 5 and NEWS_API_KEY != 'YOUR_KEY_HERE'
    print(f"  NEWS_API_KEY set: {'YES' if key_ok else 'NO - will use fallback'}")
    summary = sentiment_model.get_sentiment_summary(NEWS_API_KEY)
    print(f"  Signal           : {summary.get('signal')}")
    print(f"  Composite score  : {summary.get('composite_score')}")
    print(f"  Total articles   : {summary.get('total_articles')}")
    print(f"  Positive/Neg/Neu : {summary.get('positive_count')}/{summary.get('negative_count')}/{summary.get('neutral_count')}")
    print("  [OK] sentiment_model")
except Exception as e:
    print(f"  [FAIL] sentiment_model: {e}")
    traceback.print_exc()

# ── 5. Regression / Macro ────────────────────
section("5. REGRESSION / MACRO MODEL")
try:
    import regression_model
    current_macro, display_df = regression_model.get_current_macro_values()
    print(f"  USD/INR      : {current_macro.get('usd_inr')}")
    print(f"  Oil (USD)    : {current_macro.get('oil')}")
    print(f"  Nifty        : {current_macro.get('nifty')}")
    print(f"  Gold USD/oz  : {current_macro.get('int_gold_usd')}")
    print(f"  Silver USD   : {current_macro.get('silver_usd')}")
    model_reg = regression_model.load_regression_model()
    gold_inr = current_macro['int_gold_usd'] * current_macro['usd_inr']
    sig = regression_model.get_macro_signal(model_reg, current_macro, gold_inr)
    print(f"  Signal       : {sig.get('signal')}")
    print(f"  Predicted px : {sig.get('predicted_price')}")
    try:
        contrib = regression_model.compute_contributions(current_macro, model_reg.coef_, model_reg.feature_names_in_)
        print(f"  Contributions: OK ({len(contrib)} rows)")
    except Exception as ce:
        print(f"  Contributions WARN: {ce}")
    print("  [OK] regression_model")
except Exception as e:
    print(f"  [FAIL] regression_model: {e}")
    traceback.print_exc()

# ── 6. Hedge Engine ──────────────────────────
section("6. HEDGE ENGINE")
try:
    import hedge_engine
    rec = hedge_engine.get_full_hedge_recommendation(
        gold_quantity_grams=500,
        booked_price_inr=15000,
        lstm_direction='DOWN',
        garch_result='HIGH',
        sentiment_result='BEARISH',
        regression_result='BULLISH',
        current_gold_price_inr=15766
    )
    print(f"  Verdict      : {rec.get('verdict')}")
    print(f"  Lots needed  : {rec.get('lots_needed')}")
    print(f"  Margin req   : INR {rec.get('margin_required')}")
    print(f"  Hedge ratio  : {rec.get('hedge_ratio')}")
    print(f"  HE index     : {rec.get('he_index')}")
    print(f"  Signal brkdwn: {rec.get('signal_breakdown')}")
    print("  [OK] hedge_engine")
except Exception as e:
    print(f"  [FAIL] hedge_engine: {e}")
    traceback.print_exc()

# ── 7. Decision Engine ───────────────────────
section("7. DECISION ENGINE")
try:
    import decision_engine
    dec = decision_engine.generate_hedge_decision(
        'DOWN', 'HIGH', 'BEARISH', 'BULLISH',
        volatility_value=2.32, current_price=15766, usd_inr=84.5
    )
    print(f"  Decision     : {dec.get('decision')}")
    print(f"  Confidence   : {dec.get('confidence_score')}%")
    print(f"  Risk level   : {dec.get('risk_level')}")
    print(f"  Bullets      : {dec.get('explanation_bullets')}")
    scen = decision_engine.calculate_both_scenarios(500, 15000, 0.85)
    print(f"  Scenarios    : {len(scen)} generated")
    if scen:
        print(f"  Scenario[0]  : {scen[0]}")
    print("  [OK] decision_engine")
except Exception as e:
    print(f"  [FAIL] decision_engine: {e}")
    traceback.print_exc()

# ── 8. Johansen / Granger ────────────────────
section("8. JOHANSEN & GRANGER TESTS")
try:
    import hedge_engine
    cdf, _ = hedge_engine.fetch_futures_spot_data()
    if not cdf.empty:
        j = hedge_engine.run_johansen_test(cdf)
        g = hedge_engine.run_granger_test(cdf)
        print(f"  Johansen cointegrated: {j.get('cointegrated')}")
        print(f"  Granger futures->spot: {g.get('futures_cause_spot')}")
        print("  [OK] johansen + granger (live data)")
    else:
        print("  [WARN] Empty futures/spot data - will use fallback")
except Exception as e:
    print(f"  [WARN] johansen/granger: {e}")

# ── 9. Volatility history ────────────────────
section("9. VOLATILITY HISTORY ENDPOINT")
try:
    import numpy as np
    closes = prices_series
    returns = closes.pct_change().dropna()
    vol_30d = returns.rolling(window=30).std() * np.sqrt(252) * 100
    vol_30d = vol_30d.dropna()
    vol_vals = [float(v) for v in vol_30d.values]
    dates = [str(d.date()) for d in vol_30d.index]
    current_vol = vol_vals[-1] if vol_vals else 0.0
    avg_30d = float(np.mean(vol_vals[-30:])) if len(vol_vals) >= 30 else 0.0
    peak_year = float(np.max(vol_vals[-252:])) if len(vol_vals) >= 252 else 0.0
    print(f"  Current vol  : {current_vol:.2f}%")
    print(f"  30d avg      : {avg_30d:.2f}%")
    print(f"  Year peak    : {peak_year:.2f}%")
    print(f"  Data points  : {len(vol_vals)}")
    print("  [OK] volatility history")
except Exception as e:
    print(f"  [FAIL] volatility history: {e}")
    traceback.print_exc()

# ── 10. INR Prices ───────────────────────────
section("10. INR PRICES ENDPOINT")
try:
    import yfinance as yf, pandas as pd

    def get_close_series(dfx):
        if isinstance(dfx.columns, pd.MultiIndex):
            return dfx['Close'].iloc[:, 0].dropna()
        return dfx['Close'].dropna()

    gold = yf.download("GC=F", period="5d", interval="1d", progress=False)
    g_cl = get_close_series(gold)
    print(f"  GC=F rows: {len(g_cl)}  first={g_cl.iloc[0]:.2f}  last={g_cl.iloc[-1]:.2f}")

    silv = yf.download("SI=F", period="5d", interval="1d", progress=False)
    s_cl = get_close_series(silv)
    print(f"  SI=F rows: {len(s_cl)}  first={s_cl.iloc[0]:.2f}  last={s_cl.iloc[-1]:.2f}")
    print("  [OK] inr-prices")
except Exception as e:
    print(f"  [FAIL] inr-prices: {e}")
    traceback.print_exc()

# ── 11. API server health ────────────────────
section("11. API SERVER HEALTH")
try:
    import urllib.request, json
    with urllib.request.urlopen('http://127.0.0.1:8000/api/gold-price', timeout=3) as r:
        data = json.loads(r.read())
        print(f"  /api/gold-price: INR {data.get('price')} [RUNNING]")
except Exception as e:
    print(f"  API server NOT running: {e}")
    print("  To start: python api.py")

print("\n" + "="*60)
print("  TEST COMPLETE")
print("="*60)
