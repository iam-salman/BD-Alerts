import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocs,
  getDoc,
  Timestamp 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeFirestorePayload } from './firebase';

export type IncomingCategory = 
  | 'Swap Collection' 
  | 'Driver Connection' 
  | 'Replacement of Items'
  | 'Driver EMI';

export type CashStatus = 
  | 'Received' 
  | 'Partial Received' 
  | 'Not Received';

export interface CashDenomination {
  notes?: {
    n500?: number;
    n200?: number;
    n100?: number;
    n50?: number;
    n20?: number;
    n10?: number;
  };
  coins?: {
    c20?: number;
    c10?: number;
    c5?: number;
    c2?: number;
    c1?: number;
  };
  total?: number;
}

export interface CashTransaction {
  id: string;
  category: IncomingCategory | 'Driver Repair'; // allow reading legacy Driver Repair if present
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  stationId?: string;
  stationName?: string;
  expectedAmount: number;
  cashAmount: number;
  onlineAmount: number;
  totalReceived: number;
  pendingAmount: number;
  status: CashStatus;
  swapPeriodFrom?: string; // For Swap Collection billing range
  swapPeriodTo?: string; // For Swap Collection billing range
  denominations?: CashDenomination; // Cash notes & coins breakdown
  isReconciled?: boolean; // For Driver Connection month-end reconciliation
  reconciledMonth?: string; // e.g. YYYY-MM
  receiptUrl?: string; // Google Drive link or file URL
  paymentReference?: string; // UTR or slip number
  collectedBy?: string;
  linkedTechnicianLogId?: string; // Bidirectional link to technician service log
  itemsSummary?: string; // Replaced or installed items
  notes?: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
}

export type ExchangeStatus = 'Given (Pending Return)' | 'Partially Returned' | 'Returned to Cash Collection';
export type ExpenseStatus = 'Paid' | 'Partially Returned' | 'Returned to Cash Collection';

export interface ExchangeReturnRecord {
  id: string;
  exchangeId: string;
  amount: number;
  date: string;
  handledBy?: string;
  notes?: string;
  denominations?: CashDenomination;
  createdAt: string;
}

export interface ExpenseReturnRecord {
  id: string;
  expenseId: string;
  amount: number;
  date: string;
  handledBy?: string;
  notes?: string;
  denominations?: CashDenomination;
  createdAt: string;
}

