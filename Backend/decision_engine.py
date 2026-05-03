"""
decision_engine.py — GoldShield Decision Layer

Translates complex AI/statistical outputs (LSTM, GARCH, Sentiment, Regression)
into a single clear recommendation for the jeweller:
    HEDGE NOW | MONITOR | LOW RISK

Also handles:
    - Loss simulation (with/without hedge)
    - Gold price anomaly validation
"""

# ── Decision Logic ──────────────────────────────────────────────────────────

# Model weights for confidence scoring (must sum to 1.0)
_MODEL_WEIGHTS = {
    "lstm":       0.25,
    "garch":      0.35,
    "sentiment":  0.25,
    "regression": 0.15,
}

# Valid gold price range in Rs/gram (updated for current MCX levels ~Rs 15,000+)
GOLD_PRICE_MIN = 3000
GOLD_PRICE_MAX = 20000


def generate_hedge_decision(
    lstm_direction: str,
    garch_risk: str,
    sentiment_signal: str,
    regression_signal: str,
    volatility_value: float = 0.0,
    current_price: float = 0.0,
    usd_inr: float = 0.0,
) -> dict:
    """
    Consolidates all four AI/statistical model signals into one clear decision.

    Parameters
    ----------
    lstm_direction   : "UP" | "DOWN" | "FLAT"
    garch_risk       : "HIGH" | "MEDIUM" | "LOW"
    sentiment_signal : "BULLISH" | "BEARISH" | "NEUTRAL"
    regression_signal: "BULLISH" | "BEARISH" | "NEUTRAL"
    volatility_value : numeric volatility from GARCH (used for thresholds)
    current_price    : live gold price ₹/gram (used in explanation bullets)
    usd_inr          : current USD/INR rate (used in explanation bullets)

    Returns
    -------
    dict with keys:
        decision, confidence_score, risk_level,
        explanation_bullets, recommended_action, color
    """

    # ── Step 1 : decision tree ──────────────────────────────────────────────
    is_high_vol   = garch_risk == "HIGH"
    is_rising     = lstm_direction == "UP"
    is_bearish    = sentiment_signal == "BEARISH"
    is_bullish_m  = regression_signal == "BULLISH"
    is_med_vol    = garch_risk == "MEDIUM"

    # HIGH volatility ALONE is sufficient for HEDGE NOW — jewellers must always act
    # on high GARCH volatility regardless of price direction or sentiment.
    if is_high_vol:
        decision   = "HEDGE NOW"
        risk_level = "High"
        color      = "red"
    elif (is_rising and is_bearish) or (is_med_vol and (is_bearish or is_bullish_m)):
        decision   = "HEDGE NOW"
        risk_level = "High"
        color      = "red"
    elif is_med_vol and (lstm_direction != "DOWN"):
        decision   = "MONITOR"
        risk_level = "Medium"
        color      = "orange"
    elif is_rising or is_bearish:
        decision   = "MONITOR"
        risk_level = "Medium"
        color      = "orange"
    else:
        decision   = "LOW RISK"
        risk_level = "Low"
        color      = "green"

    # ── Step 2 : confidence score ───────────────────────────────────────────
    lstm_contrib  = 1.0 if is_rising    else (0.5 if lstm_direction == "FLAT" else 0.3)
    garch_contrib = {"HIGH": 1.0, "MEDIUM": 0.5, "LOW": 0.0}.get(garch_risk, 0.0)
    sent_contrib  = 1.0 if is_bearish   else (0.5 if sentiment_signal == "NEUTRAL" else 0.3)
    reg_contrib   = 1.0 if is_bullish_m else 0.0

    raw_confidence = (
        lstm_contrib  * _MODEL_WEIGHTS["lstm"]      +
        garch_contrib * _MODEL_WEIGHTS["garch"]     +
        sent_contrib  * _MODEL_WEIGHTS["sentiment"] +
        reg_contrib   * _MODEL_WEIGHTS["regression"]
    )
    # Map 0–1 range to a 55–95% display range (always meaningful, never 0 or 100)
    confidence_score = round(55 + raw_confidence * 40, 1)

    # ── Step 3 : explanation bullets ───────────────────────────────────────
    bullets = _build_explanation_bullets(
        lstm_direction, garch_risk, sentiment_signal, regression_signal,
        volatility_value, current_price, usd_inr
    )

    # ── Step 4 : recommended action placeholder (filled by caller with lots) ─
    recommended_action = {
        "description": "Buy MCX Mini Gold futures to hedge your exposure",
        "instrument":  "MCX Mini Gold (100g lots)",
        "lots_needed":  None,   # caller fills this from hedge_engine
        "margin_required": None,
    }

    return {
        "decision":           decision,
        "confidence_score":   confidence_score,
        "risk_level":         risk_level,
        "color":              color,
        "explanation_bullets": bullets,
        "recommended_action": recommended_action,
    }


