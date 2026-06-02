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
  syncQueueWithServer,
  refreshOnlineBalance,
  initLocalStore
} from './utils/syncManager';

export default function App() {
  // App States
  const [user, setUser] = useState(null);
  const [currentScreen, setCurrentScreen] = useState('login'); // login, register, dashboard, pay, receive, queue, history, fund
  const [isOffline, setIsOffline] = useState(false); // Simulated network state
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
  
  const [fundAmount, setFundAmount] = useState('');
  
  // Handshake details
  const [payAmount, setPayAmount] = useState('');
  const [payVpa, setPayVpa] = useState('');
  
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
      const res = await fetch('http://localhost:5001/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: regName, vpa: regVpa, password: regPassword })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Registration failed");
      }
      
      triggerAlert('success', "Registration successful! Please login.");
      setCurrentScreen('login');
      // Autofill VPA
      setLoginVpa(regVpa);
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
      const res = await fetch('http://localhost:5001/api/auth/login', {
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
      const amount = parseFloat(fundAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Enter a valid positive amount");
      }
      
      const res = await fundOfflineWallet(user.vpa, amount);
      triggerAlert('success', `Successfully pre-loaded ₹${amount} into Offline Wallet!`);
      setUser(getLocalUser());
      setFundAmount('');
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

  // Confirm Offline Payment (Customer Side - Alice)
  const confirmOfflinePayment = () => {
    if (!scannedTxDetails) return;
    
    const amount = scannedTxDetails.amount;
    const currentOfflineBalance = user.offlineWalletBalance;
    
    if (currentOfflineBalance < amount) {
      triggerAlert('error', `Insufficient offline wallet balance (Needs ₹${amount}, has ₹${currentOfflineBalance}). Fund wallet while online!`);
      return;
    }

    const timestamp = new Date().toISOString();
    
    // Generate secure offline signature
    const signature = generateOfflineSignature(
      user.vpa, 
      scannedTxDetails.receiverVpa, 
      amount, 
      timestamp, 
      scannedTxDetails.txId
    );

    const offlineTx = {
      txId: scannedTxDetails.txId,
      type: 'PAY',
      senderVpa: user.vpa,
      senderName: user.name,
      receiverVpa: scannedTxDetails.receiverVpa,
      receiverName: scannedTxDetails.receiverName,
      amount: amount,
      timestamp,
      signature,
      status: 'PENDING_SYNC'
    };

    // Deduct balance locally
    const updatedUser = {
      ...user,
      offlineWalletBalance: currentOfflineBalance - amount
    };
    setLocalUser(updatedUser);
    setUser(updatedUser);

    // Queue transaction locally
    queueTransaction(offlineTx);
    setOfflineQueue(getOfflineQueue());
    setTxHistory(getHistory());

    // Generate Payment Proof QR
    const proofPayload = {
      type: 'PAY_PROOF',
      txId: scannedTxDetails.txId,
      senderVpa: user.vpa,
      senderName: user.name,
      receiverVpa: scannedTxDetails.receiverVpa,
      amount: amount,
      timestamp,
      signature
    };

    setCustomerProofQR(JSON.stringify(proofPayload));
    setHandshakeStep(2); // Show Payment Proof Receipt QR
    setScannedTxDetails(null);
    triggerAlert('success', `₹${amount} paid offline! Show the Receipt QR to the merchant.`);
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
                    {offlineQueue.map((tx) => (
                      <div key={tx.txId} className="queue-item">
                        <div className="queue-left">
                          <span className="queue-vpa">
                            {tx.type === 'PAY' ? tx.receiverVpa : tx.senderVpa}
                          </span>
                          <span className="queue-meta">
                            {tx.type === 'PAY' ? 'Sent Offline' : 'Received Offline'} • {new Date(tx.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="queue-right">
                          <span className="queue-amount" style={{ color: tx.type === 'PAY' ? '#ef4444' : '#10b981' }}>
                            {tx.type === 'PAY' ? '-' : '+'}₹{tx.amount}
                          </span>
                          <span className={`queue-status ${tx.status.toLowerCase()}`}>
                            {tx.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    ))}
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
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '10px' }}>Scan Merchant QR</h3>
            
            {/* Step Wizard indicator */}
            <div className="step-wizard">
              <div className={`step-indicator ${scannedTxDetails ? 'completed' : 'active'}`}>
                <div className="step-dot">1</div>
                <span>Scan Merchant</span>
              </div>
              <div className={`step-indicator ${scannedTxDetails && handshakeStep === 2 ? 'completed' : scannedTxDetails ? 'active' : ''}`}>
                <div className="step-dot">2</div>
                <span>Authorize</span>
              </div>
              <div className={`step-indicator ${handshakeStep === 2 ? 'active' : ''}`}>
                <div className="step-dot">3</div>
                <span>Show Receipt</span>
              </div>
            </div>

            {/* Step 1: Scan and Decode Input */}
            {!scannedTxDetails && handshakeStep !== 2 && (
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                  Since camera hardware might not be accessible inside sandbox/VM review displays, paste the QR JSON code generated from the Merchant's screen:
                </p>
                <textarea
                  className="form-input"
                  style={{ minHeight: '80px', fontFamily: 'monospace', fontSize: '12px' }}
                  placeholder='Paste Merchant QR JSON here (e.g. {"type":"PAY_REQ",...})'
                  value={manualQRInput}
                  onChange={(e) => setManualQRInput(e.target.value)}
                />
                
                <button 
                  type="button" 
                  onClick={handleDecodeQR} 
                  className="submit-btn"
                  style={{ background: 'var(--secondary)' }}
                >
                  Confirm QR Decode
                </button>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', margin: '15px 0', paddingTop: '15px' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '700', marginBottom: '8px' }}>Test with simulated values:</h4>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button 
                      onClick={() => setManualQRInput(JSON.stringify({
                        type: 'PAY_REQ',
                        receiverVpa: 'canteen@offlinepay',
                        receiverName: 'Campus Canteen',
                        amount: 150.00,
                        txId: `TXN-MOCK-${Date.now()}`
                      }))}
                      className="simulator-btn"
                    >
                      Load Mock Canteen ₹150 QR
                    </button>
                    <button 
                      onClick={() => setManualQRInput(JSON.stringify({
                        type: 'PAY_REQ',
                        receiverVpa: 'stationery@offlinepay',
                        receiverName: 'Stationery Mart',
                        amount: 45.00,
                        txId: `TXN-MOCK-${Date.now()}`
                      }))}
                      className="simulator-btn"
                    >
                      Load Mock Stationery ₹45 QR
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Payment Approval Screen */}
            {scannedTxDetails && handshakeStep !== 2 && (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '15px', border: '1px solid var(--border-glass)', marginBottom: '20px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Paying to</span>
                  <h4 style={{ fontSize: '20px', fontWeight: '800', margin: '5px 0' }}>{scannedTxDetails.receiverName}</h4>
                  <span style={{ fontSize: '12px', color: 'var(--primary)', background: 'rgba(168, 85, 247, 0.08)', padding: '2px 8px', borderRadius: '20px' }}>
                    {scannedTxDetails.receiverVpa}
                  </span>
                  
                  <div style={{ margin: '20px 0' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Amount</span>
                    <h1 style={{ fontSize: '36px', fontWeight: '800', color: 'var(--secondary)' }}>₹{scannedTxDetails.amount}</h1>
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Transaction ID: {scannedTxDetails.txId}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => setScannedTxDetails(null)} 
                    className="submit-btn" 
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}
                  >
                    Decline
                  </button>
                  <button onClick={confirmOfflinePayment} className="submit-btn" style={{ background: 'var(--accent)' }}>
                    Confirm & Deduct
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Show Customer Proof QR (Alice shows receipt to Bob) */}
            {handshakeStep === 2 && customerProofQR && (
              <div style={{ textAlign: 'center' }}>
                <div className="alert-box success">
                  Offline payment confirmed! Wallet balance deducted.
                </div>
                
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                  Merchant must scan the Payment Proof QR below to register verification.
                </p>

                <div className="qr-container">
                  <span className="qr-label">PAYMENT PROOF</span>
                  <QRCodeSVG value={customerProofQR} size={180} />
                  <span style={{ color: '#0f172a', fontSize: '11px', fontWeight: '600' }}>Secure Offline Token</span>
                </div>

                {/* Simulated Verification triggers */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '20px', paddingTop: '15px' }}>
                  <h4 style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    Simulate scanning this receipt as the merchant:
                  </h4>
                  
                  <textarea
                    readOnly
                    className="form-input"
                    style={{ minHeight: '60px', fontFamily: 'monospace', fontSize: '10px', background: 'rgba(0,0,0,0.2)' }}
                    value={customerProofQR}
                  />

                  <button 
                    onClick={() => {
                      // Switch user context to merchant to test receipt validation in-window
                      const parsed = JSON.parse(customerProofQR);
                      
                      // For simulation: we store merchant profile in a temp variable
                      const tempMerchant = {
                        vpa: parsed.receiverVpa,
                        name: parsed.receiverVpa === 'canteen@offlinepay' ? 'Campus Canteen' : 'Stationery Mart',
                        offlineWalletBalance: 5000.00,
                        bankBalance: 5000.00
                      };
                      
                      // Perform receipt verify
                      verifyCustomerProof(parsed);
                    }}
                    className="simulator-btn"
                    style={{ width: '100%', display: 'block', margin: '10px auto' }}
                  >
                    Quick-Verify Receipt (Simulated Canteen Scan)
                  </button>
                </div>

                <button 
                  onClick={() => { setHandshakeStep(0); setCurrentScreen('dashboard'); }} 
                  className="submit-btn"
                  style={{ marginTop: '10px' }}
                >
                  Return to Dashboard
                </button>
              </div>
            )}

            {handshakeStep !== 2 && (
              <button 
                onClick={() => setCurrentScreen('dashboard')} 
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
                  Ask the sender to scan this Request QR on their device:
                </p>

                <div className="qr-container">
                  <span className="qr-label">PAYMENT REQUEST</span>
                  <QRCodeSVG value={merchantReqQR} size={180} />
                  <span style={{ color: '#0f172a', fontSize: '12px', fontWeight: '700' }}>₹{payAmount}</span>
                </div>

                <div style={{ margin: '15px 0' }}>
                  <textarea
                    readOnly
                    className="form-input"
                    style={{ minHeight: '60px', fontFamily: 'monospace', fontSize: '10px', background: 'rgba(0,0,0,0.2)' }}
                    value={merchantReqQR}
                  />
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '15px', marginTop: '15px' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '700', marginBottom: '8px' }}>Await Customer Receipt:</h4>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                    Once customer completes payment, they will show you a Payment Proof QR. Paste it below to finalize:
                  </p>
                  
                  <textarea
                    className="form-input"
                    style={{ minHeight: '60px', fontFamily: 'monospace', fontSize: '11px' }}
                    placeholder="Paste Customer Payment Proof JSON here..."
                    value={manualQRInput}
                    onChange={(e) => setManualQRInput(e.target.value)}
                  />

                  <button 
                    onClick={handleDecodeQR} 
                    className="submit-btn"
                    style={{ background: 'var(--accent)' }}
                  >
                    Verify & Confirm Receipt
                  </button>
                </div>
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
                {txHistory.map((tx) => (
                  <div key={tx.txId} className="queue-item" style={{ background: 'rgba(255, 255, 255, 0.01)' }}>
                    <div className="queue-left">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {tx.type === 'PAY' ? (
                          <ArrowUpRight size={14} style={{ color: 'var(--danger)' }} />
                        ) : (
                          <ArrowDownLeft size={14} style={{ color: 'var(--accent)' }} />
                        )}
                        <span className="queue-vpa" style={{ fontWeight: '600' }}>
                          {tx.type === 'PAY' ? tx.receiverVpa : tx.senderVpa}
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
                      <span className="queue-amount" style={{ color: tx.type === 'PAY' ? 'var(--text-primary)' : 'var(--accent)' }}>
                        {tx.type === 'PAY' ? '-' : '+'}₹{tx.amount}
                      </span>
                      <span className={`queue-status ${tx.status.toLowerCase()}`}>
                        {tx.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))}
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
