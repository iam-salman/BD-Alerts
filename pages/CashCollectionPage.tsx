import React, { useState, useEffect, useMemo } from 'react';
import { 
  BanknotesIcon, 
  ArrowDownLeftIcon, 
  ArrowUpRightIcon, 
  BuildingLibraryIcon, 
  ArrowsRightLeftIcon, 
  PlusIcon, 
  MagnifyingGlassIcon, 
  FunnelIcon, 
  ArrowDownTrayIcon, 
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  TrashIcon,
  PencilSquareIcon,
  ScaleIcon,
  ClockIcon,
  BuildingStorefrontIcon,
  UserIcon,
  XMarkIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { 
  CashTransaction, 
  CashExpense, 
  CashExchange, 
  BankDeposit, 
  IncomingCategory,
  CashStatus,
  calculateCashSummary,
  subscribeToCashTransactions,
  subscribeToCashExpenses,
  subscribeToCashExchanges,
  subscribeToBankDeposits,
  saveCashTransaction,
  deleteCashTransaction,
  saveCashExpense,
  deleteCashExpense,
  saveCashExchange,
  deleteCashExchange,
  saveBankDeposit,
  deleteBankDeposit,
  recordExchangeReturn,
  recordExpenseReturn
} from '@/lib/cashCollectionStorage';
import { CashSummaryCards } from '@/components/cash-collection/CashSummaryCards';
import { CashTransactionModal } from '@/components/cash-collection/CashTransactionModal';
import { CashExpenseModal } from '@/components/cash-collection/CashExpenseModal';
import { CashExchangeModal } from '@/components/cash-collection/CashExchangeModal';
import { BankDepositModal } from '@/components/cash-collection/BankDepositModal';
import { ReceiveExchangeReturnModal } from '@/components/cash-collection/ReceiveExchangeReturnModal';
import { ReceiveExpenseReturnModal } from '@/components/cash-collection/ReceiveExpenseReturnModal';
import CopyButton from '@/components/CopyButton';
import PaginationFooter from '@/components/PaginationFooter';
import CustomSelect from '@/components/CustomSelect';
import CustomDatePicker from '@/components/CustomDatePicker';

type ActiveTab = 'collections' | 'expenses' | 'exchange' | 'deposits' | 'reconciliation';

const CATEGORY_FILTER_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'Swap Collection', label: 'Swap Collection' },
  { value: 'Driver Connection', label: 'Driver Connection' },
  { value: 'Replacement of Items', label: 'Replacement of Items' },
  { value: 'Driver EMI', label: 'Driver EMI' }
];

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'Received', label: 'Received' },
  { value: 'Partial Received', label: 'Partial Received' },
  { value: 'Not Received', label: 'Not Received' }
];

const EXCHANGE_STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'Given (Pending Return)', label: 'Given (Pending Return)' },
  { value: 'Returned to Cash Collection', label: 'Returned to Cash Collection' }
];