def _build_explanation_bullets(
    lstm_direction, garch_risk, sentiment_signal, regression_signal,
    volatility_value, current_price, usd_inr
) -> list[str]:
    """
    Returns exactly 3 plain-language bullet points explaining the decision.
    """
    bullets = []

    # Bullet 1 — Volatility / GARCH
    if garch_risk == "HIGH":
        vol_str = f"{volatility_value:.2f}%" if volatility_value else ""
        bullets.append(f"High price volatility detected{' (' + vol_str + ')' if vol_str else ''} - markets are moving sharply")
    elif garch_risk == "MEDIUM":
        bullets.append("Moderate volatility - gold prices are showing uncertainty")
    else:
        bullets.append("Low volatility - gold prices are relatively stable right now")

    # Bullet 2 - LSTM forecast
    if lstm_direction == "UP":
        bullets.append("AI price forecast predicts gold prices will RISE in the next 14 days")
    elif lstm_direction == "DOWN":
        bullets.append("AI price forecast predicts gold prices will FALL in the next 14 days")
    else:
        bullets.append("AI price forecast shows gold prices remaining FLAT in the next 14 days")

    # Bullet 3 - Sentiment or macro (whichever is stronger signal)
    if sentiment_signal == "BEARISH":
        bullets.append("Recent news sentiment is NEGATIVE - market commentary suggests downward pressure")
    elif regression_signal == "BULLISH":
        if usd_inr and usd_inr > 84:
            bullets.append(f"Macro: INR weakening vs USD (Rs.{usd_inr:.1f}) historically drives domestic gold prices higher")
        else:
            bullets.append("Macro indicators suggest gold prices may rise - crude oil and USD trends are bullish")
    elif sentiment_signal == "BULLISH":
        bullets.append("Recent news sentiment is POSITIVE - market commentary supports gold price strength")
    else:
        bullets.append("News sentiment is NEUTRAL - no strong directional push from market commentary")

    return bullets[:3]


# ── Loss Simulation ─────────────────────────────────────────────────────────

def calculate_loss_simulation(
    quantity_grams: float,
    booking_price: float,
    gold_rise_pct: float,
    hedge_offset: float = 0.85,
) -> dict:
    """
    Calculates potential financial loss with and without hedging.

    Parameters
    ----------
    quantity_grams : gold ordered (in grams)
    booking_price  : price booked with customer (₹/gram)
    gold_rise_pct  : assumed % rise in gold price (e.g. 0.10 for 10%)
    hedge_offset   : fraction of loss offset by hedge (default 0.85 = 85%)

    Returns
    -------
    dict:
        future_price, loss_without_hedge, loss_with_hedge, savings, scenario_label
    """
    future_price        = booking_price * (1 + gold_rise_pct)
    loss_without_hedge  = (future_price - booking_price) * quantity_grams
    loss_with_hedge     = loss_without_hedge * (1 - hedge_offset)
    savings             = loss_without_hedge - loss_with_hedge

    return {
        "scenario_label":      f"If gold rises by {gold_rise_pct * 100:.0f}%",
        "future_price":        round(future_price, 2),
        "rise_pct":            gold_rise_pct * 100,
        "loss_without_hedge":  round(loss_without_hedge, 2),
        "loss_with_hedge":     round(loss_with_hedge, 2),
        "savings":             round(savings, 2),
        "hedge_offset_pct":    hedge_offset * 100,
    }


def calculate_both_scenarios(
    quantity_grams: float,
    booking_price: float,
    hedge_offset: float = 0.85,
) -> list[dict]:
    """
    Returns loss simulation for both standard scenarios: 10% and 5% gold rise.
    """
    return [
        calculate_loss_simulation(quantity_grams, booking_price, 0.10, hedge_offset),
        calculate_loss_simulation(quantity_grams, booking_price, 0.05, hedge_offset),
    ]


# ── Price Validation ────────────────────────────────────────────────────────

def validate_gold_price(price_per_gram: float) -> dict:
    """
    Checks if a gold price is within a realistic range for Indian jewellers.

    Returns
    -------
    dict: { is_valid: bool, anomaly_message: str | None }
    """
    if price_per_gram is None or price_per_gram <= 0:
        return {
            "is_valid": False,
            "anomaly_message": "⚠️ Data anomaly detected — could not fetch live price",
        }
    if price_per_gram < GOLD_PRICE_MIN:
        return {
            "is_valid": False,
            "anomaly_message": f"⚠️ Data anomaly detected — price of ₹{price_per_gram:,.0f}/gm is unusually low",
        }
    if price_per_gram > GOLD_PRICE_MAX:
        return {
            "is_valid": False,
            "anomaly_message": f"⚠️ Data anomaly detected — price of ₹{price_per_gram:,.0f}/gm is unusually high",
        }
    return {"is_valid": True, "anomaly_message": None}


# ── Sentiment Helper ────────────────────────────────────────────────────────

def get_market_mood_interpretation(signal: str, composite_score: float) -> str:
    """
    Returns a plain-language interpretation of the sentiment signal.
    """
    if signal == "BEARISH":
        return "Recent news suggests downward pressure on gold prices"
    elif signal == "BULLISH":
        return "Recent news suggests upward momentum in gold prices"
    else:
        return "News sentiment is mixed — no clear directional pressure on gold prices"


def get_market_mood_label(signal: str) -> str:
    """Maps API signal values to display labels."""
    return {
        "BEARISH": "NEGATIVE",
        "BULLISH": "POSITIVE",
        "NEUTRAL": "NEUTRAL",
    }.get(signal, "NEUTRAL")