export interface CashExpense {
  id: string;
  category: string;
  title: string;
  amount: number; // Original amount expensed
  returnedAmount?: number; // Amount refunded or returned back to cash collection
  pendingAmount?: number; // Net expensed: amount - returnedAmount
  returnDate?: string;
  returnNotes?: string;
  returnDenominations?: CashDenomination;
  returnHistory?: ExpenseReturnRecord[];
  status?: ExpenseStatus;
  paidTo: string;
  stationId?: string;
  stationName?: string;
  receiptUrl?: string; // Google Drive link
  paidBy: string;
  date: string; // YYYY-MM-DD
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CashExchange {
  id: string;
  amount: number; // Original amount given
  givenTo: string;
  givenPurpose: string;
  exchangeType: 'Cash to Coins' | 'Coins to Cash' | 'Note Denomination Exchange' | 'Change Float' | 'Other';
  status: ExchangeStatus;
  givenDate: string; // YYYY-MM-DD
  returnDate?: string; // YYYY-MM-DD
  receiptUrl?: string; // Google Drive link
  returnedAmount?: number; // Amount returned so far
  pendingAmount?: number; // amount - returnedAmount
  returnHistory?: ExchangeReturnRecord[];
  returnNotes?: string;
  returnDenominations?: CashDenomination;
  denominations?: CashDenomination;
  notes?: string;
  handledBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BankDeposit {
  id: string;
  amount: number;
  bankName: string;
  accountNumber?: string;
  referenceNumber?: string; // Deposit slip / Challan / UTR
  receiptUrl?: string; // Google Drive link for deposit slip
  depositDate: string; // YYYY-MM-DD
  depositedBy: string;
  denominations?: CashDenomination;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CashCollectionSummary {
  totalExpected: number;
  totalCashCollection: number; // Daily physical cash collection from Swap Collection, Replacement, Driver EMI
  totalOnlineCollection: number; // Daily online direct collections
  totalReceived: number;
  totalNotReceived: number;
  totalExpenses: number; // Net operational expenses (amount - returnedAmount)
  totalExpensesOriginal: number; // Gross expenses before any return
  totalExpensesReturned: number; // Total expense refunds returned to cash collection
  totalExchangeGiven: number;
  totalExchangePending: number;
  totalExchangeReturned: number;
  totalCashReturnsBackToCollection: number; // Combined returns (Exchange returns + Expense returns) back to collection
  totalDeposited: number;
  totalLeft: number; // Daily physical cash remaining in till
  settled: number;

  // Dedicated Driver Connection Month-End Settlement Metrics:
  driverConnExpected: number;
  driverConnCash: number;
  driverConnOnline: number;
  driverConnTotal: number;
  driverConnCount: number;
  driverConnPendingCount: number;
  driverConnReconciledCount: number;
  driverConnPendingAmount: number;
  driverConnReconciledAmount: number;
  driverConnReconciledCash: number;
  driverConnReconciledOnline: number;
}

// LocalStorage cache keys
const CACHE_KEY_TX = 'bd_ops_cash_transactions_v1';
const CACHE_KEY_EXP = 'bd_ops_cash_expenses_v1';
const CACHE_KEY_EXC = 'bd_ops_cash_exchanges_v1';
const CACHE_KEY_DEP = 'bd_ops_cash_deposits_v1';

export const calculateCashSummary = (
  transactions: CashTransaction[],
  expenses: CashExpense[],
  exchanges: CashExchange[],
  deposits: BankDeposit[]
): CashCollectionSummary => {
  let totalExpected = 0;
  let totalCashCollection = 0;
  let totalOnlineCollection = 0;
  let totalReceived = 0;
  let totalNotReceived = 0;

  let driverConnExpected = 0;
  let driverConnCash = 0;
  let driverConnOnline = 0;
  let driverConnTotal = 0;
  let driverConnCount = 0;
  let driverConnPendingCount = 0;
  let driverConnReconciledCount = 0;
  let driverConnPendingAmount = 0;
  let driverConnReconciledAmount = 0;
  let driverConnReconciledCash = 0;
  let driverConnReconciledOnline = 0;

  transactions.forEach(t => {
    const isDriverConn = t.category === 'Driver Connection';
    const exp = Number(t.expectedAmount) || 0;
    const csh = Number(t.cashAmount) || 0;
    const onl = Number(t.onlineAmount) || 0;
    const rec = csh + onl;
    const notRec = Math.max(0, exp - rec);

    if (isDriverConn) {
      // Driver Connection metrics
      driverConnCount += 1;
      driverConnExpected += exp;
      driverConnCash += csh;
      driverConnOnline += onl;
      driverConnTotal += rec;

      if (t.isReconciled) {
        // When settled at month-end, the transaction is reconciled and realized into Cash Collection & Till!
        driverConnReconciledCount += 1;
        driverConnReconciledAmount += rec;
        driverConnReconciledCash += csh;
        driverConnReconciledOnline += onl;

        // Credit to active collections so cash collection and till reflect the settled amount
        totalCashCollection += csh;
        totalOnlineCollection += onl;
        totalExpected += exp;
        totalReceived += rec;
        totalNotReceived += notRec;
      } else {
        // Pending month-end reconciliation: preserved in ledger without inflating daily till until settled
        driverConnPendingCount += 1;
        driverConnPendingAmount += rec;
      }
    } else {
      // Daily collections: Swap Collection, Replacement of Items, Driver EMI
      totalCashCollection += csh;
      totalOnlineCollection += onl;
      totalExpected += exp;
      totalReceived += rec;
      totalNotReceived += notRec;
    }
  });

  // Expenses: calculate net expenses (amount - returnedAmount)
  let totalExpensesOriginal = 0;
  let totalExpensesReturned = 0;
  let totalExpenses = 0; // Net expenses deducted from cash till
  expenses.forEach(curr => {
    const orig = Number(curr.amount) || 0;
    const ret = Number(curr.returnedAmount) || 0;
    const net = Math.max(0, orig - ret);
    totalExpensesOriginal += orig;
    totalExpensesReturned += ret;
    totalExpenses += net;
  });

  // Exchanges: pending unreturned float (amount - returnedAmount)
  let totalExchangeGiven = 0;
  let totalExchangePending = 0;
  let totalExchangeReturned = 0;

  exchanges.forEach(e => {
    const amt = Number(e.amount) || 0;
    const ret = Number(e.returnedAmount) || 0;
    const pending = Math.max(0, amt - ret);
    totalExchangeGiven += amt;
    totalExchangeReturned += ret;
    totalExchangePending += pending;
  });

  const totalDeposited = deposits.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  // Total cash returned back to collection from all floats & expense refunds
  const totalCashReturnsBackToCollection = totalExchangeReturned + totalExpensesReturned;

  // Daily Till Formula:
  // Total Left (Till Cash) = Daily Cash Collection (Swaps + Replacement + EMI) - Total Deposited - Net Expenses - Pending Exchange
  const totalLeft = totalCashCollection - totalDeposited - totalExpenses - totalExchangePending;

  // Settled: Cash Deposited in Bank + Online Collections + any pending direct online payments
  const settled = totalDeposited + totalOnlineCollection + (driverConnOnline - driverConnReconciledOnline);

  return {
    totalExpected,
    totalCashCollection,
    totalOnlineCollection,
    totalReceived,
    totalNotReceived,
    totalExpenses,
    totalExpensesOriginal,
    totalExpensesReturned,
    totalExchangeGiven,
    totalExchangePending,
    totalExchangeReturned,
    totalCashReturnsBackToCollection,
    totalDeposited,
    totalLeft,
    settled,
    driverConnExpected,
    driverConnCash,
    driverConnOnline,
    driverConnTotal,
    driverConnCount,
    driverConnPendingCount,
    driverConnReconciledCount,
    driverConnPendingAmount,
    driverConnReconciledAmount,
    driverConnReconciledCash,
    driverConnReconciledOnline
  };
};

// Clean collections without hardcoded seed cities
const SEED_TRANSACTIONS: CashTransaction[] = [];
const SEED_EXPENSES: CashExpense[] = [];
const SEED_EXCHANGES: CashExchange[] = [];
const SEED_DEPOSITS: BankDeposit[] = [];

// Clean legacy dummy seeds from browser caches
try {
  ['CACHE_KEY_TX', 'CACHE_KEY_EXP', 'CACHE_KEY_EXC', 'CACHE_KEY_DEP'].forEach(k => {
    const raw = localStorage.getItem(k);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter((it: any) => it && !String(it.id || '').includes('_seed_'));
          localStorage.setItem(k, JSON.stringify(cleaned));
        }
      } catch (e) {}
    }
  });
} catch (e) {}

