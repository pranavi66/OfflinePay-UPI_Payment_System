import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'db.json');

// Default initial state
const defaultDb = {
  users: {
    "canteen@offlinepay": {
      vpa: "canteen@offlinepay",
      name: "Campus Canteen",
      password: "password",
      balance: 5000.00
    },
    "stationery@offlinepay": {
      vpa: "stationery@offlinepay",
      name: "Stationery Mart",
      password: "password",
      balance: 3000.00
    },
    "test@offlinepay": {
      vpa: "test@offlinepay",
      name: "Test User",
      password: "password",
      balance: 1000.00
    }
  },
  transactions: []
};

// Initialize DB file if not exists
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), 'utf8');
}

export function readDb() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading database file, returning defaults:", err);
    return defaultDb;
  }
}

export function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error("Error writing database file:", err);
    return false;
  }
}

export function getUser(vpa) {
  const db = readDb();
  return db.users[vpa.toLowerCase()] || null;
}

export function createUser(vpa, name, password, initialBalance = 1000.00) {
  const db = readDb();
  const lowerVpa = vpa.toLowerCase();
  if (db.users[lowerVpa]) {
    return { success: false, message: "User VPA already exists" };
  }
  db.users[lowerVpa] = {
    vpa: lowerVpa,
    name,
    password,
    balance: initialBalance
  };
  writeDb(db);
  return { success: true, user: db.users[lowerVpa] };
}

export function updateBalance(vpa, amount) {
  const db = readDb();
  const lowerVpa = vpa.toLowerCase();
  if (!db.users[lowerVpa]) return false;
  db.users[lowerVpa].balance += amount;
  // Ensure balance doesn't go below 0
  if (db.users[lowerVpa].balance < 0) {
    db.users[lowerVpa].balance = 0;
  }
  writeDb(db);
  return db.users[lowerVpa].balance;
}

export function addTransaction(tx) {
  const db = readDb();
  // Double check duplicates
  const exists = db.transactions.some(t => t.txId === tx.txId);
  if (exists) return false;

  db.transactions.push(tx);
  writeDb(db);
  return true;
}

export function getTransactionsForUser(vpa) {
  const db = readDb();
  const lowerVpa = vpa.toLowerCase();
  return db.transactions.filter(t => 
    t.senderVpa.toLowerCase() === lowerVpa || 
    t.receiverVpa.toLowerCase() === lowerVpa
  ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}
