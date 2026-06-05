// Local storage state and network synchronization manager

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

// Initial state helpers
export function initLocalStore() {
  if (!localStorage.getItem('offlineQueue')) {
    localStorage.setItem('offlineQueue', JSON.stringify([]));
  }
  if (!localStorage.getItem('history')) {
    localStorage.setItem('history', JSON.stringify([]));
  }
}

export function getLocalUser() {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

export function setLocalUser(user) {
  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  } else {
    localStorage.removeItem('user');
  }
}

export function getOfflineQueue() {
  const queue = localStorage.getItem('offlineQueue');
  return queue ? JSON.parse(queue) : [];
}

export function saveOfflineQueue(queue) {
  localStorage.setItem('offlineQueue', JSON.stringify(queue));
}

export function getHistory() {
  const history = localStorage.getItem('history');
  return history ? JSON.parse(history) : [];
}

export function saveHistory(history) {
  localStorage.setItem('history', JSON.stringify(history));
}

// Add transaction to offline queue
export function queueTransaction(tx) {
  initLocalStore();
  const queue = getOfflineQueue();
  queue.push(tx);
  saveOfflineQueue(queue);

  // Add to local history list as well so it displays immediately
  const history = getHistory();
  history.unshift(tx);
  saveHistory(history);
}

// Helper to check network availability (checks both browser status & manual toggle)
export function isNetworkAvailable(manualOfflineOverride = false) {
  if (manualOfflineOverride) return false;
  return navigator.onLine;
}

// ── Online UPI Payment (atomic: deduct sender, credit receiver) ──
export async function onlinePay({ senderVpa, receiverVpa, amount, upiPin }) {
  const response = await fetch(`${API_BASE_URL}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senderVpa, receiverVpa, amount, upiPin })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Payment failed');

  // Update local user's balances from server response
  const user = getLocalUser();
  if (user) {
    user.bankBalance = data.sender.bankBalance;
    user.offlineWalletBalance = data.sender.offlineWalletBalance;
    setLocalUser(user);
  }

  // Add completed transaction to local history
  const history = getHistory();
  history.unshift({ ...data.transaction, type: 'PAY' });
  saveHistory(history);

  return data;
}

// Fund wallet online
export async function fundOfflineWallet(vpa, amount) {
  try {
    const response = await fetch(`${API_BASE_URL}/wallet/fund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vpa, amount })
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to fund wallet");
    }
    
    // Update local user balances
    const user = getLocalUser();
    if (user) {
      user.bankBalance = data.bankBalance;
      user.offlineWalletBalance = data.offlineWalletBalance;
      setLocalUser(user);
    }
    
    return data;
  } catch (error) {
    console.error("Fund error:", error);
    throw error;
  }
}

// Fetch balances from server
export async function refreshOnlineBalance(vpa) {
  try {
    const response = await fetch(`${API_BASE_URL}/wallet/balance?vpa=${encodeURIComponent(vpa)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    const user = getLocalUser();
    if (user) {
      user.bankBalance = data.bankBalance;
      user.offlineWalletBalance = data.offlineWalletBalance;
      setLocalUser(user);
    }
    return data;
  } catch (error) {
    console.error("Refresh balance error:", error);
    return null;
  }
}

// Synchronize all pending transactions in client queue with server
export async function syncQueueWithServer(vpa) {
  const queue = getOfflineQueue();
  const pendingTxs = queue.filter(tx => tx.status === 'PENDING_SYNC' || tx.status === 'CONFIRMED_OFFLINE');
  
  if (pendingTxs.length === 0) {
    // No offline transactions to sync, just refresh balance and history
    const balanceInfo = await refreshOnlineBalance(vpa);
    if (balanceInfo) {
      try {
        const histResponse = await fetch(`${API_BASE_URL}/history?vpa=${encodeURIComponent(vpa)}`);
        const histData = await histResponse.json();
        if (histResponse.ok) {
          saveHistory(histData.history);
        }
      } catch (e) {
        console.error("Fetch history error:", e);
      }
    }
    return { success: true, syncedCount: 0 };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vpa, queue: pendingTxs })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Sync request failed");

    // Process results
    const results = data.results; // array of { txId, status, error }
    
    // Update local history statuses based on server resolutions
    const localHistory = getHistory();
    const updatedHistory = localHistory.map(histTx => {
      const match = results.find(r => r.txId === histTx.txId);
      if (match) {
        return { 
          ...histTx, 
          status: match.status, 
          failureReason: match.error || null 
        };
      }
      return histTx;
    });
    saveHistory(updatedHistory);

    // Clear resolved items from queue (or remove successfully synced, keep failures marked as failed)
    // Actually, we'll keep the queue clean and remove all synced/processed items.
    const remainingQueue = queue.filter(qTx => {
      const match = results.find(r => r.txId === qTx.txId);
      if (match) {
        // If matched and resolved (either success or permanent fail), remove from sync queue
        return false;
      }
      return true; // Keep in queue if it wasn't processed by server
    });
    saveOfflineQueue(remainingQueue);

    // Update local balances to match server values
    const user = getLocalUser();
    if (user) {
      user.bankBalance = data.bankBalance;
      user.offlineWalletBalance = data.offlineWalletBalance;
      setLocalUser(user);
    }

    return { 
      success: true, 
      syncedCount: pendingTxs.length,
      results: results
    };
  } catch (error) {
    console.error("Sync process failed:", error);
    throw error;
  }
}