// Subscriptions & Real-time Listeners
export const subscribeToCashTransactions = (callback: (txs: CashTransaction[]) => void) => {
  const notifyFromCache = () => {
    try {
      const cached = localStorage.getItem(CACHE_KEY_TX);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) callback(parsed);
      }
    } catch (e) {}
  };

  try {
    const cached = localStorage.getItem(CACHE_KEY_TX);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) callback(parsed);
      } catch (e) {}
    } else {
      callback(SEED_TRANSACTIONS);
    }
  } catch (e) {}

  // Instant local event listener for optimistic & offline updates
  window.addEventListener('cash_transactions_changed', notifyFromCache);

  const coll = collection(db, 'cash_transactions');
  const unsub = onSnapshot(coll, (snap) => {
    if (!snap.empty) {
      const items: CashTransaction[] = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as CashTransaction));
      // Sort newest first
      items.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
      localStorage.setItem(CACHE_KEY_TX, JSON.stringify(items));
      callback(items);
    } else {
      // Seed if cloud collection is totally empty
      try {
        const cached = localStorage.getItem(CACHE_KEY_TX);
        if (!cached) {
          localStorage.setItem(CACHE_KEY_TX, JSON.stringify(SEED_TRANSACTIONS));
          callback(SEED_TRANSACTIONS);
        }
      } catch (e) {}
    }
  }, (err) => {
    console.warn("Could not sync cash_transactions live, using local cache:", err);
    try {
      const cached = localStorage.getItem(CACHE_KEY_TX);
      if (cached) callback(JSON.parse(cached));
    } catch (e) {}
  });

  return () => {
    unsub();
    window.removeEventListener('cash_transactions_changed', notifyFromCache);
  };
};

