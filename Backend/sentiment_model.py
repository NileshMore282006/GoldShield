import os
import datetime
import requests
import numpy as np
import pandas as pd
import plotly.graph_objects as go
from transformers import pipeline

import config

# Module-level cache for the FinBERT pipeline
_finbert_pipeline = None

def load_finbert():
    """
    Loads the FinBERT model from HuggingFace and caches it to avoid reloading.
    """
    global _finbert_pipeline
    if _finbert_pipeline is None:
        print("Loading FinBERT model... (this may take ~30 seconds)")
        # top_k=None returns all scores for positive, negative, and neutral
        _finbert_pipeline = pipeline("text-classification", model="ProsusAI/finbert", top_k=None)
        print("FinBERT loaded successfully")
    return _finbert_pipeline

def fetch_gold_news(api_key, n=10):
    """
    Fetches news from NewsAPI. Provides fallback headlines if it fails.
    """
    fallback_headlines = [
        {"title": "Gold prices rise on weak rupee", "description": "Gold prices pushed slightly higher today...", "source": "Sample News", "published_at": datetime.datetime.now().isoformat(), "url": "#"},
        {"title": "MCX gold futures slip amid global cues", "description": "Global forces brought down futures...", "source": "Sample News", "published_at": datetime.datetime.now().isoformat(), "url": "#"},
        {"title": "Festive demand pushes gold higher in India", "description": "Demand is heavily increasing inside India...", "source": "Sample News", "published_at": datetime.datetime.now().isoformat(), "url": "#"},
        {"title": "RBI policy uncertainty weighs on bullion", "description": "RBI has brought doubts...", "source": "Sample News", "published_at": datetime.datetime.now().isoformat(), "url": "#"},
        {"title": "Gold hits new high as inflation fears grow", "description": "Inflation has driven gold value up.", "source": "Sample News", "published_at": datetime.datetime.now().isoformat(), "url": "#"}
    ]
    
    url = "https://newsapi.org/v2/everything"
    params = {
        "q": "gold price india",
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": n,
        "apiKey": api_key
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        if response.status_code == 200:
            data = response.json()
            articles = data.get("articles", [])
            if len(articles) > 0:
                results = []
                for a in articles:
                    results.append({
                        "title": a.get("title") or "",
                        "description": a.get("description") or "",
                        "source": a.get("source", {}).get("name", "Unknown Source"),
                        "published_at": a.get("publishedAt", ""),
                        "url": a.get("url", "")
                    })
                return results
                
        # If API failed or returned 0 articles
        print(f"Warning: News API returned status {response.status_code} or 0 articles. Using fallback headlines.")
        return fallback_headlines
        
    except Exception as e:
        print(f"Warning: Exception while fetching news: {e}. Using fallback headlines.")
        return fallback_headlines

def classify_headlines(headlines, pipe=None):
    """
    Runs FinBERT on headlines to yield positive/negative/neutral labels and a sentiment score.
    """
    if pipe is None:
        pipe = load_finbert()
        
    results = []
    for h in headlines:
        title = h.get("title", "")
        desc = h.get("description", "")
        
        # Combine title and description and truncate safely for the BERT model max length (512 tokens usually)
        # We'll truncate roughly to 512 characters which is comfortably below token limit
        text = f"{title} {desc}".strip()[:512]
        if not text:
            text = "Financial news regarding gold prices."
            
        scores = pipe(text)
        
        # pipeline with top_k=None returns list of dicts for each sentence, so `scores[0]` is our item's scores
        score_list = scores[0] if isinstance(scores[0], list) else scores
        
        pos_score = 0
        neg_score = 0
        neu_score = 0
        
        for s in score_list:
            if s['label'] == 'positive': pos_score = s['score']
            elif s['label'] == 'negative': neg_score = s['score']
            elif s['label'] == 'neutral': neu_score = s['score']
            
        sentiment_score = pos_score - neg_score
        
        if sentiment_score > 0.1:
            label = "Positive"
        elif sentiment_score < -0.1:
            label = "Negative"
        else:
            label = "Neutral"
            
        results.append({
            "title": h['title'],
            "source": h['source'],
            "published_at": h['published_at'],
            "sentiment_score": sentiment_score,
            "label": label,
            "url": h['url']
        })
        
    return pd.DataFrame(results)

def get_composite_sentiment(headlines_df):
    """
    Computes weighted composite score based on source rep using Paper 4 weights.
    """
    high_rep_sources = ["Reuters", "Bloomberg", "Economic Times", "Mint", "Hindu"]
    
    total_score = 0
    total_weight = 0
    
    pos_count = len(headlines_df[headlines_df["label"] == "Positive"])
    neg_count = len(headlines_df[headlines_df["label"] == "Negative"])
    neu_count = len(headlines_df[headlines_df["label"] == "Neutral"])
    
    for _, row in headlines_df.iterrows():
        source = str(row["source"])
        score = row["sentiment_score"]
        
        weight = 0.72  # standard news rating
        for hr_source in high_rep_sources:
            if hr_source.lower() in source.lower():
                weight = 0.75
                break
                
        total_score += (score * weight)
        total_weight += weight
        
    if total_weight > 0:
        composite_score = total_score / total_weight
    else:
        composite_score = 0.0
        
    if composite_score > 0.1:
        signal = "BULLISH"
        dom_label = "Positive"
    elif composite_score < -0.1:
        signal = "BEARISH"
        dom_label = "Negative"
    else:
        signal = "NEUTRAL"
        dom_label = "Neutral"
        
    return {
        "composite_score": round(composite_score, 2),
        "signal": signal,
        "positive_count": pos_count,
        "negative_count": neg_count,
        "neutral_count": neu_count,
        "total_articles": len(headlines_df),
        "dominant_label": dom_label
    }

def get_sentiment_summary(api_key):
    """
    Master function handling fetch -> classify -> compute securely.
    """
    try:
        headlines = fetch_gold_news(api_key)
        df = classify_headlines(headlines)
        composite_info = get_composite_sentiment(df)
        
        composite_info["articles_df"] = df
        return composite_info
        
    except Exception as e:
        print(f"Error in get_sentiment_summary: {e}. Returning safe defaults.")
        
        # Build safe defaults manually
        fallback_headlines = fetch_gold_news("invalid") 
        fallback_df = pd.DataFrame([{
             "title": h["title"], "source": h["source"], "published_at": h["published_at"], 
             "sentiment_score": 0.0, "label": "Neutral", "url": h["url"]
        } for h in fallback_headlines])
        
        return {
            "composite_score": 0.0,
            "signal": "NEUTRAL",
            "positive_count": 0,
            "negative_count": 0,
            "neutral_count": 5,
            "total_articles": 5,
            "dominant_label": "Neutral",
            "articles_df": fallback_df
        }

def plot_sentiment_feed(articles_df):
    """
    Returns a horizontal bar chart mapping each headline to its sentiment score.
    """
    df = articles_df.copy()
    
    colors = []
    for val in df['sentiment_score']:
        if val > 0.1:
            colors.append('green')
        elif val < -0.1:
            colors.append('red')
        else:
            colors.append('grey')
            
    fig = go.Figure(go.Bar(
        x=df['sentiment_score'],
        # Truncate title strings neatly so they don't block the screen
        y=df['title'].apply(lambda x: x[:50] + "..." if isinstance(x, str) and len(x) > 50 else str(x)),
        orientation='h',
        marker_color=colors
    ))
    
    fig.update_layout(
        title="News Sentiment — FinBERT Model (Paper 1 + Paper 4)",
        xaxis_title="Sentiment Score (+1 Bullish, -1 Bearish)",
        yaxis_title="Headlines",
        template="plotly_white",
        yaxis=dict(autorange="reversed") # Put the newest items at the top
    )
    return fig

def get_alert_trigger(composite_score):
    if composite_score < -0.3:
        return {
            "trigger": True, 
            "message": "BEARISH ALERT: Strong negative sentiment detected. Historically precedes price drops within 3-5 days (Paper 1 finding)."
        }
    return {
        "trigger": False, 
        "message": "Sentiment within normal range."
    }

if __name__ == "__main__":
    api_key = getattr(config, "NEWS_API_KEY", "")
    print("Testing News Sentiment Analysis Module...")
    summary = get_sentiment_summary(api_key)
    
    print(f"\n--- Sentiment Summary ---")
    print(f"Composite Score: {summary['composite_score']}")
    print(f"Overall Signal:  {summary['signal']}")
    print(f"Article Tally:   Pos({summary['positive_count']}), Neg({summary['negative_count']}), Neu({summary['neutral_count']})\n")
    
    print("Article Breakdown:")
    for _, row in summary['articles_df'].iterrows():
        print(f"  [{row['label']:^8}] {row['title'][:70]} (Score: {row['sentiment_score']:.2f})")
