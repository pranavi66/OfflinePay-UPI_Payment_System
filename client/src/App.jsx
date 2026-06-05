import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  WifiOff, 
  Wallet, 
  Send, 
  QrCode, 
  History, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  ArrowRight,
  User,
  Plus,
  ArrowDownLeft,
  ArrowUpRight
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { generateOfflineSignature, verifyOfflineSignature } from './utils/crypto';
import { 
  getLocalUser, 
  setLocalUser, 
  getOfflineQueue, 
  queueTransaction, 
  getHistory, 
  fundOfflineWallet, 
  onlinePay,
  syncQueueWithServer,
  refreshOnlineBalance,
  initLocalStore,
  API_BASE_URL
} from './utils/syncManager';

export default function App() {
  // App States
  const [user, setUser] = useState(null);
  const [currentScreen, setCurrentScreen] = useState('login'); // login, register, dashboard, pay, receive, queue, history, fund
  const [isOffline, setIsOffline] = useState(!navigator.onLine); // Simulated network state aligned with browser/system
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [txHistory, setTxHistory] = useState([]);
  
  // Alert banner
  const [alert, setAlert] = useState(null);
  
  // Form states
  const [loginVpa, setLoginVpa] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  const [regName, setRegName] = useState('');
  const [regVpa, setRegVpa] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regUpiPin, setRegUpiPin] = useState('');
  
  const [fundAmount, setFundAmount] = useState('');
  const [fundPin, setFundPin] = useState('');
  
  // Handshake details
  const [payAmount, setPayAmount] = useState('');
  const [payVpa, setPayVpa] = useState('');
  const [payPin, setPayPin] = useState('');
  
  // Two-Way Handshake flow states
  const [handshakeStep, setHandshakeStep] = useState(0); // 0: Idle, 1: Request QR shown, 2: Receipt QR shown (Customer), 3: Scan receipt (Merchant)
  const [merchantReqQR, setMerchantReqQR] = useState('');
  const [customerProofQR, setCustomerProofQR] = useState('');
  const [manualQRInput, setManualQRInput] = useState('');
  const [scannedTxDetails, setScannedTxDetails] = useState(null);

  // Syncing state spinner
  const [syncing, setSyncing] = useState(false);

  // Auto-initialize local store
  useEffect(() => {
    initLocalStore();
    const storedUser = getLocalUser();
    if (storedUser) {
      setUser(storedUser);
      setCurrentScreen('dashboard');
      setOfflineQueue(getOfflineQueue());
      setTxHistory(getHistory());
    }
  }, []);

  // Set timeout to clear alerts
  useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => setAlert(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [alert]);

  // Listen to system internet connectivity changes
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      triggerAlert('info', "System connected to the internet. Switching to ONLINE mode.");
    };
    const handleOffline = () => {
      setIsOffline(true);
      triggerAlert('warning', "System disconnected from the internet. Switching to OFFLINE mode.");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Periodic Auto-Sync when Online
  useEffect(() => {
    const autoSyncInterval = setInterval(async () => {
      if (!isOffline && navigator.onLine && user) {
        try {
          const res = await syncQueueWithServer(user.vpa);
          if (res.success && res.syncedCount > 0) {
            triggerAlert('success', `Auto-synced ${res.syncedCount} offline transactions with server!`);
            setOfflineQueue(getOfflineQueue());
            setTxHistory(getHistory());
            setUser(getLocalUser());
          }
        } catch (e) {
          console.log("Background sync error (normal if offline/server down):", e.message);
        }
      }
    }, 15000); // Check every 15 seconds

    return () => clearInterval(autoSyncInterval);
  }, [isOffline, user]);

  const triggerAlert = (type, text) => {
    setAlert({ type, text });
  };

  // Switch Offline Mode
  const toggleOfflineMode = () => {
    const newState = !isOffline;
    setIsOffline(newState);
    triggerAlert('info', `Simulated Mode switched to: ${newState ? 'OFFLINE' : 'ONLINE'}`);
  };

  // Authentications
  const handleRegister = async (e) => {
    e.preventDefault();
    if (isOffline) {
      triggerAlert('error', "Registration requires an active online connection.");
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: regName, vpa: regVpa, password: regPassword, upiPin: regUpiPin })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Registration failed");
      }
      
      triggerAlert('success', "Registration successful! Please login.");
      setCurrentScreen('login');
      // Autofill VPA
      setLoginVpa(regVpa);
      setRegName('');
      setRegVpa('');
      setRegPassword('');
      setRegUpiPin('');
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isOffline) {
      triggerAlert('error', "Authentication requires online mode.");
      return;
    }
    
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vpa: loginVpa, password: loginPassword })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }
      
      setLocalUser(data.user);
      setUser(data.user);
      setOfflineQueue(getOfflineQueue());
      setTxHistory(getHistory());
      setCurrentScreen('dashboard');
      triggerAlert('success', `Welcome back, ${data.user.name}!`);
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const handleLogout = () => {
    setLocalUser(null);
    setUser(null);
    setCurrentScreen('login');
  };

  // Fund Wallet Online
  const handleFundWallet = async (e) => {
    e.preventDefault();
    if (isOffline) {
      triggerAlert('error', "Funding Wallet requires online network connection!");
      return;
    }
    
    try {
      if (!fundPin) {
        throw new Error("UPI PIN is required!");
      }
      if (fundPin !== user.upiPin) {
        throw new Error("Invalid UPI PIN! Authorization failed.");
      }
      
      const amount = parseFloat(fundAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Enter a valid positive amount");
      }
      
      const res = await fundOfflineWallet(user.vpa, amount);
      triggerAlert('success', `Successfully pre-loaded ₹${amount} into Offline Wallet!`);
      setUser(getLocalUser());
      setFundAmount('');
      setFundPin('');
      setCurrentScreen('dashboard');
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  // Manual Trigger Sync
  const triggerSync = async () => {
    if (isOffline) {
      triggerAlert('error', "Turn online to sync local transaction queue.");
      return;
    }
    
    setSyncing(true);
    try {
      const res = await syncQueueWithServer(user.vpa);
      if (res.success) {
        if (res.syncedCount > 0) {
          triggerAlert('success', `Successfully reconciled ${res.syncedCount} pending payments!`);
        } else {
          triggerAlert('success', "All transaction records are up to date!");
        }
        setUser(getLocalUser());
        setOfflineQueue(getOfflineQueue());
        setTxHistory(getHistory());
      }
    } catch (err) {
      triggerAlert('error', `Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // Initiate QR Generation (Merchant Mode - Bob)
  const generateMerchantRequest = (e) => {
    e.preventDefault();
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) {
      triggerAlert('error', "Please enter a valid amount");
      return;
    }
    
    const txId = `TXN-${Date.now()}`;
    const qrPayload = {
      type: 'PAY_REQ',
      receiverVpa: user.vpa,
      receiverName: user.name,
      amount,
      txId
    };
    
    setMerchantReqQR(JSON.stringify(qrPayload));
    setHandshakeStep(1); // Show Request QR Code
    triggerAlert('info', "Payment Request QR Generated. Show this to the sender.");
  };

  // Scan QR Code Simulation
  const handleDecodeQR = () => {
    if (!manualQRInput) return;
    try {
      const parsed = JSON.parse(manualQRInput);
      
      if (parsed.type === 'PAY_REQ') {
        // Customer side scanning merchant request
        setScannedTxDetails(parsed);
        setManualQRInput('');
        triggerAlert('success', "Decoded Merchant Payment Request!");
      } else if (parsed.type === 'PAY_PROOF') {
        // Merchant side scanning customer receipt
        verifyCustomerProof(parsed);
      } else {
        triggerAlert('error', "Invalid QR Code payload format");
      }
    } catch (e) {
      triggerAlert('error', "Failed to decode QR: Invalid JSON format");
    }
  };

  // ── UPI Payment: Online path uses /api/pay (instant debit+credit);
  //               Offline path queues signed transaction for later sync.
  const handleDirectPayment = async (e) => {
    e.preventDefault();
    
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) {
      triggerAlert('error', "Please enter a valid positive amount");
      return;
    }
    if (!payVpa || !payVpa.includes('@')) {
      triggerAlert('error', "Invalid recipient UPI ID (VPA) format.");
      return;
    }
    if (payVpa.toLowerCase() === user.vpa.toLowerCase()) {
      triggerAlert('error', "You cannot pay to your own UPI ID!");
      return;
    }
    if (!payPin) {
      triggerAlert('error', "UPI PIN is required!");
      return;
    }

    // ─── ONLINE PAYMENT (server validates PIN, deducts sender, credits receiver) ───
    if (!isOffline && navigator.onLine) {
      try {
        const result = await onlinePay({
          senderVpa: user.vpa,
          receiverVpa: payVpa,
          amount,
          upiPin: payPin
        });

        // Update local state with server-confirmed balances
        setUser(getLocalUser());
        setTxHistory(getHistory());
        setPayVpa('');
        setPayAmount('');
        setPayPin('');

        // Show success receipt
        const proofPayload = {
          type: 'PAY_PROOF',
          txId: result.txId,
          senderVpa: user.vpa,
          senderName: user.name,
          receiverVpa: payVpa,
          amount,
          timestamp: result.timestamp,
          signature: result.transaction.signature
        };
        setCustomerProofQR(JSON.stringify(proofPayload));
        setHandshakeStep(2);
        triggerAlert('success', `✅ ₹${amount} paid to ${payVpa} instantly! Receiver balance updated.`);
      } catch (err) {
        triggerAlert('error', err.message);
      }
      return; // done — no offline queue needed
    }

    // ─── OFFLINE PAYMENT (deduct locally, queue signed tx for sync later) ───
    if (payPin !== user.upiPin) {
      triggerAlert('error', "Invalid UPI PIN! Payment failed.");
      return;
    }

    const currentOfflineBalance = user.offlineWalletBalance || 0;
    if (currentOfflineBalance < amount) {
      triggerAlert('error', `Insufficient offline wallet balance. Available: ₹${currentOfflineBalance.toFixed(2)}`);
      return;
    }

    const txId = `TXN-${Date.now()}`;
    const timestamp = new Date().toISOString();
    const signature = generateOfflineSignature(user.vpa, payVpa, amount, timestamp, txId);

    const offlineTx = {
      txId,
      type: 'PAY',
      senderVpa: user.vpa,
      senderName: user.name,
      receiverVpa: payVpa,
      receiverName: payVpa.split('@')[0],
      amount,
      timestamp,
      signature,
      status: 'PENDING_SYNC'
    };

    // Deduct from sender's local offline wallet balance
    const updatedUser = { ...user, offlineWalletBalance: parseFloat((currentOfflineBalance - amount).toFixed(2)) };
    setLocalUser(updatedUser);
    setUser(updatedUser);

    // Queue for sync when internet returns
    queueTransaction(offlineTx);
    setOfflineQueue(getOfflineQueue());
    setTxHistory(getHistory());

    // Show offline receipt QR
    const proofPayload = {
      type: 'PAY_PROOF',
      txId,
      senderVpa: user.vpa,
      senderName: user.name,
      receiverVpa: payVpa,
      amount,
      timestamp,
      signature
    };
    setCustomerProofQR(JSON.stringify(proofPayload));
    setHandshakeStep(2);
    setPayVpa('');
    setPayAmount('');
    setPayPin('');
    triggerAlert('success', `📴 ₹${amount} queued offline. Show Receipt QR to merchant. Will sync when online.`);
  };

  // Verify Customer Receipt (Merchant Side - Bob Scans Alice's Proof)
  const verifyCustomerProof = (proof) => {
    const isValid = verifyOfflineSignature(proof);
    
    if (!isValid) {
      triggerAlert('error', "Cryptographic Signature Validation Failed! Invalid receipt.");
      return;
    }

    // Add to Merchant Queue
    const merchantTx = {
      txId: proof.txId,
      type: 'RECEIVE',
      senderVpa: proof.senderVpa,
      senderName: proof.senderName,
      receiverVpa: user.vpa,
      receiverName: user.name,
      amount: proof.amount,
      timestamp: proof.timestamp,
      signature: proof.signature,
      status: 'CONFIRMED_OFFLINE'
    };

    queueTransaction(merchantTx);
    setOfflineQueue(getOfflineQueue());
    setTxHistory(getHistory());
    setManualQRInput('');

    triggerAlert('success', `Verification Successful! Offline payment of ₹${proof.amount} registered.`);
    setHandshakeStep(0);
    setCurrentScreen('dashboard');
  };

  // Quick helper to run one-click simulation flow inside a single window
  const triggerAutoDemoFlow = () => {
    // We will simulate Bob (Merchant) requesting ₹120 from Alice (Test User)
    // 1. bob@offlinepay makes request
    const mockTxId = `TXN-DEMO-${Date.now()}`;
    const mockReq = {
      type: 'PAY_REQ',
      receiverVpa: 'canteen@offlinepay',
      receiverName: 'Campus Canteen',
      amount: 120,
      txId: mockTxId
    };

    // 2. Decode this request as Alice
    setScannedTxDetails(mockReq);
    setCurrentScreen('pay');
    triggerAlert('info', "Simulating: Scanned ₹120 request from Campus Canteen!");
  };

  return (
    <div className="app-container">
      {/* simulated Offline Banner */}
      {isOffline && (
        <div className="offline-banner">
          <WifiOff size={16} />
          <span>App is currently OFFLINE (Simulated)</span>
        </div>
      )}

      {/* Header */}
      <header>
        <div className="logo-section">
          <QrCode className="logo-icon" size={24} />
          <span className="logo-text">OfflinePay</span>
        </div>

        {user && (
          <nav className="header-nav">
            <div 
              className={`header-nav-item ${currentScreen === 'dashboard' ? 'active' : ''}`}
              onClick={() => setCurrentScreen('dashboard')}
            >
              <Wallet size={16} />
              <span>Wallet</span>
            </div>
            <div 
              className={`header-nav-item ${currentScreen === 'pay' ? 'active' : ''}`}
              onClick={() => { setHandshakeStep(0); setCurrentScreen('pay'); }}
            >
              <Send size={16} />
              <span>Pay</span>
            </div>
            <div 
              className={`header-nav-item ${currentScreen === 'receive' ? 'active' : ''}`}
              onClick={() => { setHandshakeStep(0); setCurrentScreen('receive'); }}
            >
              <QrCode size={16} />
              <span>Receive</span>
            </div>
            <div 
              className={`header-nav-item ${currentScreen === 'history' ? 'active' : ''}`}
              onClick={() => {
                setTxHistory(getHistory());
                setCurrentScreen('history');
              }}
            >
              <History size={16} />
              <span>History</span>
            </div>
            <div className="header-nav-item logout" onClick={handleLogout}>
              <WifiOff size={16} />
              <span>Logout</span>
            </div>
          </nav>
        )}

        <button 
          onClick={toggleOfflineMode} 
          className={`network-toggle ${isOffline ? 'offline' : 'online'}`}
        >
          <span className="status-dot"></span>
          <span>{isOffline ? 'Offline' : 'Online'}</span>
        </button>
      </header>

      {/* Alert System */}
      {alert && (
        <div style={{ padding: '0 20px', marginTop: '15px' }}>
          <div className={`alert-box ${alert.type}`}>
            {alert.type === 'error' ? <XCircle size={14} style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline' }} /> : 
             alert.type === 'success' ? <CheckCircle2 size={14} style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline' }} /> : 
             <AlertCircle size={14} style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline' }} />}
            <span>{alert.text}</span>
          </div>
        </div>
      )}

      {/* Screens Router */}
      <main>
        {/* LOGIN SCREEN */}
        {currentScreen === 'login' && (
          <div className="glass-card form-container" style={{ marginTop: '40px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '20px', textAlign: 'center' }}>Login</h2>
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label>UPI ID (VPA)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. test@offlinepay"
                  value={loginVpa}
                  onChange={(e) => setLoginVpa(e.target.value)}
                  required 
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required 
                />
              </div>
              <button type="submit" className="submit-btn">Login</button>
            </form>
            <p style={{ textAlign: 'center', marginTop: '15px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Don't have an account?{' '}
              <span 
                onClick={() => setCurrentScreen('register')} 
                style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: '600' }}
              >
                Register here
              </span>
            </p>
          </div>
        )}

        {/* REGISTER SCREEN */}
        {currentScreen === 'register' && (
          <div className="glass-card form-container" style={{ marginTop: '20px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '20px', textAlign: 'center' }}>Register</h2>
            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label>Full Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Your Name"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  required 
                />
              </div>
              <div className="form-group">
                <label>Desired VPA (UPI ID)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. yourname@offlinepay"
                  value={regVpa}
                  onChange={(e) => setRegVpa(e.target.value)}
                  required 
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="••••••••"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required 
                />
              </div>
              <div className="form-group">
                <label>Set 4-Digit UPI PIN (for authorizing payments)</label>
                <input 
                  type="password" 
                  maxLength={4}
                  className="form-input" 
                  placeholder="••••"
                  value={regUpiPin}
                  onChange={(e) => setRegUpiPin(e.target.value.replace(/\D/g, ''))}
                  required 
                />
              </div>
              <button type="submit" className="submit-btn">Create Account</button>
            </form>
            <p style={{ textAlign: 'center', marginTop: '15px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Already have an account?{' '}
              <span 
                onClick={() => setCurrentScreen('login')} 
                style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: '600' }}
              >
                Login
              </span>
            </p>
          </div>
        )}

        {/* DASHBOARD SCREEN */}
        {currentScreen === 'dashboard' && user && (
          <div className="dashboard-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Wallet Balance Card */}
              <div className="glass-card wallet-card">
                <div className="wallet-content">
                  <div className="wallet-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <User size={16} />
                      <span className="wallet-holder">{user.name}</span>
                    </div>
                    <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '20px' }}>
                      {user.vpa}
                    </span>
                  </div>
                  
                  <div className="wallet-balances">
                    <div className="balance-item">
                      <span className="balance-label">Offline Wallet Balance</span>
                      <span className="balance-val offline-wallet">₹{user.offlineWalletBalance.toFixed(2)}</span>
                    </div>
                    <div className="balance-item" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}>
                      <span className="balance-label">Bank Account Balance (Online)</span>
                      <span className="balance-val" style={{ fontSize: '18px' }}>₹{user.bankBalance.toFixed(2)}</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => setCurrentScreen('fund')} 
                    className="fund-wallet-btn"
                    disabled={isOffline}
                    title={isOffline ? "Online connection needed to allocate offline funds" : ""}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <Plus size={18} />
                      <span>Load Offline Wallet</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="actions-grid">
                <button onClick={() => { setHandshakeStep(0); setCurrentScreen('pay'); }} className="action-btn">
                  <Send />
                  <span style={{ fontWeight: '600', fontSize: '14px' }}>Scan & Pay</span>
                </button>
                
                <button onClick={() => { setHandshakeStep(0); setCurrentScreen('receive'); }} className="action-btn">
                  <QrCode />
                  <span style={{ fontWeight: '600', fontSize: '14px' }}>Receive (QR)</span>
                </button>
              </div>

              {/* Demo Helper Widget */}
              <div className="glass-card" style={{ background: 'rgba(168, 85, 247, 0.05)', borderColor: 'rgba(168, 85, 247, 0.2)' }}>
                <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary)', marginBottom: '8px' }}>🚀 One-Click Demo Simulators</h4>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  Simulate offline purchases within this browser window without requiring camera scanning.
                </p>
                <button onClick={triggerAutoDemoFlow} className="simulator-btn" style={{ width: '100%', justifyContent: 'center' }}>
                  Simulate Pay ₹120 to Campus Canteen
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Network Sync Dashboard Widget */}
              <div className="glass-card">
                <div className="queue-header">
                  <h3 style={{ fontSize: '15px', fontWeight: '700' }}>Offline Transaction Queue</h3>
                  <button 
                    onClick={triggerSync} 
                    disabled={isOffline || syncing} 
                    className="sync-all-btn"
                  >
                    <RefreshCw size={12} className={syncing ? 'spin-anim' : ''} />
                    <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
                  </button>
                </div>
                
                {offlineQueue.length === 0 ? (
                  <div style={{ padding: '15px 0', textSelf: 'center', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    No pending offline transactions.
                  </div>
                ) : (
                  <div className="queue-list">
                    {offlineQueue.map((tx) => {
                      const isSender = tx.senderVpa?.toLowerCase() === user.vpa.toLowerCase();
                      const otherVpa = isSender ? tx.receiverVpa : tx.senderVpa;
                      return (
                        <div key={tx.txId} className="queue-item">
                          <div className="queue-left">
                            <span className="queue-vpa">{otherVpa}</span>
                            <span className="queue-meta">
                              {isSender ? 'Sent Offline' : 'Received Offline'} • {new Date(tx.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="queue-right">
                            <span className="queue-amount" style={{ color: isSender ? '#ef4444' : '#10b981' }}>
                              {isSender ? '-' : '+'}₹{tx.amount}
                            </span>
                            <span className={`queue-status ${tx.status.toLowerCase()}`}>
                              {tx.status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* FUND OFFLINE WALLET SCREEN */}
        {currentScreen === 'fund' && user && (
          <div className="glass-card form-container">
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '15px' }}>Load Offline Wallet</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
              Allocate funds from your core Bank Account into your Offline Wallet. Securely holds currency on-device for offline transactions.
            </p>
            <form onSubmit={handleFundWallet}>
              <div className="form-group">
                <label>Amount to Allocate (₹)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  placeholder="e.g. 500"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  required 
                />
              </div>
              <div className="form-group">
                <label>Enter 4-Digit UPI PIN</label>
                <input 
                  type="password" 
                  maxLength={4}
                  className="form-input" 
                  placeholder="••••"
                  value={fundPin}
                  onChange={(e) => setFundPin(e.target.value.replace(/\D/g, ''))}
                  required 
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                <button 
                  type="button" 
                  onClick={() => setCurrentScreen('dashboard')} 
                  className="submit-btn" 
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}
                >
                  Cancel
                </button>
                <button type="submit" className="submit-btn">Authorize Load</button>
              </div>
            </form>
          </div>
        )}

        {/* PAY / SCAN SCREEN */}
        {currentScreen === 'pay' && user && (
          <div className="glass-card form-container">
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '15px', textAlign: 'center' }}>Send Money (UPI)</h3>
            
            {/* Direct Payment Form (only shown if not in receipt screen) */}
            {handshakeStep !== 2 && (
              <form onSubmit={handleDirectPayment}>
                <div className="form-group">
                  <label>Recipient UPI ID (VPA)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. canteen@offlinepay"
                    value={payVpa}
                    onChange={(e) => setPayVpa(e.target.value.trim())}
                    required 
                  />
                </div>
                
                <div className="form-group">
                  <label>Amount (₹)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="form-input" 
                    placeholder="Enter amount"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    required 
                  />
                </div>

                <div className="form-group" style={{ maxWidth: '240px', margin: '0 auto 15px' }}>
                  <label style={{ display: 'block', textAlign: 'center', marginBottom: '6px' }}>Enter 4-Digit UPI PIN</label>
                  <input 
                    type="password" 
                    maxLength={4}
                    className="form-input" 
                    style={{ textAlign: 'center', letterSpacing: '8px', fontSize: '20px', padding: '10px' }}
                    placeholder="••••"
                    value={payPin}
                    onChange={(e) => setPayPin(e.target.value.replace(/\D/g, ''))}
                    required 
                  />
                </div>

                <button type="submit" className="submit-btn" style={{ background: 'var(--primary)' }}>
                  Pay Securely
                </button>
              </form>
            )}

            {/* Step 3: Show Customer Proof QR (Alice shows receipt to Bob) */}
            {handshakeStep === 2 && customerProofQR && (
              <div style={{ textAlign: 'center' }}>
                <div className="alert-box success">
                  Payment processed successfully!
                </div>

                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                  {!navigator.onLine ? 'Show this Receipt QR to the merchant to confirm your offline payment.' : 'Payment settled instantly online. ✅'}
                </p>

                <div className="qr-container">
                  <span className="qr-label">PAYMENT PROOF</span>
                  <QRCodeSVG value={customerProofQR} size={180} />
                  <span style={{ color: '#0f172a', fontSize: '11px', fontWeight: '600' }}>Secure Payment Token</span>
                </div>

                <button 
                  onClick={() => { setHandshakeStep(0); setCurrentScreen('dashboard'); }} 
                  className="submit-btn"
                  style={{ marginTop: '20px' }}
                >
                  Return to Dashboard
                </button>
              </div>
            )}

            {handshakeStep !== 2 && (
              <button 
                onClick={() => { setPayVpa(''); setPayAmount(''); setPayPin(''); setCurrentScreen('dashboard'); }} 
                className="submit-btn" 
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', marginTop: '15px' }}
              >
                Back to Dashboard
              </button>
            )}
          </div>
        )}

        {/* RECEIVE / MERCHANT MODE SCREEN */}
        {currentScreen === 'receive' && user && (
          <div className="glass-card form-container">
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '15px' }}>Merchant Mode (Collect)</h3>
            
            {/* Step 1: Input Amount */}
            {handshakeStep === 0 && (
              <form onSubmit={generateMerchantRequest}>
                <div className="form-group">
                  <label>Amount to Collect (₹)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="Enter amount"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    required 
                  />
                </div>
                <button type="submit" className="submit-btn">Generate Collection QR</button>
              </form>
            )}

            {/* Step 2: Show QR & Await customer payment receipt */}
            {handshakeStep === 1 && merchantReqQR && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                  Show this QR to the sender to scan and pay:
                </p>

                <div className="qr-container">
                  <span className="qr-label">PAYMENT REQUEST</span>
                  <QRCodeSVG value={merchantReqQR} size={180} />
                  <span style={{ color: '#0f172a', fontSize: '12px', fontWeight: '700' }}>₹{payAmount}</span>
                </div>

                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '15px' }}>
                  Waiting for sender to complete payment...
                </p>
              </div>
            )}

            <button 
              onClick={() => { setHandshakeStep(0); setPayAmount(''); setCurrentScreen('dashboard'); }} 
              className="submit-btn" 
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', marginTop: '15px' }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* TRANSACTION HISTORY SCREEN */}
        {currentScreen === 'history' && (
          <div className="glass-card form-container">
            <h3 className="history-title">Transaction History</h3>
            
            {txHistory.length === 0 ? (
              <div className="history-empty">
                No transactions completed yet.
              </div>
            ) : (
              <div className="queue-list">
                {txHistory.map((tx) => {
                  const isSender = tx.senderVpa?.toLowerCase() === user?.vpa?.toLowerCase();
                  const otherVpa = isSender ? tx.receiverVpa : tx.senderVpa;
                  return (
                    <div key={tx.txId} className="queue-item" style={{ background: 'rgba(255, 255, 255, 0.01)' }}>
                      <div className="queue-left">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {isSender ? (
                            <ArrowUpRight size={14} style={{ color: 'var(--danger)' }} />
                          ) : (
                            <ArrowDownLeft size={14} style={{ color: 'var(--accent)' }} />
                          )}
                          <span className="queue-vpa" style={{ fontWeight: '600' }}>
                            {isSender ? `To: ${otherVpa}` : `From: ${otherVpa}`}
                          </span>
                        </div>
                        <span className="queue-meta" style={{ fontSize: '10px' }}>
                          {new Date(tx.timestamp).toLocaleString()}
                        </span>
                        {tx.failureReason && (
                          <span style={{ fontSize: '10px', color: 'var(--danger)' }}>
                            Err: {tx.failureReason}
                          </span>
                        )}
                      </div>
                      <div className="queue-right">
                        <span className="queue-amount" style={{ color: isSender ? '#ef4444' : '#10b981' }}>
                          {isSender ? '-' : '+'}₹{tx.amount}
                        </span>
                        <span className={`queue-status ${tx.status.toLowerCase().replace(/_/g, ' ')}`}>
                          {tx.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button 
              onClick={() => setCurrentScreen('dashboard')} 
              className="submit-btn" 
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', marginTop: '20px' }}
            >
              Back to Dashboard
            </button>
          </div>
        )}
      </main>

      {/* Bottom Nav Bar */}
      {user && (
        <div className="bottom-nav">
          <div 
            className={`nav-item ${currentScreen === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentScreen('dashboard')}
          >
            <Wallet />
            <span>Wallet</span>
          </div>
          <div 
            className={`nav-item ${currentScreen === 'pay' ? 'active' : ''}`}
            onClick={() => { setHandshakeStep(0); setCurrentScreen('pay'); }}
          >
            <Send />
            <span>Pay</span>
          </div>
          <div 
            className={`nav-item ${currentScreen === 'receive' ? 'active' : ''}`}
            onClick={() => { setHandshakeStep(0); setCurrentScreen('receive'); }}
          >
            <QrCode />
            <span>Receive</span>
          </div>
          <div 
            className={`nav-item ${currentScreen === 'history' ? 'active' : ''}`}
            onClick={() => {
              setTxHistory(getHistory());
              setCurrentScreen('history');
            }}
          >
            <History />
            <span>History</span>
          </div>
          <div className="nav-item" onClick={handleLogout}>
            <WifiOff style={{ color: 'var(--danger)' }} />
            <span>Logout</span>
          </div>
        </div>
      )}
    </div>
  );
}