export const subscribeToCashExpenses = (callback: (expenses: CashExpense[]) => void) => {
  try {
    const cached = localStorage.getItem(CACHE_KEY_EXP);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) callback(parsed);
      } catch (e) {}
    } else {
      callback(SEED_EXPENSES);
    }
  } catch (e) {}

  const coll = collection(db, 'cash_expenses');
  const unsub = onSnapshot(coll, (snap) => {
    if (!snap.empty) {
      const items: CashExpense[] = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as CashExpense));
      items.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
      localStorage.setItem(CACHE_KEY_EXP, JSON.stringify(items));
      callback(items);
    } else {
      try {
        const cached = localStorage.getItem(CACHE_KEY_EXP);
        if (!cached) {
          localStorage.setItem(CACHE_KEY_EXP, JSON.stringify(SEED_EXPENSES));
          callback(SEED_EXPENSES);
        }
      } catch (e) {}
    }
  }, (err) => {
    console.warn("Could not sync cash_expenses live, using local cache:", err);
    try {
      const cached = localStorage.getItem(CACHE_KEY_EXP);
      if (cached) callback(JSON.parse(cached));
    } catch (e) {}
  });

  return unsub;
};

export const subscribeToCashExchanges = (callback: (exchanges: CashExchange[]) => void) => {
  try {
    const cached = localStorage.getItem(CACHE_KEY_EXC);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) callback(parsed);
      } catch (e) {}
    } else {
      callback(SEED_EXCHANGES);
    }
  } catch (e) {}

  const coll = collection(db, 'cash_exchanges');
  const unsub = onSnapshot(coll, (snap) => {
    if (!snap.empty) {
      const items: CashExchange[] = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as CashExchange));
      items.sort((a, b) => (b.givenDate || '').localeCompare(a.givenDate || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
      localStorage.setItem(CACHE_KEY_EXC, JSON.stringify(items));
      callback(items);
    } else {
      try {
        const cached = localStorage.getItem(CACHE_KEY_EXC);
        if (!cached) {
          localStorage.setItem(CACHE_KEY_EXC, JSON.stringify(SEED_EXCHANGES));
          callback(SEED_EXCHANGES);
        }
      } catch (e) {}
    }
  }, (err) => {
    console.warn("Could not sync cash_exchanges live, using local cache:", err);
    try {
      const cached = localStorage.getItem(CACHE_KEY_EXC);
      if (cached) callback(JSON.parse(cached));
    } catch (e) {}
  });

  return unsub;
};

export const subscribeToBankDeposits = (callback: (deposits: BankDeposit[]) => void) => {
  try {
    const cached = localStorage.getItem(CACHE_KEY_DEP);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) callback(parsed);
      } catch (e) {}
    } else {
      callback(SEED_DEPOSITS);
    }
  } catch (e) {}

  const coll = collection(db, 'cash_deposits');
  const unsub = onSnapshot(coll, (snap) => {
    if (!snap.empty) {
      const items: BankDeposit[] = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as BankDeposit));
      items.sort((a, b) => (b.depositDate || '').localeCompare(a.depositDate || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
      localStorage.setItem(CACHE_KEY_DEP, JSON.stringify(items));
      callback(items);
    } else {
      try {
        const cached = localStorage.getItem(CACHE_KEY_DEP);
        if (!cached) {
          localStorage.setItem(CACHE_KEY_DEP, JSON.stringify(SEED_DEPOSITS));
          callback(SEED_DEPOSITS);
        }
      } catch (e) {}
    }
  }, (err) => {
    console.warn("Could not sync cash_deposits live, using local cache:", err);
    try {
      const cached = localStorage.getItem(CACHE_KEY_DEP);
      if (cached) callback(JSON.parse(cached));
    } catch (e) {}
  });

  return unsub;
};

// --- Mutation APIs ---