export const CashCollectionPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('collections');
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [expenses, setExpenses] = useState<CashExpense[]>([]);
  const [exchanges, setExchanges] = useState<CashExchange[]>([]);
  const [deposits, setDeposits] = useState<BankDeposit[]>([]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Modals state
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<CashTransaction | null>(null);

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<CashExpense | null>(null);

  const [isExchangeModalOpen, setIsExchangeModalOpen] = useState(false);
  const [selectedExchange, setSelectedExchange] = useState<CashExchange | null>(null);

  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<BankDeposit | null>(null);

  // Return modals state (for receiving cash back into till from exchanges and expenses)
  const [exchangeForReturn, setExchangeForReturn] = useState<CashExchange | null>(null);
  const [isExchangeReturnModalOpen, setIsExchangeReturnModalOpen] = useState(false);
  const [expenseForReturn, setExpenseForReturn] = useState<CashExpense | null>(null);
  const [isExpenseReturnModalOpen, setIsExpenseReturnModalOpen] = useState(false);

  // Subscribe to live data
  useEffect(() => {
    const unsubTx = subscribeToCashTransactions(setTransactions);
    const unsubExp = subscribeToCashExpenses(setExpenses);
    const unsubExc = subscribeToCashExchanges(setExchanges);
    const unsubDep = subscribeToBankDeposits(setDeposits);

    return () => {
      unsubTx();
      unsubExp();
      unsubExc();
      unsubDep();
    };
  }, []);

  const summary = useMemo(() => {
    return calculateCashSummary(transactions, expenses, exchanges, deposits);
  }, [transactions, expenses, exchanges, deposits]);

  // Format currency helper
  const fmtCurr = (amt: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amt || 0);
  };

  // Filtered collections
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (dateFilter && t.date !== dateFilter) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = 
          t.driverName?.toLowerCase().includes(q) ||
          t.driverId?.toLowerCase().includes(q) ||
          t.stationName?.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.paymentReference?.toLowerCase().includes(q) ||
          t.collectedBy?.toLowerCase().includes(q) ||
          t.notes?.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [transactions, categoryFilter, statusFilter, dateFilter, searchQuery]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      if (dateFilter && e.date !== dateFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          e.title.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          e.paidTo.toLowerCase().includes(q) ||
          e.stationName?.toLowerCase().includes(q) ||
          e.paidBy?.toLowerCase().includes(q) ||
          e.notes?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [expenses, dateFilter, searchQuery]);

  // Filtered exchanges
  const filteredExchanges = useMemo(() => {
    return exchanges.filter(e => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (dateFilter && e.givenDate !== dateFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          e.givenTo.toLowerCase().includes(q) ||
          e.givenPurpose.toLowerCase().includes(q) ||
          e.exchangeType.toLowerCase().includes(q) ||
          e.handledBy.toLowerCase().includes(q) ||
          e.notes?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [exchanges, statusFilter, dateFilter, searchQuery]);

  // Filtered deposits
  const filteredDeposits = useMemo(() => {
    return deposits.filter(d => {
      if (dateFilter && d.depositDate !== dateFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          d.bankName.toLowerCase().includes(q) ||
          d.referenceNumber?.toLowerCase().includes(q) ||
          d.accountNumber?.toLowerCase().includes(q) ||
          d.depositedBy.toLowerCase().includes(q) ||
          d.notes?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [deposits, dateFilter, searchQuery]);

  // Handle Return Exchange
  const handleMarkExchangeReturned = async (exchange: CashExchange) => {
    if (confirm(`Mark ₹${exchange.amount} from "${exchange.givenTo}" as returned back to cash collection?`)) {
      await saveCashExchange({
        ...exchange,
        status: 'Returned to Cash Collection',
        returnDate: new Date().toISOString().split('T')[0],
        returnedAmount: exchange.amount
      }, exchange.id);
    }
  };

  // Action feedback & Toast notification
  const [togglingTxId, setTogglingTxId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Toggle Driver Connection Month-End Reconciliation
  const handleToggleReconciliation = async (tx: CashTransaction) => {
    const newReconciled = !tx.isReconciled;
    const todayMonth = new Date().toISOString().slice(0, 7);
    const newReconciledMonth = newReconciled 
      ? (tx.reconciledMonth || tx.date?.slice(0, 7) || todayMonth)
      : undefined;

    setTogglingTxId(tx.id);

    // 1. Optimistic state update: UI updates INSTANTLY
    const updatedTx: CashTransaction = {
      ...tx,
      isReconciled: newReconciled,
      reconciledMonth: newReconciledMonth,
      updatedAt: new Date().toISOString()
    };
    setTransactions(prev => prev.map(t => t.id === tx.id ? updatedTx : t));

    // 2. Feedback toast
    if (newReconciled) {
      setToast({
        type: 'success',
        message: `✓ Settled at Month-End! ${fmtCurr(tx.cashAmount)} cash added to Cash Collection & Till.`
      });
    } else {
      setToast({
        type: 'info',
        message: `Reverted to Pending Month-End (${fmtCurr(tx.cashAmount)} cash removed from Till).`
      });
    }

    // 3. Persist to storage & Firestore
    try {
      await saveCashTransaction(updatedTx, tx.id);

      // Sync linked technician service log if present
      if (tx.linkedTechnicianLogId) {
        try {
          await updateDoc(doc(db, 'technician_logs', tx.linkedTechnicianLogId), {
            isReconciled: newReconciled,
            reconciledMonth: newReconciledMonth || '',
            updatedAt: new Date().toISOString()
          });
        } catch (e) {
          console.warn('Could not update linked technician log:', e);
        }
      }
    } catch (err) {
      console.error('Failed to toggle reconciliation status:', err);
      // Revert optimistic update
      setTransactions(prev => prev.map(t => t.id === tx.id ? tx : t));
      setToast({
        type: 'error',
        message: 'Failed to update settlement status. Please try again.'
      });
    } finally {
      setTogglingTxId(null);
    }
  };

  // Driver Connection month-end statistics
  const driverConnStats = useMemo(() => {
    const connTxs = transactions.filter(t => t.category === 'Driver Connection');
    const totalCount = connTxs.length;
    const totalExpected = connTxs.reduce((sum, t) => sum + (t.expectedAmount || 0), 0);
    const totalCash = connTxs.reduce((sum, t) => sum + (t.cashAmount || 0), 0);
    const totalOnline = connTxs.reduce((sum, t) => sum + (t.onlineAmount || 0), 0);
    const totalReceived = totalCash + totalOnline;
    const reconciledCount = connTxs.filter(t => t.isReconciled).length;
    const pendingCount = totalCount - reconciledCount;
    return {
      totalCount,
      totalExpected,
      totalCash,
      totalOnline,
      totalReceived,
      reconciledCount,
      pendingCount,
      connTxs
    };
  }, [transactions]);

  // Bulk reconcile all pending driver connections
  const handleReconcileAllDriverConnections = async () => {
    const pendingTxs = transactions.filter(t => t.category === 'Driver Connection' && !t.isReconciled);
    if (pendingTxs.length === 0) return;
    const totalPendingCash = pendingTxs.reduce((sum, t) => sum + (t.cashAmount || 0), 0);

    if (confirm(`Settle all ${pendingTxs.length} pending driver connections for month-end? This will credit ${fmtCurr(totalPendingCash)} cash into Cash Collection and Till.`)) {
      const todayMonth = new Date().toISOString().slice(0, 7);

      // Optimistic state update
      setTransactions(prev => prev.map(t => {
        if (t.category === 'Driver Connection' && !t.isReconciled) {
          return {
            ...t,
            isReconciled: true,
            reconciledMonth: todayMonth,
            updatedAt: new Date().toISOString()
          };
        }
        return t;
      }));

      setToast({
        type: 'success',
        message: `✓ All ${pendingTxs.length} driver connections settled! +${fmtCurr(totalPendingCash)} cash credited to Till.`
      });

      for (const tx of pendingTxs) {
        await saveCashTransaction({
          ...tx,
          isReconciled: true,
          reconciledMonth: todayMonth
        }, tx.id);

        if (tx.linkedTechnicianLogId) {
          try {
            await updateDoc(doc(db, 'technician_logs', tx.linkedTechnicianLogId), {
              isReconciled: true,
              reconciledMonth: todayMonth,
              updatedAt: new Date().toISOString()
            });
          } catch (e) {}
        }
      }
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    let headers: string[] = [];
    let rows: string[][] = [];

    if (activeTab === 'collections') {
      headers = ['Date', 'Category', 'Station', 'Driver Name', 'Driver ID', 'Phone', 'Expected', 'Cash', 'Online', 'Total Received', 'Pending', 'Status', 'Ref', 'Collector', 'Receipt Link', 'Notes'];
      rows = filteredTransactions.map(t => [
        t.date,
        t.category,
        t.stationName || '--',
        t.driverName || '--',
        t.driverId || '--',
        t.driverPhone || '--',
        String(t.expectedAmount),
        String(t.cashAmount),
        String(t.onlineAmount),
        String(t.totalReceived),
        String(t.pendingAmount),
        t.status,
        t.paymentReference || '--',
        t.collectedBy || '--',
        t.receiptUrl || '',
        t.notes || ''
      ]);
    } else if (activeTab === 'expenses') {
      headers = ['Ref ID', 'Date', 'Category', 'Description', 'Expensed Amount', 'Returned to Till', 'Net Expense', 'Status', 'Paid To', 'Station', 'Paid By', 'Receipt Link', 'Notes'];
      rows = filteredExpenses.map(e => [
        e.id,
        e.date,
        e.category,
        e.title,
        String(e.amount),
        String(e.returnedAmount || 0),
        String(Math.max(0, e.amount - (e.returnedAmount || 0))),
        e.status || 'Paid',
        e.paidTo,
        e.stationName || '--',
        e.paidBy,
        e.receiptUrl || '',
        e.notes || ''
      ]);
    } else if (activeTab === 'exchange') {
      headers = ['Transaction ID', 'Given Date', 'Given To', 'Exchange Type', 'Purpose', 'Given Out Amount', 'Received Back', 'Pending to Return', 'Status', 'Return Date', 'Handled By', 'Receipt Link', 'Notes'];
      rows = filteredExchanges.map(e => [
        e.id,
        e.givenDate,
        e.givenTo,
        e.exchangeType,
        e.givenPurpose,
        String(e.amount),
        String(e.returnedAmount || 0),
        String(Math.max(0, e.amount - (e.returnedAmount || 0))),
        e.status,
        e.returnDate || '--',
        e.handledBy,
        e.receiptUrl || '',
        e.notes || ''
      ]);
    } else {
      headers = ['Deposit Date', 'Bank Name', 'Amount', 'Account No', 'Ref / Slip No', 'Deposited By', 'Receipt Link', 'Notes'];
      rows = filteredDeposits.map(d => [
        d.depositDate,
        d.bankName,
        String(d.amount),
        d.accountNumber || '--',
        d.referenceNumber || '--',
        d.depositedBy,
        d.receiptUrl || '',
        d.notes || ''
      ]);
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cash_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      {/* Floating Action Feedback Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 max-w-md p-4 rounded-2xl shadow-2xl border flex items-center gap-3 backdrop-blur-md animate-in slide-in-from-top-4 duration-200 ${
          toast.type === 'success'
            ? 'bg-emerald-950/95 text-emerald-100 border-emerald-600/70 shadow-emerald-950/40'
            : toast.type === 'error'
            ? 'bg-rose-950/95 text-rose-100 border-rose-600/70 shadow-rose-950/40'
            : 'bg-zinc-900/95 text-zinc-100 border-zinc-700 shadow-zinc-950/40'
        }`}>
          <div className="p-1 rounded-full bg-white/10 shrink-0">
            {toast.type === 'success' ? (
              <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
            ) : (
              <InformationCircleIcon className="w-5 h-5 text-indigo-400" />
            )}
          </div>
          <p className="text-xs font-semibold leading-relaxed flex-1">{toast.message}</p>
          <button
            onClick={() => setToast(null)}
            className="p-1 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-zinc-900 dark:text-white flex items-center gap-3">
            <span className="p-2 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
              <BanknotesIcon className="w-7 h-7" />
            </span>
            <span>Cash Collection & Settlements</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1 font-medium">
            Manage incoming cash/online collections, operational expenses, coin exchanges, and bank deposits.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setSelectedTx(null);
              setIsTxModalOpen(true);
            }}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-200 dark:shadow-none transition-all flex items-center gap-2 cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            <span>Record Collection</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards & Formula Bar */}
      <CashSummaryCards
        summary={summary}
        onOpenDepositModal={() => {
          setSelectedDeposit(null);
          setIsDepositModalOpen(true);
        }}
        onOpenExchangeModal={() => {
          setSelectedExchange(null);
          setIsExchangeModalOpen(true);
        }}
        onOpenExpenseModal={() => {
          setSelectedExpense(null);
          setIsExpenseModalOpen(true);
        }}
      />

      {/* Tabs Bar */}
      <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-1 overflow-x-auto scrollbar-hide whitespace-nowrap">
        {[
          { id: 'collections', label: 'Incoming Collections', icon: ArrowDownLeftIcon, count: transactions.length },
          { id: 'expenses', label: 'Expenses (Outgoing)', icon: ArrowUpRightIcon, count: expenses.length },
          { id: 'exchange', label: 'Cash / Coins Exchange', icon: ArrowsRightLeftIcon, count: exchanges.length },
          { id: 'deposits', label: 'Bank Deposits', icon: BuildingLibraryIcon, count: deposits.length },
          { id: 'reconciliation', label: 'Settlement & Audit', icon: ScaleIcon }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as ActiveTab);
                setCurrentPage(1);
              }}
              className={`flex items-center gap-2 px-5 py-3 rounded-t-xl text-xs font-bold transition-all border-b-2 flex-shrink-0 cursor-pointer ${
                isActive 
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/10 dark:text-indigo-400' 
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] ${
                  isActive ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300' : 'bg-zinc-100 dark:bg-zinc-800'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search & Filter Controls (for tabular views) */}
      {activeTab !== 'reconciliation' && (
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {activeTab === 'collections' && (
              <>
                <div className="w-44">
                  <CustomSelect
                    options={CATEGORY_FILTER_OPTIONS}
                    value={categoryFilter}
                    onChange={(val) => {
                      setCategoryFilter(val);
                      setCurrentPage(1);
                    }}
                    placeholder="Filter Category"
                  />
                </div>

                <div className="w-36">
                  <CustomSelect
                    options={STATUS_FILTER_OPTIONS}
                    value={statusFilter}
                    onChange={(val) => {
                      setStatusFilter(val);
                      setCurrentPage(1);
                    }}
                    placeholder="Filter Status"
                  />
                </div>
              </>
            )}

            {activeTab === 'exchange' && (
              <div className="w-48">
                <CustomSelect
                  options={EXCHANGE_STATUS_OPTIONS}
                  value={statusFilter}
                  onChange={(val) => {
                    setStatusFilter(val);
                    setCurrentPage(1);
                  }}
                  placeholder="Filter Status"
                />
              </div>
            )}

            <div className="w-36">
              <CustomDatePicker
                value={dateFilter}
                onChange={(val) => {
                  setDateFilter(val);
                  setCurrentPage(1);
                }}
                placeholder="Filter Date"
              />
            </div>

            {(searchQuery || categoryFilter !== 'all' || statusFilter !== 'all' || dateFilter) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setCategoryFilter('all');
                  setStatusFilter('all');
                  setDateFilter('');
                  setCurrentPage(1);
                }}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline px-2 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB 1: INCOMING COLLECTIONS */}
      {activeTab === 'collections' && (
        <div className="space-y-4">
          {/* Driver Connection Month-End Settlement Highlight Bar */}
          {driverConnStats.totalCount > 0 && (
            <div className="bg-gradient-to-r from-indigo-50/90 via-white to-emerald-50/90 dark:from-indigo-950/40 dark:via-zinc-900 dark:to-emerald-950/40 p-4 rounded-2xl border border-indigo-200/80 dark:border-indigo-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 shrink-0">
                  <UserIcon className="w-5 h-5" />
                </div>
                <div className="text-xs space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-zinc-900 dark:text-white text-sm">
                      Driver Connection Month-End Settlements
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300">
                      {driverConnStats.totalCount} Driver{driverConnStats.totalCount > 1 ? 's' : ''} ({fmtCurr(driverConnStats.totalReceived)})
                    </span>
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-400 text-xs">
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold font-mono">
                      ✓ {fmtCurr(summary.driverConnReconciledAmount)}
                    </span> ({driverConnStats.reconciledCount} settled & credited into Till)
                    <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">•</span>
                    <span className="text-amber-700 dark:text-amber-400 font-bold font-mono">
                      ⏳ {fmtCurr(summary.driverConnPendingAmount)}
                    </span> ({driverConnStats.pendingCount} pending month-end settlement)
                  </p>
                </div>
              </div>

              {driverConnStats.pendingCount > 0 && (
                <button
                  type="button"
                  onClick={handleReconcileAllDriverConnections}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer self-start sm:self-auto active:scale-95"
                >
                  <CheckCircleIcon className="w-4 h-4" />
                  <span>Settle All Pending ({driverConnStats.pendingCount})</span>
                </button>
              )}
            </div>
          )}

          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left whitespace-nowrap min-w-[1000px] border-collapse">
                <thead className="bg-zinc-50/95 dark:bg-zinc-900/95 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
                  <tr>
                    <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Date / Category</th>
                    <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Station / Driver</th>
                    <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500 text-right">Expected (₹)</th>
                    <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-emerald-600 dark:text-emerald-400 text-right">Cash (₹)</th>
                    <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-indigo-600 dark:text-indigo-400 text-right">Online (₹)</th>
                    <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500 text-right">Pending (₹)</th>
                    <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Status</th>
                    <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Receipt / Ref</th>
                    <th className="px-5 py-3.5 text-right text-[11px] font-bold uppercase text-zinc-500">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-16 text-center text-zinc-400 text-xs">
                        No incoming collections match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions
                      .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                      .map(tx => (
                        <tr key={tx.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-zinc-900 dark:text-white">
                                {tx.category}
                              </span>
                              {tx.category === 'Swap Collection' && (tx.swapPeriodFrom || tx.swapPeriodTo) && (
                                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded-md mt-0.5 w-fit border border-amber-200 dark:border-amber-800">
                                  📅 {tx.swapPeriodFrom || 'Start'} → {tx.swapPeriodTo || 'End'}
                                </span>
                              )}
                              {tx.category === 'Driver Connection' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleReconciliation(tx);
                                  }}
                                  disabled={togglingTxId === tx.id}
                                  title={
                                    tx.isReconciled
                                      ? `Settled at month-end: ${fmtCurr(tx.cashAmount)} cash is credited into Cash Collection & Till. Click to revert to pending.`
                                      : `Pending month-end settlement. Click to settle now and credit ${fmtCurr(tx.cashAmount)} cash into Cash Collection & Till.`
                                  }
                                  className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md mt-1 w-fit border transition-all cursor-pointer shadow-2xs active:scale-95 ${
                                    tx.isReconciled
                                      ? 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                      : 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700 hover:border-indigo-400'
                                  } ${togglingTxId === tx.id ? 'opacity-60 cursor-wait' : ''}`}
                                >
                                  {togglingTxId === tx.id ? (
                                    <span className="w-2.5 h-2.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin inline-block" />
                                  ) : (
                                    <span>{tx.isReconciled ? '✓' : '⏳'}</span>
                                  )}
                                  <span>{tx.isReconciled ? '✓ Month-End Reconciled' : '⏳ Settle at Month-End'}</span>
                                </button>
                              )}
                              <span className="text-[10px] font-mono text-zinc-400 mt-0.5">
                                {tx.date}
                              </span>
                            </div>
                          </td>

                        <td className="px-5 py-4">
                          {tx.category === 'Swap Collection' ? (
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                                <BuildingStorefrontIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                <span>Swap Operations Collection</span>
                              </span>
                              <span className="text-[10px] text-zinc-400 mt-0.5">
                                {tx.swapPeriodFrom && tx.swapPeriodTo 
                                  ? `Period: ${tx.swapPeriodFrom} → ${tx.swapPeriodTo}` 
                                  : 'Consolidated Swap Stations'}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <UserIcon className="w-3.5 h-3.5 text-zinc-400" />
                                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                                  {tx.driverName || 'Driver / Customer'}
                                </span>
                                {tx.driverId && (
                                  <span className="text-[10px] font-mono text-zinc-400">({tx.driverId})</span>
                                )}
                              </div>
                              {tx.stationName && (
                                <span className="text-[10px] text-zinc-400 flex items-center gap-1 mt-0.5">
                                  <BuildingStorefrontIcon className="w-3 h-3 text-zinc-400" />
                                  {tx.stationName}
                                </span>
                              )}
                              {tx.driverPhone && (
                                <span className="text-[10px] text-zinc-400 flex items-center gap-1 mt-0.5">
                                  <span>📞 {tx.driverPhone}</span>
                                </span>
                              )}
                              {tx.itemsSummary && (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1 mt-0.5">
                                  <span>🔧 {tx.itemsSummary}</span>
                                  {tx.collectedBy ? <span className="text-zinc-400">({tx.collectedBy})</span> : null}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-4 text-right">
                          <span className="text-xs font-bold font-mono text-zinc-700 dark:text-zinc-300">
                            {fmtCurr(tx.expectedAmount)}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                              {fmtCurr(tx.cashAmount)}
                            </span>
                            {tx.denominations && tx.denominations.total ? (
                              <span 
                                className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 mt-0.5 border border-emerald-200 dark:border-emerald-800/60"
                                title="Notes & coins denominations recorded"
                              >
                                Deno: ₹{tx.denominations.total.toLocaleString('en-IN')}
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <span className="text-xs font-bold font-mono text-indigo-600 dark:text-indigo-400">
                            {fmtCurr(tx.onlineAmount)}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <span className={`text-xs font-bold font-mono ${tx.pendingAmount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-400'}`}>
                            {fmtCurr(tx.pendingAmount)}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase border ${
                            tx.status === 'Received'
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                              : tx.status === 'Partial Received'
                              ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                              : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                          }`}>
                            {tx.status}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            {tx.receiptUrl ? (
                              <a
                                href={tx.receiptUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 rounded-md text-[10px] font-bold flex items-center gap-1 transition-colors"
                                title="Open Google Drive Receipt"
                              >
                                <span>Drive Link</span>
                                <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-[10px] text-zinc-400 italic">No receipt</span>
                            )}
                            {tx.paymentReference && (
                              <span className="text-[10px] font-mono text-zinc-400">
                                {tx.paymentReference}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedTx(tx);
                                setIsTxModalOpen(true);
                              }}
                              className="p-1.5 text-zinc-400 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer"
                              title="Edit"
                            >
                              <PencilSquareIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm("Delete this transaction entry?")) {
                                  deleteCashTransaction(tx.id);
                                }
                              }}
                              className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                              title="Delete"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>

          <PaginationFooter
            currentPage={currentPage}
            totalPages={Math.ceil(filteredTransactions.length / itemsPerPage) || 1}
            itemsPerPage={itemsPerPage}
            dataLength={filteredTransactions.length}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(val) => {
              setItemsPerPage(val);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>
      )}

      {/* TAB 2: OPERATIONAL EXPENSES */}
      {activeTab === 'expenses' && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-950/20">
            <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              Operational Expenses Log ({filteredExpenses.length})
            </h3>
            <button
              onClick={() => {
                setSelectedExpense(null);
                setIsExpenseModalOpen(true);
              }}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Record Expense</span>
            </button>
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left whitespace-nowrap min-w-[980px] border-collapse">
              <thead className="bg-zinc-50/95 dark:bg-zinc-900/95 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
                <tr>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Ref ID / Date</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Category / Description</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Paid To / Station</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-600 dark:text-zinc-400 text-right">Expensed (₹)</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-emerald-600 dark:text-emerald-400 text-right">Returned to Till (₹)</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-rose-600 dark:text-rose-400 text-right">Net Expense (₹)</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Status</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Bill / Slip</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold uppercase text-zinc-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-zinc-400 text-xs">
                      No expenses logged matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map(exp => {
                      const orig = Number(exp.amount) || 0;
                      const returned = Number(exp.returnedAmount) || 0;
                      const netExpense = Math.max(0, orig - returned);

                      return (
                        <tr key={exp.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-mono font-bold text-zinc-900 dark:text-white">
                                #{exp.id.length > 8 ? exp.id.slice(-6).toUpperCase() : exp.id}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-400 mt-0.5">{exp.date}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{exp.title}</span>
                              <span className="text-[10px] font-semibold text-zinc-500 mt-0.5">{exp.category}</span>
                              {exp.notes && <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-1">{exp.notes}</p>}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{exp.paidTo}</span>
                              {exp.stationName && <span className="text-[10px] text-zinc-400">{exp.stationName}</span>}
                              {exp.paidBy && <span className="text-[10px] text-zinc-400 italic">By: {exp.paidBy}</span>}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400 font-semibold">
                              {fmtCurr(orig)}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className={`text-xs font-mono font-bold ${returned > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
                              {returned > 0 ? `+${fmtCurr(returned)}` : '₹0'}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className={`text-xs font-bold font-mono ${netExpense > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-400'}`}>
                              {fmtCurr(netExpense)}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase border ${
                              exp.status === 'Returned to Cash Collection' || netExpense === 0
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                                : exp.status === 'Partially Returned' || returned > 0
                                ? 'bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                            }`}>
                              {exp.status === 'Returned to Cash Collection' || netExpense === 0
                                ? 'Fully Refunded'
                                : exp.status === 'Partially Returned' || returned > 0
                                ? 'Partially Returned'
                                : 'Paid'}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            {exp.receiptUrl ? (
                              <a
                                href={exp.receiptUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 rounded-md text-[10px] font-bold flex items-center gap-1 w-fit transition-colors"
                              >
                                <span>Drive Bill</span>
                                <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-[10px] text-zinc-400 italic">No bill</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex justify-end items-center gap-1.5">
                              {netExpense > 0 && (
                                <button
                                  onClick={() => {
                                    setExpenseForReturn(exp);
                                    setIsExpenseReturnModalOpen(true);
                                  }}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                                  title="Return unspent or refunded money back to Cash Collection"
                                >
                                  <ArrowDownLeftIcon className="w-3.5 h-3.5" />
                                  <span>Return to Till</span>
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setSelectedExpense(exp);
                                  setIsExpenseModalOpen(true);
                                }}
                                className="p-1.5 text-zinc-400 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer"
                                title="Edit Expense"
                              >
                                <PencilSquareIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm("Delete this expense entry?")) {
                                    deleteCashExpense(exp.id);
                                  }
                                }}
                                className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                title="Delete Expense"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>

          <PaginationFooter
            currentPage={currentPage}
            totalPages={Math.ceil(filteredExpenses.length / itemsPerPage) || 1}
            itemsPerPage={itemsPerPage}
            dataLength={filteredExpenses.length}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(val) => {
              setItemsPerPage(val);
              setCurrentPage(1);
            }}
          />
        </div>
      )}

      {/* TAB 3: CASH / COINS EXCHANGE */}
      {activeTab === 'exchange' && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-950/20">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                Cash & Coins Exchange Float Register ({filteredExchanges.length})
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Must return to Cash collection. Unreturned exchange reduces available Cash in Hand.
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedExchange(null);
                setIsExchangeModalOpen(true);
              }}
              className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Record Exchange</span>
            </button>
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left whitespace-nowrap min-w-[1000px] border-collapse">
              <thead className="bg-zinc-50/95 dark:bg-zinc-900/95 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
                <tr>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Ref ID / Given Date</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Given To / Purpose</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Type</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-600 dark:text-zinc-400 text-right">Given Out (₹)</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-emerald-600 dark:text-emerald-400 text-right">Received Back (₹)</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-rose-600 dark:text-rose-400 text-right">Pending Return (₹)</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Status</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Returned Date</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Receipt / Chit</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold uppercase text-zinc-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {filteredExchanges.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center text-zinc-400 text-xs">
                      No cash / coin exchange records found.
                    </td>
                  </tr>
                ) : (
                  filteredExchanges
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map(exc => {
                      const totalAmt = Number(exc.amount) || 0;
                      const returnedAmt = Number(exc.returnedAmount) || 0;
                      const pendingAmt = Math.max(0, totalAmt - returnedAmt);

                      return (
                        <tr key={exc.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-mono font-bold text-cyan-700 dark:text-cyan-400">
                                #{exc.id.length > 8 ? exc.id.slice(-6).toUpperCase() : exc.id}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-400 mt-0.5">{exc.givenDate}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{exc.givenTo}</span>
                              <span className="text-[10px] text-zinc-400 mt-0.5">{exc.givenPurpose}</span>
                              {exc.handledBy && <span className="text-[10px] text-zinc-400 italic">By: {exc.handledBy}</span>}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-bold">
                              {exc.exchangeType}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-xs font-bold font-mono text-zinc-700 dark:text-zinc-300">
                                {fmtCurr(totalAmt)}
                              </span>
                              {exc.denominations && exc.denominations.total ? (
                                <span 
                                  className="text-[9px] font-mono px-1 py-0.2 rounded bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 mt-0.5 border border-cyan-200 dark:border-cyan-800/60"
                                  title="Notes & coins denominations recorded"
                                >
                                  Deno: ₹{exc.denominations.total.toLocaleString('en-IN')}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className={`text-xs font-bold font-mono ${returnedAmt > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
                              {returnedAmt > 0 ? `+${fmtCurr(returnedAmt)}` : '₹0'}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className={`text-xs font-bold font-mono ${pendingAmt > 0 ? 'text-rose-500 font-bold' : 'text-zinc-400'}`}>
                              {fmtCurr(pendingAmt)}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${
                              exc.status === 'Returned to Cash Collection' || pendingAmt === 0
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                                : exc.status === 'Partially Returned' || returnedAmt > 0
                                ? 'bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800'
                                : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 animate-pulse'
                            }`}>
                              {exc.status === 'Returned to Cash Collection' || pendingAmt === 0
                                ? 'Returned to Collection'
                                : exc.status === 'Partially Returned' || returnedAmt > 0
                                ? 'Partially Returned'
                                : 'Given (Pending Return)'}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
                              {exc.returnDate || '--'}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            {exc.receiptUrl ? (
                              <a
                                href={exc.receiptUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-1 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-100 rounded-md text-[10px] font-bold flex items-center gap-1 w-fit transition-colors"
                              >
                                <span>Drive Chit</span>
                                <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-[10px] text-zinc-400 italic">No chit</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex justify-end items-center gap-1.5">
                              {pendingAmt > 0 && (
                                <button
                                  onClick={() => {
                                    setExchangeForReturn(exc);
                                    setIsExchangeReturnModalOpen(true);
                                  }}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                                  title={`Receive Return against Transaction ID #${exc.id}`}
                                >
                                  <CheckCircleIcon className="w-3.5 h-3.5" />
                                  <span>Receive Return</span>
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setSelectedExchange(exc);
                                  setIsExchangeModalOpen(true);
                                }}
                                className="p-1.5 text-zinc-400 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer"
                                title="Edit Exchange"
                              >
                                <PencilSquareIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm("Delete this exchange entry?")) {
                                    deleteCashExchange(exc.id);
                                  }
                                }}
                                className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                title="Delete Exchange"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>

          <PaginationFooter
            currentPage={currentPage}
            totalPages={Math.ceil(filteredExchanges.length / itemsPerPage) || 1}
            itemsPerPage={itemsPerPage}
            dataLength={filteredExchanges.length}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(val) => {
              setItemsPerPage(val);
              setCurrentPage(1);
            }}
          />
        </div>
      )}

      {/* TAB 4: BANK DEPOSITS */}
      {activeTab === 'deposits' && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-950/20">
            <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              Bank Cash Deposits Log ({filteredDeposits.length})
            </h3>
            <button
              onClick={() => {
                setSelectedDeposit(null);
                setIsDepositModalOpen(true);
              }}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Record Deposit</span>
            </button>
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left whitespace-nowrap min-w-[900px] border-collapse">
              <thead className="bg-zinc-50/95 dark:bg-zinc-900/95 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
                <tr>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Date</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Bank Name / Account</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-blue-600 dark:text-blue-400 text-right">Amount Deposited (₹)</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Challan / Slip Ref</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Deposited By</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase text-zinc-500">Deposit Slip Link</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold uppercase text-zinc-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {filteredDeposits.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-zinc-400 text-xs">
                      No bank cash deposits logged.
                    </td>
                  </tr>
                ) : (
                  filteredDeposits
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map(dep => (
                      <tr key={dep.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                        <td className="px-5 py-4">
                          <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-200">{dep.depositDate}</span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{dep.bankName}</span>
                            {dep.accountNumber && <span className="text-[10px] font-mono text-zinc-400">{dep.accountNumber}</span>}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="text-xs font-bold font-mono text-blue-600 dark:text-blue-400">
                            {fmtCurr(dep.amount)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">{dep.referenceNumber || '--'}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">{dep.depositedBy}</span>
                        </td>
                        <td className="px-5 py-4">
                          {dep.receiptUrl ? (
                            <a
                              href={dep.receiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 rounded-md text-[10px] font-bold flex items-center gap-1 w-fit transition-colors"
                            >
                              <span>Drive Slip</span>
                              <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-[10px] text-zinc-400 italic">No slip</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedDeposit(dep);
                                setIsDepositModalOpen(true);
                              }}
                              className="p-1.5 text-zinc-400 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer"
                            >
                              <PencilSquareIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm("Delete this deposit entry?")) {
                                  deleteBankDeposit(dep.id);
                                }
                              }}
                              className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>

          <PaginationFooter
            currentPage={currentPage}
            totalPages={Math.ceil(filteredDeposits.length / itemsPerPage) || 1}
            itemsPerPage={itemsPerPage}
            dataLength={filteredDeposits.length}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(val) => {
              setItemsPerPage(val);
              setCurrentPage(1);
            }}
          />
        </div>
      )}

      {/* TAB 5: SETTLEMENT & RECONCILIATION AUDIT */}
      {activeTab === 'reconciliation' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-200">
          {/* Card 1: Cash In-Hand & Deposit Equation */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-5">
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <ScaleIcon className="w-5 h-5 text-indigo-500" />
                <span>Cash Collection Equation Audit</span>
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Total Deposited = Total Cash Collection − Total Left − Expenses − Exchange
              </p>
            </div>

            <div className="space-y-3 font-mono text-sm">
              <div className="flex justify-between items-center p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60">
                <span className="text-zinc-600 dark:text-zinc-400">Total Cash Collection (+)</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{fmtCurr(summary.totalCashCollection)}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60">
                <span className="text-zinc-600 dark:text-zinc-400">Cash Returned to Drawer / Till (+)</span>
                <span className="font-bold text-cyan-600 dark:text-cyan-400">+{fmtCurr(summary.totalCashReturnsBackToCollection)}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60">
                <span className="text-zinc-600 dark:text-zinc-400">Total Deposited in Bank (−)</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">{fmtCurr(summary.totalDeposited)}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60">
                <span className="text-zinc-600 dark:text-zinc-400">Net Operational Expenses (−)</span>
                <span className="font-bold text-rose-600 dark:text-rose-400">{fmtCurr(summary.totalExpenses)}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60">
                <span className="text-zinc-600 dark:text-zinc-400">Unreturned Coin / Cash Exchange Float (−)</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">{fmtCurr(summary.totalExchangePending)}</span>
              </div>
              <div className="flex justify-between items-center p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60">
                <div className="flex flex-col">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 font-sans">
                    Total Left (Cash in Hand)
                  </span>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-sans">
                    Net cash remaining in till / station drawer
                  </span>
                </div>
                <span className="text-xl font-black text-amber-700 dark:text-amber-300">
                  {fmtCurr(summary.totalLeft)}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Settled Total & Incoming Breakdown */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-5">
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <BuildingLibraryIcon className="w-5 h-5 text-purple-500" />
                <span>Settled Amounts & Revenue Realization</span>
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Settled = Cash Deposited in Bank + Online Direct Payments
              </p>
            </div>

            <div className="space-y-3 font-mono text-sm">
              <div className="flex justify-between items-center p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60">
                <span className="text-zinc-600 dark:text-zinc-400">Cash Deposited in Bank</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">{fmtCurr(summary.totalDeposited)}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60">
                <span className="text-zinc-600 dark:text-zinc-400">Online Direct Payment (UPI/Bank)</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">{fmtCurr(summary.totalOnlineCollection)}</span>
              </div>
              {summary.driverConnReconciledAmount > 0 && (
                <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
                  <span className="text-emerald-800 dark:text-emerald-300">Driver Connection (Month-End Settled)</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">+{fmtCurr(summary.driverConnReconciledAmount)}</span>
                </div>
              )}
              {summary.driverConnPendingAmount > 0 && (
                <div className="flex justify-between items-center p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40">
                  <span className="text-amber-800 dark:text-amber-300">Driver Connection (Pending Settlement)</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">{fmtCurr(summary.driverConnPendingAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/60">
                <div className="flex flex-col">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300 font-sans">
                    Total Settled Amount
                  </span>
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-sans">
                    Bank Credited + Digital Receipts
                  </span>
                </div>
                <span className="text-xl font-black text-purple-700 dark:text-purple-300">
                  {fmtCurr(summary.settled)}
                </span>
              </div>

              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center text-xs font-sans text-zinc-500">
                <span>Total Expected / Billed: <strong className="font-mono text-zinc-900 dark:text-white">{fmtCurr(summary.totalExpected)}</strong></span>
                <span>Unrealized / Overdue: <strong className="font-mono text-rose-600">{fmtCurr(summary.totalNotReceived)}</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <CashTransactionModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        onSave={saveCashTransaction}
        initialData={selectedTx}
      />

      <CashExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        onSave={saveCashExpense}
        initialData={selectedExpense}
      />

      <CashExchangeModal
        isOpen={isExchangeModalOpen}
        onClose={() => setIsExchangeModalOpen(false)}
        onSave={saveCashExchange}
        initialData={selectedExchange}
      />

      <BankDepositModal
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        onSave={saveBankDeposit}
        initialData={selectedDeposit}
      />

      <ReceiveExchangeReturnModal
        isOpen={isExchangeReturnModalOpen}
        onClose={() => {
          setIsExchangeReturnModalOpen(false);
          setExchangeForReturn(null);
        }}
        exchange={exchangeForReturn}
        onConfirmReturn={async (exchangeId, returnData) => {
          await recordExchangeReturn(exchangeId, returnData);
        }}
      />

      <ReceiveExpenseReturnModal
        isOpen={isExpenseReturnModalOpen}
        onClose={() => {
          setIsExpenseReturnModalOpen(false);
          setExpenseForReturn(null);
        }}
        expense={expenseForReturn}
        onConfirmReturn={async (expenseId, returnData) => {
          await recordExpenseReturn(expenseId, returnData);
        }}
      />
    </div>
  );
};

export default CashCollectionPage;
