"""
portfolio_engine.py
Backend computation engine for the GoldShield Portfolio Dashboard.
All metrics derive from live session state (orders + wallet) + real market data.
"""

import datetime
import numpy as np
import pandas as pd
import yfinance as yf
from functools import lru_cache

# ──────────────────────────────────────────────────────────────────────────────
# CACHED MARKET DATA
# ──────────────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def fetch_gold_history_7d():
    """Last 7 trading days of GC=F close prices."""
    try:
        df = yf.download("GC=F", period="10d", interval="1d", progress=False)
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        closes = df["Close"].dropna().tail(7)
        return closes
    except Exception:
        return pd.Series(dtype=float)


@lru_cache(maxsize=1)
def fetch_gold_history_30d():
    """Last 30 trading days of GC=F close prices + USD/INR for INR conversion."""
    try:
        df_gold  = yf.download("GC=F",  period="35d", interval="1d", progress=False)
        df_inr   = yf.download("INR=X", period="35d", interval="1d", progress=False)
        if isinstance(df_gold.columns, pd.MultiIndex):
            df_gold.columns = df_gold.columns.get_level_values(0)
        if isinstance(df_inr.columns, pd.MultiIndex):
            df_inr.columns = df_inr.columns.get_level_values(0)
        gold_close = df_gold["Close"].dropna().tail(30)
        inr_close  = df_inr["Close"].dropna().reindex(gold_close.index, method="ffill").fillna(84.0)
        # Convert USD/oz → INR/gm with 9% import duty
        inr_per_gm = (gold_close / 31.1035) * inr_close * 1.09
        return inr_per_gm
    except Exception:
        return pd.Series(dtype=float)


# ──────────────────────────────────────────────────────────────────────────────
# RISK CLASSIFICATION (mirrors order_manager — kept in sync)
# ──────────────────────────────────────────────────────────────────────────────

def classify_risk(order, live_p):
    qty       = order["quantity"]
    bp        = order["booked_price"]
    today     = datetime.date.today()
    days_left = (order["delivery_date"] - today).days
    pnl       = (bp - live_p) * qty
    pct_diff  = ((live_p - bp) / bp) * 100
    abs_loss  = abs(min(pnl, 0))

    score = 0
    if pct_diff > 5.0:        score += 3
    elif pct_diff > 2.0:      score += 2
    elif pct_diff > 0.5:      score += 1
    if days_left < 30:        score += 3
    elif days_left < 90:      score += 2
    elif days_left < 180:     score += 1
    if abs_loss > 100_000:    score += 2
    elif abs_loss > 10_000:   score += 1

    if score >= 5:    return "HIGH"
    elif score >= 2:  return "MEDIUM"
    else:             return "LOW"


# ──────────────────────────────────────────────────────────────────────────────
# SECTION 1 — PORTFOLIO OVERVIEW
# ──────────────────────────────────────────────────────────────────────────────

def compute_portfolio_overview(orders, live_p, prev_close, wallet_balance):
    """Returns dict of top-level portfolio metrics."""
    active = [o for o in orders if o.get("status") == "Active"]

    total_qty    = sum(o["quantity"] for o in active)
    total_exp    = sum(o["quantity"] * o["booked_price"] for o in active)   # cost basis
    port_value   = total_qty * live_p                                        # current value at live price
    unrealised_pnl = port_value - total_exp                                  # +ve = profit
    unrealised_pct = (unrealised_pnl / total_exp * 100) if total_exp > 0 else 0.0

    # Daily change: (live_p - prev_close) × total_qty
    daily_chg_abs = (live_p - prev_close) * total_qty if prev_close else 0.0
    daily_chg_pct = ((live_p - prev_close) / prev_close * 100) if prev_close else 0.0

    hedged_count   = sum(1 for o in active if o.get("hedged"))
    hedge_ratio    = (hedged_count / len(active) * 100) if active else 0.0

    # Locked margin: 30% of hedged exposure
    hedged_exp     = sum(o["quantity"] * o["booked_price"] for o in active if o.get("hedged"))
    margin_locked  = hedged_exp * 0.30
    avail_balance  = max(0.0, wallet_balance - margin_locked)

    return {
        "total_qty":        total_qty,
        "total_exposure":   total_exp,
        "portfolio_value":  port_value,
        "unrealised_pnl":   unrealised_pnl,
        "unrealised_pct":   unrealised_pct,
        "daily_chg_abs":    daily_chg_abs,
        "daily_chg_pct":    daily_chg_pct,
        "hedge_ratio":      hedge_ratio,
        "wallet_balance":   wallet_balance,
        "margin_locked":    margin_locked,
        "avail_balance":    avail_balance,
        "hedged_count":     hedged_count,
        "total_orders":     len(active),
    }