// 1. Transactions
export const saveCashTransaction = async (data: Omit<CashTransaction, 'id' | 'createdAt' | 'updatedAt'>, id?: string): Promise<string> => {
  const now = new Date().toISOString();
  const cash = Number(data.cashAmount) || 0;
  const online = Number(data.onlineAmount) || 0;
  const totalReceived = cash + online;
  const expected = Number(data.expectedAmount) || 0;
  const pending = Math.max(0, expected - totalReceived);
  
  let computedStatus: CashStatus = data.status;
  if (!computedStatus) {
    if (totalReceived >= expected && expected > 0) computedStatus = 'Received';
    else if (totalReceived > 0) computedStatus = 'Partial Received';
    else computedStatus = 'Not Received';
  }

  const payload: any = {
    ...data,
    cashAmount: cash,
    onlineAmount: online,
    totalReceived,
    pendingAmount: pending,
    status: computedStatus,
    updatedAt: now
  };

  const cleanPayload = sanitizeFirestorePayload(payload);

  if (id) {
    try {
      await setDoc(doc(db, 'cash_transactions', id), cleanPayload, { merge: true });
    } catch (err) {
      console.warn("Firestore update error, updating local cache:", err);
    }
    // Update local cache
    updateLocalCacheItem(CACHE_KEY_TX, { id, ...payload });
    window.dispatchEvent(new CustomEvent('cash_transactions_changed'));
    return id;
  } else {
    cleanPayload.createdAt = now;
    let newId = 'tx_' + Date.now();
    try {
      const ref = await addDoc(collection(db, 'cash_transactions'), cleanPayload);
      newId = ref.id;
    } catch (err) {
      console.warn("Firestore insert error, saving to local cache:", err);
    }
    addLocalCacheItem(CACHE_KEY_TX, { id: newId, ...cleanPayload });
    window.dispatchEvent(new CustomEvent('cash_transactions_changed'));
    return newId;
  }
};

export const deleteCashTransaction = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'cash_transactions', id));
  } catch (err) {
    console.warn("Firestore delete error, removing from local cache:", err);
  }
  removeLocalCacheItem(CACHE_KEY_TX, id);
  window.dispatchEvent(new CustomEvent('cash_transactions_changed'));
};

// 2. Expenses
export const saveCashExpense = async (data: Omit<CashExpense, 'id' | 'createdAt' | 'updatedAt'>, id?: string): Promise<string> => {
  const now = new Date().toISOString();
  const amt = Number(data.amount) || 0;
  const ret = Number(data.returnedAmount) || 0;
  const pending = Math.max(0, amt - ret);
  let computedStatus: ExpenseStatus = data.status || 'Paid';
  if (ret >= amt && amt > 0) {
    computedStatus = 'Returned to Cash Collection';
  } else if (ret > 0) {
    computedStatus = 'Partially Returned';
  } else {
    computedStatus = 'Paid';
  }

  const payload: any = {
    ...data,
    amount: amt,
    returnedAmount: ret,
    pendingAmount: pending,
    status: computedStatus,
    updatedAt: now
  };
  const cleanPayload = sanitizeFirestorePayload(payload);

  if (id) {
    try {
      await updateDoc(doc(db, 'cash_expenses', id), cleanPayload);
    } catch (err) {
      console.warn("Firestore update error, updating local cache:", err);
    }
    updateLocalCacheItem(CACHE_KEY_EXP, { id, ...payload });
    return id;
  } else {
    cleanPayload.createdAt = now;
    let newId = 'exp_' + Date.now();
    try {
      const ref = await addDoc(collection(db, 'cash_expenses'), cleanPayload);
      newId = ref.id;
    } catch (err) {
      console.warn("Firestore insert error, saving to local cache:", err);
    }
    addLocalCacheItem(CACHE_KEY_EXP, { id: newId, ...cleanPayload });
    return newId;
  }
};

export const deleteCashExpense = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'cash_expenses', id));
  } catch (err) {
    console.warn("Firestore delete error:", err);
  }
  removeLocalCacheItem(CACHE_KEY_EXP, id);
};

