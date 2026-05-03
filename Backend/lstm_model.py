import os
import pickle
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error
import plotly.graph_objects as go

# Reduce verbose tensorFlow logs
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
from tensorflow.keras.models import Sequential, load_model
from tensorflow.keras.layers import LSTM, Dense, Dropout

def prepare_sequences(prices, lookback=60):
    prices = np.array(prices).reshape(-1, 1)
    scaler = MinMaxScaler(feature_range=(0, 1))
    scaled_prices = scaler.fit_transform(prices)
    
    X, y = [], []
    for i in range(lookback, len(scaled_prices)):
        X.append(scaled_prices[i-lookback:i, 0])
        y.append(scaled_prices[i, 0])
        
    X, y = np.array(X), np.array(y)
    X = np.reshape(X, (X.shape[0], X.shape[1], 1))
    
    return X, y, scaler

def build_lstm_model(lookback=60):
    model = Sequential()
    model.add(LSTM(64, return_sequences=True, input_shape=(lookback, 1)))
    model.add(Dropout(0.2))
    model.add(LSTM(64, return_sequences=False))
    model.add(Dropout(0.2))
    model.add(Dense(1))
    model.compile(optimizer='adam', loss='mse')
    return model

def train_lstm(csv_path="gold_data.csv"):
    print(f"Loading data from {csv_path}...")
    df = pd.read_csv(csv_path)
    
    # Handle "Close" or "Gold_Close"
    close_col = None
    if "Gold_Close" in df.columns:
        close_col = "Gold_Close"
    elif "Close" in df.columns:
        close_col = "Close"
    else:
        raise ValueError("Could not find 'Close' or 'Gold_Close' column in the dataset")
        
    prices = df[close_col].values
    
    print("Preparing sequences...")
    X, y, scaler = prepare_sequences(prices)
    
    # Split data: first 80% for training, last 20% for testing
    split_index = int(len(X) * 0.8)
    X_train, X_test = X[:split_index], X[split_index:]
    y_train, y_test = y[:split_index], y[split_index:]
    
    model = build_lstm_model()
    print("Training LSTM model...")
    model.fit(X_train, y_train, epochs=20, batch_size=32, validation_split=0.1, verbose=1)
    
    print("Saving model and scaler...")
    model.save("lstm_gold.h5")
    with open("scaler.pkl", "wb") as f:
        pickle.dump(scaler, f)
        
    # Evaluate
    print("Evaluating model...")
    predictions = model.predict(X_test)
    predictions = scaler.inverse_transform(predictions)
    y_test_inv = scaler.inverse_transform(y_test.reshape(-1, 1))
    
    test_rmse = np.sqrt(mean_squared_error(y_test_inv, predictions))
    test_mae = mean_absolute_error(y_test_inv, predictions)
    # Avoid division by zero
    test_mape = np.mean(np.abs((y_test_inv - predictions) / (y_test_inv + 1e-10))) * 100
    
    metrics = {
        "test_rmse": test_rmse,
        "test_mae": test_mae,
        "test_mape": test_mape
    }
    
    print("Training complete. Metrics:")
    print(f"Test RMSE: {test_rmse:.2f}")
    print(f"Test MAE:  {test_mae:.2f}")
    print(f"Test MAPE: {test_mape:.2f}%")
    
    return model, scaler, metrics

def load_lstm_model():
    if not os.path.exists("lstm_gold.h5") or not os.path.exists("scaler.pkl"):
        print("Existing model/scaler not found. Training a new model...")
        model, scaler, _ = train_lstm()
        return model, scaler
        
    model = load_model("lstm_gold.h5", compile=False)
    with open("scaler.pkl", "rb") as f:
        scaler = pickle.load(f)
    return model, scaler

def forecast_next_days(model, scaler, prices, n_days=14):
    # Take the last 60 days
    last_60_days = np.array(prices[-60:]).reshape(-1, 1)
    # Scale
    last_60_days_scaled = scaler.transform(last_60_days)
    
    X_test = []
    X_test.append(last_60_days_scaled[:, 0])
    X_test = np.array(X_test)
    X_test = np.reshape(X_test, (X_test.shape[0], X_test.shape[1], 1))
    
    predicted_prices = []
    current_batch = X_test[0]
    
    for i in range(n_days):
        # Predict the next day
        pred_scaled = model.predict(current_batch.reshape(1, 60, 1), verbose=0)[0]
        # Append true predicted value to results
        predicted_prices.append(pred_scaled)
        
        # Update the batch to include the new prediction and remove the oldest value
        current_batch = np.append(current_batch[1:], pred_scaled)
        current_batch = current_batch.reshape(60, 1)
        
    # Inverse transform
    predicted_prices = scaler.inverse_transform(np.array(predicted_prices).reshape(-1, 1))
    return predicted_prices.flatten().tolist()

def get_forecast_direction(forecast_prices, current_price):
    avg_forecast = np.mean(forecast_prices)
    if avg_forecast > current_price * 1.01:
        return "UP"
    elif avg_forecast < current_price * 0.99:
        return "DOWN"
    else:
        return "FLAT"

def plot_forecast(historical_prices, forecast_prices, dates):
    # Take last 90 days of historical prices
    hist_prices_90 = list(historical_prices)[-90:]
    hist_dates_90 = list(dates)[-90:] if dates is not None else list(range(1, 91))
    
    # Generate dates for forecast
    if dates is not None and len(dates) > 0:
        last_date = pd.to_datetime(list(dates)[-1])
        future_dates = pd.date_range(start=last_date + pd.Timedelta(days=1), periods=len(forecast_prices))
    else:
        future_dates = list(range(91, 91 + len(forecast_prices)))
        
    std_dev = np.std(np.diff(hist_prices_90))
    upper_band = np.array(forecast_prices) + std_dev
    lower_band = np.array(forecast_prices) - std_dev

    fig = go.Figure()

    # Plot historical
    fig.add_trace(go.Scatter(
        x=hist_dates_90, 
        y=hist_prices_90, 
        mode='lines', 
        name='Historical Prices (90 days)', 
        line=dict(color='blue')
    ))

    # Plot forecast
    fig.add_trace(go.Scatter(
        x=future_dates, 
        y=forecast_prices, 
        mode='lines', 
        name='14-Day Forecast', 
        line=dict(color='orange', dash='dash')
    ))

    # Plot uncertainty bands
    fig.add_trace(go.Scatter(
        x=list(future_dates) + list(future_dates)[::-1],
        y=list(upper_band) + list(lower_band)[::-1],
        fill='toself',
        fillcolor='rgba(255, 165, 0, 0.2)',
        line=dict(color='rgba(255,255,255,0)'),
        hoverinfo="skip",
        showlegend=True,
        name='± 1 Std Dev Band'
    ))

    fig.update_layout(
        title="Gold Price Forecast — LSTM Model (Paper 1: AI-Enhanced Metals Hedging)",
        xaxis_title="Date",
        yaxis_title="Price",
        template="plotly_white"
    )

    return fig

if __name__ == "__main__":
    train_lstm()