# ──────────────────────────────────────────────────────────────────────────────
# SECTION 3 — GOLD HOLDINGS BY TYPE
# ──────────────────────────────────────────────────────────────────────────────

def compute_holdings_by_type(orders, live_p):
    """Aggregates active orders by jewellery type. Returns DataFrame."""
    active = [o for o in orders if o.get("status") == "Active"]
    if not active:
        return pd.DataFrame()

    groups = {}
    for o in active:
        t = o["jewellery_type"]
        if t not in groups:
            groups[t] = {"qty": 0, "cost_sum": 0, "hedged_qty": 0}
        groups[t]["qty"]       += o["quantity"]
        groups[t]["cost_sum"]  += o["quantity"] * o["booked_price"]
        if o.get("hedged"):
            groups[t]["hedged_qty"] += o["quantity"]

    rows = []
    for t, g in groups.items():
        qty      = g["qty"]
        wac      = g["cost_sum"] / qty if qty > 0 else 0
        curr_val = qty * live_p
        pnl      = curr_val - g["cost_sum"]
        pnl_pct  = (pnl / g["cost_sum"] * 100) if g["cost_sum"] > 0 else 0
        hedge_pct = (g["hedged_qty"] / qty * 100) if qty > 0 else 0
        rows.append({
            "Type":           t,
            "Qty (gm)":       qty,
            "WAC (₹/gm)":     round(wac, 2),
            "Current (₹/gm)": round(live_p, 2),
            "Value (₹)":      round(curr_val, 0),
            "P&L (₹)":        round(pnl, 0),
            "P&L %":          round(pnl_pct, 2),
            "Hedge %":        round(hedge_pct, 1),
        })
    return pd.DataFrame(rows)


# ──────────────────────────────────────────────────────────────────────────────
# SECTION 4 — PORTFOLIO ANALYTICS
# ──────────────────────────────────────────────────────────────────────────────

def compute_portfolio_value_series(orders, n_days=7):
    """
    Builds a time series of portfolio value over last n_days trading days.
    Applies historical gold INR prices to current total gold holdings.
    """
    active     = [o for o in orders if o.get("status") == "Active"]
    total_qty  = sum(o["quantity"] for o in active)
    if total_qty == 0:
        return pd.Series(dtype=float)

    history = fetch_gold_history_30d()
    if history.empty:
        return pd.Series(dtype=float)

    series = history.tail(n_days) * total_qty
    return series  # index = dates, values = portfolio value in INR


def compute_daily_pnl_series(orders, n_days=14):
    """
    Day-by-day P&L change based on price returns × total holdings.
    Returns Series with daily P&L (INR).
    """
    active    = [o for o in orders if o.get("status") == "Active"]
    total_qty = sum(o["quantity"] for o in active)
    if total_qty == 0:
        return pd.Series(dtype=float)

    history = fetch_gold_history_30d()
    if history.empty:
        return pd.Series(dtype=float)

    tail     = history.tail(n_days + 1)
    daily    = tail.diff().dropna() * total_qty
    return daily


# ──────────────────────────────────────────────────────────────────────────────
# SECTION 5 — RISK & EXPOSURE ANALYSIS
# ──────────────────────────────────────────────────────────────────────────────