// Record return or refund back into cash collection from a specific expense transaction ID
export const recordExpenseReturn = async (
  expenseId: string,
  returnData: {
    amount: number;
    date: string;
    handledBy?: string;
    notes?: string;
    denominations?: CashDenomination;
  }
): Promise<void> => {
  const now = new Date().toISOString();
  let expense: CashExpense | null = null;
  const raw = localStorage.getItem(CACHE_KEY_EXP);
  if (raw) {
    try {
      const list: CashExpense[] = JSON.parse(raw);
      expense = list.find(x => x.id === expenseId) || null;
    } catch (e) {}
  }

  if (!expense) {
    try {
      const snap = await getDoc(doc(db, 'cash_expenses', expenseId));
      if (snap.exists()) {
        expense = { id: snap.id, ...snap.data() } as CashExpense;
      }
    } catch (e) {}
  }

  const retAmt = Number(returnData.amount) || 0;
  if (retAmt <= 0) {
    throw new Error('Return amount must be greater than 0');
  }

  const prevReturned = Number(expense?.returnedAmount) || 0;
  const newReturned = prevReturned + retAmt;
  const totalAmt = Number(expense?.amount) || retAmt;
  const newPending = Math.max(0, totalAmt - newReturned);
  const newStatus: ExpenseStatus = newPending <= 0 ? 'Returned to Cash Collection' : 'Partially Returned';

  const newReturnRecord: ExpenseReturnRecord = {
    id: 'ret_exp_' + Date.now(),
    expenseId,
    amount: retAmt,
    date: returnData.date || new Date().toISOString().split('T')[0],
    handledBy: returnData.handledBy || 'Operator',
    notes: returnData.notes,
    denominations: returnData.denominations,
    createdAt: now
  };

  const history = Array.isArray(expense?.returnHistory) ? [...expense.returnHistory] : [];
  history.push(newReturnRecord);

  const payload: Partial<CashExpense> = {
    returnedAmount: newReturned,
    pendingAmount: newPending,
    status: newStatus,
    returnDate: returnData.date || new Date().toISOString().split('T')[0],
    returnHistory: history,
    returnNotes: returnData.notes,
    returnDenominations: returnData.denominations,
    updatedAt: now
  };

  try {
    await updateDoc(doc(db, 'cash_expenses', expenseId), sanitizeFirestorePayload(payload));
  } catch (err) {
    console.warn("Firestore update error, updating local cache:", err);
  }

  if (expense) {
    updateLocalCacheItem(CACHE_KEY_EXP, { ...expense, ...payload, id: expenseId });
  }
};

// 3. Exchanges
export const saveCashExchange = async (data: Omit<CashExchange, 'id' | 'createdAt' | 'updatedAt'>, id?: string): Promise<string> => {
  const now = new Date().toISOString();
  const amt = Number(data.amount) || 0;
  const ret = Number(data.returnedAmount) || 0;
  const pending = Math.max(0, amt - ret);

  let computedStatus: ExchangeStatus = data.status;
  if (ret >= amt && amt > 0) {
    computedStatus = 'Returned to Cash Collection';
  } else if (ret > 0) {
    computedStatus = 'Partially Returned';
  } else {
    computedStatus = 'Given (Pending Return)';
  }

  const payload: any = {
    ...data,
    amount: amt,
    returnedAmount: ret,
    pendingAmount: pending,
    status: computedStatus,
    updatedAt: now
  };
  const cleanPayload = sanitizeFirestorePayload(payload);

  if (id) {
    try {
      await updateDoc(doc(db, 'cash_exchanges', id), cleanPayload);
    } catch (err) {
      console.warn("Firestore update error:", err);
    }
    updateLocalCacheItem(CACHE_KEY_EXC, { id, ...payload });
    return id;
  } else {
    cleanPayload.createdAt = now;
    let newId = 'exc_' + Date.now();
    try {
      const ref = await addDoc(collection(db, 'cash_exchanges'), cleanPayload);
      newId = ref.id;
    } catch (err) {
      console.warn("Firestore insert error:", err);
    }
    addLocalCacheItem(CACHE_KEY_EXC, { id: newId, ...cleanPayload });
    return newId;
  }
};

export const deleteCashExchange = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'cash_exchanges', id));
  } catch (err) {
    console.warn("Firestore delete error:", err);
  }
  removeLocalCacheItem(CACHE_KEY_EXC, id);
};

