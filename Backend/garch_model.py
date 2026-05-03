import numpy as np
import pandas as pd
import plotly.graph_objects as go
from statsmodels.tsa.stattools import adfuller
from arch import arch_model

def compute_returns(prices):
    """
    Computes daily percentage returns from a series of prices.
    """
    return 100 * prices.pct_change().dropna()

def run_adf_test(prices):
    """
    Runs the Augmented Dickey-Fuller stationarity test on the returns.
    """
    returns = compute_returns(prices)
    result = adfuller(returns)
    adf_statistic = result[0]
    p_value = result[1]
    is_stationary = (p_value < 0.05)
    
    if is_stationary:
        print(f"Returns are stationary (p={p_value:.4f}) — valid for GARCH modelling")
    else:
        print(f"Warning: Returns might not be stationary (p={p_value:.4f}).")
        
    return {
        "adf_statistic": adf_statistic,
        "p_value": p_value,
        "is_stationary": is_stationary
    }

def fit_garch(prices):
    """
    Fits a GARCH(1,1) model and an EGARCH(1,1,1) model using the arch library.
    """
    returns = compute_returns(prices)
    
    # Fit GARCH(1,1)
    garch_mdl = arch_model(returns, vol='Garch', p=1, q=1)
    garch_result = garch_mdl.fit(disp='off')
    
    # Fit EGARCH model
    # Note: specifying o=1 to ensure the asymmetry parameter (gamma) is estimated.
    egarch_mdl = arch_model(returns, vol='EGARCH', p=1, o=1, q=1)
    egarch_result = egarch_mdl.fit(disp='off')
    
    return (garch_result, egarch_result)

def forecast_volatility(prices, horizon=5):
    """
    Forecasts volatility using the fitted GARCH model.
    """
    garch_result, _ = fit_garch(prices)
    
    # Generate variance forecasts
    forecasts = garch_result.forecast(horizon=horizon)
    
    # Extract the predicted variance for the last available forecast step
    # forecasts.variance is a DataFrame where columns are h.1, h.2, ... h.horizon
    last_variance_row = forecasts.variance.iloc[-1]
    last_predicted_variance = last_variance_row.iloc[-1] # The 'h.5' column prediction
    
    volatility = np.sqrt(last_predicted_variance)
    
    risk_level = "LOW"
    risk_color = "green"
    
    if volatility > 1.4:
        risk_level = "HIGH"
        risk_color = "red"
    elif volatility >= 0.8:
        risk_level = "MEDIUM"
        risk_color = "orange"
        
    alpha = garch_result.params.get('alpha[1]', 0.0)
    beta = garch_result.params.get('beta[1]', 0.0)
    
    return {
        "volatility": round(float(volatility), 2),
        "risk_level": risk_level,
        "risk_color": risk_color,
        "forecast_horizon": horizon,
        "alpha": alpha,
        "beta": beta,
        "persistence": alpha + beta
    }

def get_egarch_signal(prices):
    """
    Fits EGARCH model and extracts the gamma (asymmetry) parameter.
    """
    _, egarch_result = fit_garch(prices)
    
    # Extract gamma (asymmetry) parameter and its p-value
    # arch models use 'gamma[1]' as the asymmetry term in EGARCH.
    gamma = egarch_result.params.get('gamma[1]', 0)
    p_value = egarch_result.pvalues.get('gamma[1]', 1)
    
    if gamma < 0 and p_value < 0.05:
        return "NEGATIVE NEWS AMPLIFIED — bad news hits harder than good news"
    else:
        return "SYMMETRIC — positive and negative news have equal impact"

def plot_volatility(prices):
    """
    Plots the 30-day rolling standard deviation of returns with risk thresholds.
    """
    returns = compute_returns(prices)
    rolling_volatility = returns.rolling(window=30).std()
    
    dates = returns.index
    
    fig = go.Figure()
    
    # Calculate maximum graph height based on data
    max_val = max(rolling_volatility.max() * 1.2, 2.0)
    
    # Add shaded threshold regions
    fig.add_hrect(y0=0, y1=0.8, fillcolor="green", opacity=0.1, layer="below", line_width=0)
    fig.add_hrect(y0=0.8, y1=1.4, fillcolor="orange", opacity=0.1, layer="below", line_width=0)
    fig.add_hrect(y0=1.4, y1=max_val, fillcolor="red", opacity=0.1, layer="below", line_width=0)
    
    # Line chart of rolling volatility
    fig.add_trace(go.Scatter(
        x=dates,
        y=rolling_volatility,
        mode='lines',
        name='30-Day Rolling Volatility',
        line=dict(color='black', width=2)
    ))
    
    # Horizontal dashed lines identifying thresholds
    fig.add_hline(y=0.8, line_dash="dash", line_color="black", annotation_text="0.8 Threshold (LOW/MED)")
    fig.add_hline(y=1.4, line_dash="dash", line_color="black", annotation_text="1.4 Threshold (MED/HIGH)")
    
    fig.update_layout(
        title="Gold Price Volatility — GARCH Model (Paper 1 + Paper 10)",
        xaxis_title="Date",
        yaxis_title="Volatility (Std Dev of Returns)",
        template="plotly_white",
        yaxis=dict(range=[0, max_val])
    )
    
    return fig

def get_risk_summary(prices):
    """
    Calls forecast_volatility() and get_egarch_signal() to create a clean dashboard dictionary.
    """
    adf_result = run_adf_test(prices)
    vol_forecast = forecast_volatility(prices)
    egarch_sig = get_egarch_signal(prices)
    
    summary = {
        "volatility": vol_forecast["volatility"],
        "risk_level": vol_forecast["risk_level"],
        "risk_color": vol_forecast["risk_color"],
        "persistence": vol_forecast["persistence"],
        "egarch_signal": egarch_sig,
        "adf_stationary": adf_result["is_stationary"]
    }
    
    return summary

if __name__ == "__main__":
    try:
        # We need pandas here locally for the script execution block
        df = pd.read_csv("gold_data.csv")
        
        close_col = None
        if "Gold_Close" in df.columns:
            close_col = "Gold_Close"
        elif "Close" in df.columns:
            close_col = "Close"
        else:
            raise ValueError("Could not find 'Close' or 'Gold_Close' column in the dataset")
            
        # Parse Dates
        if "Date" in df.columns:
            df["Date"] = pd.to_datetime(df["Date"])
            df.set_index("Date", inplace=True)
            
        prices = df[close_col]
        summary_dict = get_risk_summary(prices)
        
        print("\n=== Volatility Risk Summary ===")
        for key, value in summary_dict.items():
            print(f"{key}: {value}")
            
    except Exception as e:
        print(f"Error executing garch_model.py: {e}")
