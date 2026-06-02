import express from 'express';
import cors from 'cors';
import { 
  getUser, 
  createUser, 
  updateBalance, 
  addTransaction, 
  getTransactionsForUser, 
  readDb, 
  writeDb 
} from './db.js';

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Helper to log server requests with timestamps
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Test route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Auth Routes
app.post('/api/auth/register', (req, res) => {
  const { vpa, name, password } = req.body;
  if (!vpa || !name || !password) {
    return res.status(400).json({ error: "VPA, name, and password are required" });
  }

  if (!vpa.includes('@')) {
    return res.status(400).json({ error: "Invalid VPA format. Must contain '@'" });
  }

  const result = createUser(vpa, name, password, 0); // starts with 0 offline wallet, but we'll give them 10,000 in bank balance
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }

  // Setup bank balance and offline balance
  const db = readDb();
  const lowerVpa = vpa.toLowerCase();
  db.users[lowerVpa].bankBalance = 10000.00; // Mock bank account funded with ₹10,000
  db.users[lowerVpa].offlineWalletBalance = 0.00; // Offline wallet starts at 0
  writeDb(db);

  const { password: _, ...userWithoutPassword } = db.users[lowerVpa];
  res.status(201).json({ message: "Registration successful", user: userWithoutPassword });
});

app.post('/api/auth/login', (req, res) => {
  const { vpa, password } = req.body;
  if (!vpa || !password) {
    return res.status(400).json({ error: "VPA and password are required" });
  }

  const user = getUser(vpa);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Invalid VPA or password" });
  }

  // Ensure bankBalance & offlineWalletBalance exist (migration check)
  const db = readDb();
  const lowerVpa = vpa.toLowerCase();
  let updated = false;
  if (db.users[lowerVpa].bankBalance === undefined) {
    db.users[lowerVpa].bankBalance = 10000.00;
    updated = true;
  }
  if (db.users[lowerVpa].offlineWalletBalance === undefined) {
    db.users[lowerVpa].offlineWalletBalance = db.users[lowerVpa].balance || 0.00;
    updated = true;
  }
  if (updated) {
    writeDb(db);
  }

  const { password: _, ...userWithoutPassword } = db.users[lowerVpa];
  res.json({ message: "Login successful", user: userWithoutPassword });
});

// Fetch User Balances (online mode only)
app.get('/api/wallet/balance', (req, res) => {
  const { vpa } = req.query;
  if (!vpa) {
    return res.status(400).json({ error: "VPA is required" });
  }

  const user = getUser(vpa);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({
    vpa: user.vpa,
    name: user.name,
    bankBalance: user.bankBalance ?? 10000.00,
    offlineWalletBalance: user.offlineWalletBalance ?? 0.00
  });
});

// Fund Offline Wallet from Bank Account (online mode only)
app.post('/api/wallet/fund', (req, res) => {
  const { vpa, amount } = req.body;
  const fundAmount = parseFloat(amount);

  if (!vpa || isNaN(fundAmount) || fundAmount <= 0) {
    return res.status(400).json({ error: "VPA and valid positive amount are required" });
  }

  const db = readDb();
  const lowerVpa = vpa.toLowerCase();
  const user = db.users[lowerVpa];

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (user.bankBalance < fundAmount) {
    return res.status(400).json({ error: "Insufficient bank balance" });
  }

  // Deduct from bank account, add to offline wallet
  user.bankBalance -= fundAmount;
  user.offlineWalletBalance = (user.offlineWalletBalance || 0) + fundAmount;
  
  writeDb(db);

  res.json({
    message: `Successfully loaded ₹${fundAmount} into Offline Wallet`,
    bankBalance: user.bankBalance,
    offlineWalletBalance: user.offlineWalletBalance
  });
});