def compute_risk_breakdown(orders, live_p):
    """Returns dict: exposure broken down by risk tier + risk score 0-100."""
    active = [o for o in orders if o.get("status") == "Active"]
    if not active:
        return {"high_exp": 0, "med_exp": 0, "low_exp": 0,
                "hedged_exp": 0, "unhedged_exp": 0, "risk_score": 0,
                "high_count": 0, "med_count": 0, "low_count": 0,
                "total_exp": 0}

    high_exp = med_exp = low_exp = 0
    high_n   = med_n   = low_n   = 0
    hedged_exp = unhedged_exp = 0

    for o in active:
        exp  = o["quantity"] * o["booked_price"]
        risk = classify_risk(o, live_p)
        if risk == "HIGH":
            high_exp += exp; high_n += 1
        elif risk == "MEDIUM":
            med_exp  += exp; med_n  += 1
        else:
            low_exp  += exp; low_n  += 1

        if o.get("hedged"):
            hedged_exp += exp
        else:
            unhedged_exp += exp

    total_exp      = high_exp + med_exp + low_exp
    unhedged_ratio = unhedged_exp / total_exp if total_exp > 0 else 0

    # Risk score formula (0–100):
    # Weighted risk (60%) + unhedged penalty (20%) + high-risk count penalty (20%)
    weighted = (high_exp * 100 + med_exp * 50 + low_exp * 10) / total_exp if total_exp > 0 else 0
    unhedged_penalty = unhedged_ratio * 20
    high_count_penalty = min(high_n * 5, 20)
    risk_score = min(100, round(weighted * 0.6 + unhedged_penalty + high_count_penalty, 1))

    return {
        "high_exp":    high_exp,
        "med_exp":     med_exp,
        "low_exp":     low_exp,
        "hedged_exp":  hedged_exp,
        "unhedged_exp": unhedged_exp,
        "total_exp":   total_exp,
        "risk_score":  risk_score,
        "high_count":  high_n,
        "med_count":   med_n,
        "low_count":   low_n,
    }


# ──────────────────────────────────────────────────────────────────────────────
# SECTION 6 — AI INSIGHTS ENGINE
# ──────────────────────────────────────────────────────────────────────────────

def generate_ai_insights(orders, live_p, price_change_pct, risk_breakdown, portfolio_metrics):
    """
    Rule-based AI insight engine. Returns list of (severity, message, action) tuples.
    severity: 'error' | 'warning' | 'info' | 'success'
    """
    insights = []
    active = [o for o in orders if o.get("status") == "Active"]
    if not active:
        return [("info", "Add your first order to start receiving AI insights.", "Add Order")]

    unhedged_ratio = 1 - (portfolio_metrics["hedge_ratio"] / 100)
    total_orders   = portfolio_metrics["total_orders"]
    hedge_pct      = portfolio_metrics["hedge_ratio"]

    # Insight 1: Unhedged portfolio risk
    if unhedged_ratio > 0.7:
        insights.append((
            "error",
            f"Your portfolio is {unhedged_ratio*100:.0f}% unhedged — HIGH exposure to gold price volatility. "
            f"Consider hedging at least {min(80, int(unhedged_ratio*100-20))}% to protect margins.",
            "Go to Hedge Advisor"
        ))
    elif unhedged_ratio > 0.4:
        insights.append((
            "warning",
            f"Portfolio is {unhedged_ratio*100:.0f}% unhedged. Moderate risk — consider increasing hedge coverage.",
            "Review Hedging"
        ))
    else:
        insights.append((
            "success",
            f"Good hedge coverage at {hedge_pct:.0f}%. Your exposure is well-managed.",
            None
        ))

    # Insight 2: Price move today
    if price_change_pct > 2.0:
        insights.append((
            "error",
            f"Gold price surged +{price_change_pct:.2f}% today (₹{live_p:,.0f}/gm). "
            f"Unhedged orders are losing value rapidly — consider immediate action.",
            "Hedge Now"
        ))
    elif price_change_pct > 0.5:
        insights.append((
            "warning",
            f"Gold price rose +{price_change_pct:.2f}% today. Monitor unhedged orders closely.",
            None
        ))
    elif price_change_pct < -1.0:
        insights.append((
            "info",
            f"Gold price fell {price_change_pct:.2f}% today — favourable for jewellers who booked above current rates.",
            None
        ))

    # Insight 3: Individual HIGH risk orders
    for o in active:
        risk = classify_risk(o, live_p)
        if risk == "HIGH":
            pnl = (o["booked_price"] - live_p) * o["quantity"]
            insights.append((
                "error",
                f"Order #{o.get('order_id','?')} ({o.get('customer_name', o.get('customer','?'))}, {o['quantity']}g) is at HIGH risk. "
                f"P&L at risk: ₹{pnl:,.0f}. Recommended action: hedge 80% of exposure.",
                f"Hedge Order #{o.get('order_id','?')}"
            ))

    # Insight 4: Portfolio loss exceeded ₹2L
    pnl = portfolio_metrics["unrealised_pnl"]
    if pnl < -200_000:
        insights.append((
            "error",
            f"Portfolio unrealised loss exceeded ₹2 lakh (currently ₹{abs(pnl):,.0f}). "
            f"Immediate hedging or price renegotiation recommended.",
            "Hedge Advisor"
        ))

    # Insight 5: High risk count
    if risk_breakdown["high_count"] > 2:
        insights.append((
            "warning",
            f"{risk_breakdown['high_count']} orders are in HIGH risk zone. "
            f"Total at-risk exposure: ₹{risk_breakdown['high_exp']:,.0f}.",
            "Review Orders"
        ))

    return insights


