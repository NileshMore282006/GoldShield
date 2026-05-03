import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from './api.js';

const AppContext = createContext(null);

const fmtDate = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function AppProvider({ children }) {
  const [livePrice, setLivePrice] = useState(null);
  const [prevClose, setPrevClose] = useState(null);
  const [risk, setRisk] = useState(null);
  const [dashData, setDashData] = useState(null);

  // ── Global data cache (shared across all pages, no re-fetch on navigation) ──
  const [macroData, setMacroData] = useState(null);
  const [volData, setVolData]     = useState(null);
  const [fcData, setFcData]       = useState(null);
  const [mktHistData, setMktHistData] = useState(null);
  const [sentData, setSentData]   = useState(null);
  const [globalLoading, setGlobalLoading] = useState(true);
  const lastFetchRef = useRef(null);
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  const [orders, setOrders] = useState(() => JSON.parse(localStorage.getItem('gs_orders') || '[]'));
  const [nextOrderId, setNextOrderId] = useState(() => parseInt(localStorage.getItem('gs_next_id') || '1001'));
  const [walletBalance, setWalletBalance] = useState(() => parseFloat(localStorage.getItem('gs_wallet') || '500000'));
  const [transactions, setTransactions] = useState(() => JSON.parse(localStorage.getItem('gs_txns') || '[]'));
  const [alertEmail, setAlertEmail] = useState(() => localStorage.getItem('gs_alert_email') || '');
  const [alertPrice, setAlertPrice] = useState(() => parseFloat(localStorage.getItem('gs_alert_price') || '10000'));
  const [hedgeProfile, setHedgeProfile] = useState('balanced');
  const [toasts, setToasts] = useState([]);
  const [isOffline, setIsOffline] = useState(false);

  // Position engine state
  const [positions, setPositions] = useState(() => JSON.parse(localStorage.getItem('gs_positions') || '[]'));
  const [nextPositionId, setNextPositionId] = useState(() => parseInt(localStorage.getItem('gs_pos_id') || '1'));

  // Bank accounts
  const [bankAccounts, setBankAccounts] = useState(() => JSON.parse(localStorage.getItem('gs_banks') || '[]'));

  // Derived values
  const lockedMargin = positions.filter(p => p.status === 'OPEN').reduce((s, p) => s + (p.margin_locked || 0), 0);
  const todayMtm = positions.filter(p => p.status === 'OPEN').reduce((s, p) => s + (p.current_mtm || 0), 0);
  const freeBalance = Math.max(0, walletBalance - lockedMargin);

  // Persist
  useEffect(() => {
    localStorage.setItem('gs_orders', JSON.stringify(orders));
    localStorage.setItem('gs_next_id', nextOrderId);
  }, [orders, nextOrderId]);

  useEffect(() => {
    localStorage.setItem('gs_wallet', walletBalance);
    localStorage.setItem('gs_txns', JSON.stringify(transactions));
  }, [walletBalance, transactions]);

  useEffect(() => {
    localStorage.setItem('gs_alert_email', alertEmail);
    localStorage.setItem('gs_alert_price', alertPrice);
  }, [alertEmail, alertPrice]);

  useEffect(() => {
    localStorage.setItem('gs_positions', JSON.stringify(positions));
    localStorage.setItem('gs_pos_id', nextPositionId);
  }, [positions, nextPositionId]);

  useEffect(() => {
    localStorage.setItem('gs_banks', JSON.stringify(bankAccounts));
  }, [bankAccounts]);


  // ── Global preload — called once on app start, shared by all pages ──
  const preloadData = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && lastFetchRef.current && (now - lastFetchRef.current) < CACHE_TTL && dashData) return;

    setGlobalLoading(true);

    // 1. Critical path — dashboard-data (gold price, risk, decision, sentiment cache)
    const d = await apiFetch('/dashboard-data', {}, 60000);
    if (d) {
      setDashData(d);
      setLivePrice(d.gold_price);
      setIsOffline(false);
    } else {
      setIsOffline(true);
      setGlobalLoading(false);
      return;
    }

    // 2. Secondary — macro, volatility, forecast in parallel
    const [mac, vol, fc] = await Promise.all([
      apiFetch('/api/macro', {}, 30000),
      apiFetch('/api/volatility-history', {}, 30000),
      apiFetch('/api/forecast', {}, 30000),
    ]);
    if (mac) setMacroData(mac);
    if (vol) setVolData(vol);
    if (fc)  setFcData(fc);

    setGlobalLoading(false);
    lastFetchRef.current = Date.now();

    // 3. Background — slower endpoints, non-blocking
    apiFetch('/api/market-data', {}, 60000).then(h => { if (h) setMktHistData(h); });
    apiFetch('/api/sentiment',   {}, 30000).then(s => { if (s) setSentData(s); });
  }, [dashData]);

  // Auto-preload once on mount
  useEffect(() => { preloadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(message, type = 'info') {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }

  // ── Orders ──
  function addOrder(order) {
    const newOrder = { ...order, id: nextOrderId, status: 'Active', hedged: false };
    setOrders(prev => [...prev, newOrder]);
    setNextOrderId(prev => prev + 1);
    return newOrder;
  }
  function updateOrder(id, patch) { setOrders(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o)); }
  function deleteOrder(id) { setOrders(prev => prev.filter(o => o.id !== id)); }

  // ── Wallet ──
  function addTransaction(txn) {
    const full = {
      id: `TXN${Date.now()}`,
      datetime: fmtDate(),
      type: txn.type,
      amount: txn.amount,
      mode: txn.mode || 'System',
      reference: txn.reference || `REF${Date.now()}`,
      status: txn.status || 'Completed',
      note: txn.note || '',
    };
    setTransactions(t => [...t, full]);
    return full;
  }

  function deposit(amt, mode = 'Manual', note = '') {
    setWalletBalance(b => b + amt);
    addTransaction({ type: 'deposit', amount: amt, mode, note, reference: `DEP${Date.now()}` });
  }

  function withdraw(amt, mode = 'NEFT', note = '') {
    if (amt > freeBalance) return false;
    if (amt < 1000) return false;
    setWalletBalance(b => Math.max(0, b - amt));
    addTransaction({ type: 'withdrawal', amount: amt, mode, note, reference: `WIT${Date.now()}` });
    return true;
  }

  // ── Positions ──
  function openPosition({ orderId, lots, entryPrice, marginLocked, contractMonth, expiryDate, lotSize = 100 }) {
    const posId = `H${String(nextPositionId).padStart(3, '0')}`;
    const pos = {
      position_id: posId,
      order_id: orderId,
      direction: 'SELL',
      lots,
      lot_size: lotSize,
      entry_price: entryPrice,
      entry_time: new Date().toISOString(),
      contract_month: contractMonth,
      expiry_date: expiryDate,
      margin_locked: marginLocked,
      status: 'OPEN',
      mtm_history: [],
      current_mtm: 0,
      current_price: entryPrice,
      close_price: null,
      close_time: null,
      final_pnl: null,
    };
    setPositions(prev => [...prev, pos]);
    setNextPositionId(prev => prev + 1);
    // Lock margin from wallet
    setWalletBalance(b => b - marginLocked);
    addTransaction({ type: 'margin_lock', amount: marginLocked, mode: 'System', note: `Margin locked for position ${posId}`, reference: posId });
    return pos;
  }

  function closePosition(positionId, currentPrice) {
    setPositions(prev => prev.map(p => {
      if (p.position_id !== positionId) return p;
      const pnl = (p.entry_price - currentPrice) * p.lots * p.lot_size;
      const closed = { ...p, status: 'CLOSED', close_price: currentPrice, close_time: new Date().toISOString(), final_pnl: pnl };
      // Release margin + settle PnL
      setWalletBalance(b => b + p.margin_locked + pnl);
      addTransaction({ type: 'margin_release', amount: p.margin_locked, mode: 'System', note: `Margin released for ${positionId}`, reference: positionId });
      if (pnl !== 0) {
        addTransaction({ type: pnl >= 0 ? 'mtm_credit' : 'mtm_debit', amount: Math.abs(pnl), mode: 'System', note: `Final P&L for ${positionId}`, reference: positionId });
      }
      return closed;
    }));
  }

  function updatePositionMTM(positionId, currentPrice) {
    setPositions(prev => prev.map(p => {
      if (p.position_id !== positionId || p.status !== 'OPEN') return p;
      const mtm = (p.entry_price - currentPrice) * p.lots * p.lot_size;
      const today = new Date().toLocaleDateString('en-IN');
      const existingEntry = p.mtm_history.find(h => h.date === today);
      const newHistory = existingEntry
        ? p.mtm_history.map(h => h.date === today ? { ...h, mtm, price: currentPrice } : h)
        : [...p.mtm_history, { date: today, price: currentPrice, mtm }];
      return { ...p, current_price: currentPrice, current_mtm: mtm, mtm_history: newHistory };
    }));
  }

  function rolloverPosition(positionId, newContractMonth, newExpiryDate, currentPrice, newEntryPrice) {
    setPositions(prev => prev.map(p => {
      if (p.position_id !== positionId) return p;
      const rollCost = Math.abs(newEntryPrice - currentPrice) * p.lots * p.lot_size;
      addTransaction({ type: 'position_open', amount: rollCost, mode: 'System', note: `Roll-over: ${p.contract_month} → ${newContractMonth}`, reference: positionId });
      return { ...p, contract_month: newContractMonth, expiry_date: newExpiryDate, entry_price: newEntryPrice, current_price: newEntryPrice, current_mtm: 0, mtm_history: [] };
    }));
  }

  // ── Bank Accounts ──
  function linkBankAccount(acc) {
    const full = { ...acc, id: `BANK${Date.now()}`, verified: false };
    setBankAccounts(prev => [...prev, full]);
    return full;
  }
  function verifyBankAccount(id) { setBankAccounts(prev => prev.map(b => b.id === id ? { ...b, verified: true } : b)); }
  function removeBankAccount(id) { setBankAccounts(prev => prev.filter(b => b.id !== id)); }

  return (
    <AppContext.Provider value={{
      livePrice, setLivePrice, prevClose, setPrevClose, risk, setRisk, dashData, setDashData,
      // Global data cache — shared across all pages, no re-fetch on navigation
      macroData, volData, fcData, mktHistData, sentData,
      globalLoading, preloadData,
      orders, addOrder, updateOrder, deleteOrder, nextOrderId,
      walletBalance, deposit, withdraw, transactions, addTransaction,
      lockedMargin, todayMtm, freeBalance,
      positions, openPosition, closePosition, updatePositionMTM, rolloverPosition,
      bankAccounts, linkBankAccount, verifyBankAccount, removeBankAccount,
      alertEmail, setAlertEmail, alertPrice, setAlertPrice,
      hedgeProfile, setHedgeProfile, toasts, showToast, isOffline, setIsOffline,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