// Sync Transaction Queue (handles online sync)
app.post('/api/sync', (req, res) => {
  const { vpa, queue } = req.body; // queue is an array of txs to process
  if (!vpa || !Array.isArray(queue)) {
    return res.status(400).json({ error: "VPA and a transaction queue are required" });
  }

  const db = readDb();
  const lowerVpa = vpa.toLowerCase();
  const syncUser = db.users[lowerVpa];

  if (!syncUser) {
    return res.status(404).json({ error: "User not found" });
  }

  const results = [];

  for (const tx of queue) {
    const { txId, senderVpa, receiverVpa, amount, timestamp, signature } = tx;

    // 1. Check if transaction has already been synced/processed by checking the global ledger
    const existingTx = db.transactions.find(t => t.txId === txId);
    if (existingTx) {
      results.push({ txId, status: "SYNCED", message: "Already processed" });
      continue;
    }

    const txAmount = parseFloat(amount);
    const sender = db.users[senderVpa.toLowerCase()];
    const receiver = db.users[receiverVpa.toLowerCase()];

    // 2. Validate receiver exists on system
    if (!receiver) {
      results.push({ 
        txId, 
        status: "FAILED", 
        error: `Receiver VPA ${receiverVpa} does not exist on Server` 
      });
      continue;
    }

    // 3. Process according to payment flow
    // If our sync user is the sender
    if (senderVpa.toLowerCase() === lowerVpa) {
      // Check if server-side offline wallet has enough balance to clear it
      // (Normally, it will because client tracks it, but we double-check)
      if (sender.offlineWalletBalance < txAmount) {
        // Fallback: If bank balance has enough, we can clear it or fail.
        // Let's allow clearing from bank account if offline wallet somehow falls short,
        // but mark it as cleared.
        if (sender.bankBalance >= txAmount) {
          sender.bankBalance -= txAmount;
          receiver.bankBalance = (receiver.bankBalance || 0) + txAmount;
          const newTx = { ...tx, status: "SYNCED", settlementSource: "BANK_ACCOUNT" };
          db.transactions.push(newTx);
          results.push({ txId, status: "SYNCED", message: "Settled from bank account" });
        } else {
          results.push({ txId, status: "FAILED", error: "Insufficient balance on server" });
        }
      } else {
        // Normal offline wallet spend: deduct from sender's server-side offlineWalletBalance
        // and credit to receiver's balance (e.g. credit to receiver's bank or offline wallet.
        // We'll credit directly to receiver's bank account since they are settling).
        sender.offlineWalletBalance -= txAmount;
        receiver.bankBalance = (receiver.bankBalance || 0) + txAmount;

        const newTx = { ...tx, status: "SYNCED", settlementSource: "OFFLINE_WALLET" };
        db.transactions.push(newTx);
        results.push({ txId, status: "SYNCED" });
      }
    } else if (receiverVpa.toLowerCase() === lowerVpa) {
      // If our sync user is the receiver, they received a payment from a sender offline.
      // We must check if the sender exists and has already settled this.
      // If not, we can settle it now from the sender's offline wallet if they have enough,
      // or queue it. Since the customer might not have synced yet, the merchant syncing
      // acts as the transaction processor!
      if (sender) {
        if (sender.offlineWalletBalance >= txAmount) {
          sender.offlineWalletBalance -= txAmount;
          receiver.bankBalance = (receiver.bankBalance || 0) + txAmount;

          const newTx = { ...tx, status: "SYNCED", settlementSource: "OFFLINE_WALLET" };
          db.transactions.push(newTx);
          results.push({ txId, status: "SYNCED" });
        } else if (sender.bankBalance >= txAmount) {
          sender.bankBalance -= txAmount;
          receiver.bankBalance = (receiver.bankBalance || 0) + txAmount;

          const newTx = { ...tx, status: "SYNCED", settlementSource: "BANK_ACCOUNT" };
          db.transactions.push(newTx);
          results.push({ txId, status: "SYNCED" });
        } else {
          // If sender has no money anywhere, mark as failed
          results.push({ txId, status: "FAILED", error: "Sender has insufficient funds" });
        }
      } else {
        results.push({ txId, status: "FAILED", error: "Sender account not found" });
      }
    } else {
      results.push({ txId, status: "FAILED", error: "Unrelated transaction in queue" });
    }
  }

  // Save changes to database
  writeDb(db);

  // Return processed results and latest online balances
  res.json({
    results,
    bankBalance: syncUser.bankBalance ?? 10000.00,
    offlineWalletBalance: syncUser.offlineWalletBalance ?? 0.00,
    history: getTransactionsForUser(vpa)
  });
});

// Retrieve Transaction History
app.get('/api/history', (req, res) => {
  const { vpa } = req.query;
  if (!vpa) {
    return res.status(400).json({ error: "VPA is required" });
  }

  const history = getTransactionsForUser(vpa);
  res.json({ history });
});

app.listen(PORT, () => {
  console.log(`🚀 OfflinePay Sync Server running on port ${PORT}`);
});