// Record cash or coins return back into cash collection from a specific exchange transaction ID
export const recordExchangeReturn = async (
  exchangeId: string,
  returnData: {
    amount: number;
    date: string;
    handledBy?: string;
    notes?: string;
    denominations?: CashDenomination;
  }
): Promise<void> => {
  const now = new Date().toISOString();
  let exchange: CashExchange | null = null;
  const raw = localStorage.getItem(CACHE_KEY_EXC);
  if (raw) {
    try {
      const list: CashExchange[] = JSON.parse(raw);
      exchange = list.find(x => x.id === exchangeId) || null;
    } catch (e) {}
  }

  if (!exchange) {
    try {
      const snap = await getDoc(doc(db, 'cash_exchanges', exchangeId));
      if (snap.exists()) {
        exchange = { id: snap.id, ...snap.data() } as CashExchange;
      }
    } catch (e) {}
  }

  const retAmt = Number(returnData.amount) || 0;
  if (retAmt <= 0) {
    throw new Error('Return amount must be greater than 0');
  }

  const prevReturned = Number(exchange?.returnedAmount) || 0;
  const newReturned = prevReturned + retAmt;
  const totalAmt = Number(exchange?.amount) || retAmt;
  const newPending = Math.max(0, totalAmt - newReturned);
  const newStatus: ExchangeStatus = newPending <= 0 ? 'Returned to Cash Collection' : 'Partially Returned';

  const newReturnRecord: ExchangeReturnRecord = {
    id: 'ret_exc_' + Date.now(),
    exchangeId,
    amount: retAmt,
    date: returnData.date || new Date().toISOString().split('T')[0],
    handledBy: returnData.handledBy || 'Operator',
    notes: returnData.notes,
    denominations: returnData.denominations,
    createdAt: now
  };

  const history = Array.isArray(exchange?.returnHistory) ? [...exchange.returnHistory] : [];
  history.push(newReturnRecord);

  const payload: Partial<CashExchange> = {
    returnedAmount: newReturned,
    pendingAmount: newPending,
    status: newStatus,
    returnDate: returnData.date || new Date().toISOString().split('T')[0],
    returnHistory: history,
    returnNotes: returnData.notes,
    returnDenominations: returnData.denominations,
    updatedAt: now
  };

  try {
    await updateDoc(doc(db, 'cash_exchanges', exchangeId), sanitizeFirestorePayload(payload));
  } catch (err) {
    console.warn("Firestore update error, updating local cache:", err);
  }

  if (exchange) {
    updateLocalCacheItem(CACHE_KEY_EXC, { ...exchange, ...payload, id: exchangeId });
  }
};

// 4. Deposits
export const saveBankDeposit = async (data: Omit<BankDeposit, 'id' | 'createdAt' | 'updatedAt'>, id?: string): Promise<string> => {
  const now = new Date().toISOString();
  const payload: any = {
    ...data,
    amount: Number(data.amount) || 0,
    updatedAt: now
  };
  const cleanPayload = sanitizeFirestorePayload(payload);

  if (id) {
    try {
      await updateDoc(doc(db, 'cash_deposits', id), cleanPayload);
    } catch (err) {
      console.warn("Firestore update error:", err);
    }
    updateLocalCacheItem(CACHE_KEY_DEP, { id, ...payload });
    return id;
  } else {
    cleanPayload.createdAt = now;
    let newId = 'dep_' + Date.now();
    try {
      const ref = await addDoc(collection(db, 'cash_deposits'), cleanPayload);
      newId = ref.id;
    } catch (err) {
      console.warn("Firestore insert error:", err);
    }
    addLocalCacheItem(CACHE_KEY_DEP, { id: newId, ...cleanPayload });
    return newId;
  }
};

export const deleteBankDeposit = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'cash_deposits', id));
  } catch (err) {
    console.warn("Firestore delete error:", err);
  }
  removeLocalCacheItem(CACHE_KEY_DEP, id);
};

// Local storage synchronization helpers
function addLocalCacheItem<T extends { id: string }>(key: string, item: T) {
  try {
    const raw = localStorage.getItem(key);
    const list: T[] = raw ? JSON.parse(raw) : [];
    list.unshift(item);
    localStorage.setItem(key, JSON.stringify(list));
  } catch (e) {}
}

function updateLocalCacheItem<T extends { id: string }>(key: string, item: T) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const list: T[] = JSON.parse(raw);
    const idx = list.findIndex(x => x.id === item.id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...item };
      localStorage.setItem(key, JSON.stringify(list));
    }
  } catch (e) {}
}

function removeLocalCacheItem(key: string, id: string) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const list = JSON.parse(raw).filter((x: any) => x.id !== id);
    localStorage.setItem(key, JSON.stringify(list));
  } catch (e) {}
}