# ──────────────────────────────────────────────────────────────────────────────
# SECTION 8 — PERFORMANCE METRICS
# ──────────────────────────────────────────────────────────────────────────────

def compute_performance_metrics(orders, live_p):
    """Returns dict of return metrics: total, daily, weekly, monthly, max_drawdown."""
    active    = [o for o in orders if o.get("status") == "Active"]
    total_qty = sum(o["quantity"] for o in active)
    total_exp = sum(o["quantity"] * o["booked_price"] for o in active)

    if total_qty == 0 or total_exp == 0:
        return {"total_return_pct": 0, "daily_return_pct": 0,
                "weekly_return_pct": 0, "monthly_return_pct": 0, "max_drawdown_pct": 0}

    history = fetch_gold_history_30d()
    port_series = history * total_qty if not history.empty else pd.Series(dtype=float)

    total_return_pct = ((live_p * total_qty - total_exp) / total_exp) * 100

    # Daily return
    daily_pct = 0.0
    if len(port_series) >= 2:
        daily_pct = (port_series.iloc[-1] - port_series.iloc[-2]) / port_series.iloc[-2] * 100

    # Weekly return (7 trading days)
    weekly_pct = 0.0
    if len(port_series) >= 7:
        weekly_pct = (port_series.iloc[-1] - port_series.iloc[-7]) / port_series.iloc[-7] * 100

    # Monthly return (all available — ~21 trading days)
    monthly_pct = 0.0
    if len(port_series) >= 2:
        monthly_pct = (port_series.iloc[-1] - port_series.iloc[0]) / port_series.iloc[0] * 100

    # Max drawdown from the portfolio value series
    max_dd = 0.0
    if len(port_series) >= 2:
        peak    = port_series.cummax()
        dd      = (port_series - peak) / peak * 100
        max_dd  = float(dd.min())

    return {
        "total_return_pct":   round(total_return_pct, 2),
        "daily_return_pct":   round(daily_pct, 2),
        "weekly_return_pct":  round(weekly_pct, 2),
        "monthly_return_pct": round(monthly_pct, 2),
        "max_drawdown_pct":   round(max_dd, 2),
    }


# ──────────────────────────────────────────────────────────────────────────────
# WALLET UTILS
# ──────────────────────────────────────────────────────────────────────────────

def log_transaction(txn_type, amount, description, status="success"):
    """No-op stub for log_transaction since Streamlit state is removed."""
    pass

def get_transactions_df():
    """Returns an empty DataFrame since Streamlit state is removed."""
    return pd.DataFrame()
