import React from 'react';
import { 
  BanknotesIcon, 
  ArrowDownLeftIcon, 
  ArrowUpRightIcon, 
  BuildingLibraryIcon, 
  ScaleIcon, 
  ClockIcon, 
  ArrowsRightLeftIcon,
  CheckBadgeIcon
} from '@heroicons/react/24/outline';
import { CashCollectionSummary } from '@/lib/cashCollectionStorage';

interface CashSummaryCardsProps {
  summary: CashCollectionSummary;
  onOpenDepositModal: () => void;
  onOpenExchangeModal: () => void;
  onOpenExpenseModal: () => void;
}

export const CashSummaryCards: React.FC<CashSummaryCardsProps> = ({
  summary,
  onOpenDepositModal,
  onOpenExchangeModal,
  onOpenExpenseModal
}) => {
  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amt || 0);
  };

  return (
    <div className="space-y-4">
      {/* Visual Reconciliation Formula Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-zinc-900 to-emerald-950 text-white rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/30 text-emerald-300 border border-emerald-400/30">
                Cash Flow Formula
              </span>
              <span className="text-xs text-zinc-300">
                Cash in Till = Cash Collection + Returned to Till − Deposited − Net Expenses − Pending Exchange Float
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm sm:text-base font-black font-mono pt-1">
              <span className="text-emerald-400" title="Daily Cash Collections (Swaps, Replacements, EMI)">
                +{formatCurrency(summary.totalCashCollection)}
              </span>
              {summary.totalCashReturnsBackToCollection > 0 && (
                <>
                  <span className="text-zinc-500">+</span>
                  <span className="text-cyan-400" title="Returned Float & Expense Refunds back to drawer">
                    +{formatCurrency(summary.totalCashReturnsBackToCollection)}
                  </span>
                </>
              )}
              <span className="text-zinc-500">−</span>
              <span className="text-blue-400" title="Deposited into Bank Account">
                {formatCurrency(summary.totalDeposited)}
              </span>
              <span className="text-zinc-500">−</span>
              <span className="text-rose-400" title="Net Expenses Paid (Gross − Refunds)">
                {formatCurrency(summary.totalExpenses)}
              </span>
              <span className="text-zinc-500">−</span>
              <span className="text-amber-400" title="Pending Unreturned Exchange Float">
                {formatCurrency(summary.totalExchangePending)}
              </span>
              <span className="text-zinc-400">=</span>
              <span className="text-emerald-300 font-extrabold underline decoration-emerald-500 decoration-2 underline-offset-4" title="Physical Cash in Hand / Drawer">
                {formatCurrency(summary.totalLeft)} Left in Till
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onOpenDepositModal}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <BuildingLibraryIcon className="w-4 h-4" />
              <span>Record Deposit</span>
            </button>
            <button
              onClick={onOpenExchangeModal}
              className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-cyan-300 text-xs font-bold rounded-xl transition-all border border-zinc-700 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowsRightLeftIcon className="w-4 h-4" />
              <span>Exchange Float</span>
            </button>
            <button
              onClick={onOpenExpenseModal}
              className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-rose-300 text-xs font-bold rounded-xl transition-all border border-zinc-700 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowUpRightIcon className="w-4 h-4" />
              <span>Expense</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Cash Collection */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Cash Collection</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <BanknotesIcon className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl font-black text-zinc-900 dark:text-white font-mono">{formatCurrency(summary.totalCashCollection)}</p>
          <div className="flex flex-col">
            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Daily Incoming Cash</span>
            {summary.driverConnReconciledCash > 0 && (
              <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                +{formatCurrency(summary.driverConnReconciledCash)} Month-End Settled
              </span>
            )}
          </div>
        </div>

        {/* Returned to Collection (Exchanges & Expense Refunds) */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Returned to Till</span>
            <div className="p-1.5 rounded-lg bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400">
              <ArrowsRightLeftIcon className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl font-black text-cyan-600 dark:text-cyan-400 font-mono">+{formatCurrency(summary.totalCashReturnsBackToCollection)}</p>
          <span className="text-[10px] font-medium text-cyan-600 dark:text-cyan-400">
            {formatCurrency(summary.totalExchangeReturned)} exc + {formatCurrency(summary.totalExpensesReturned)} exp
          </span>
        </div>

        {/* Total Deposited in Bank */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Bank Deposited</span>
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
              <BuildingLibraryIcon className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl font-black text-zinc-900 dark:text-white font-mono">{formatCurrency(summary.totalDeposited)}</p>
          <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">Credited to Bank</span>
        </div>

        {/* Net Expenses */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Net Expenses</span>
            <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
              <ArrowUpRightIcon className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono">{formatCurrency(summary.totalExpenses)}</p>
          <span className="text-[10px] font-medium text-zinc-400">
            Gross: {formatCurrency(summary.totalExpensesOriginal)}
          </span>
        </div>

        {/* Exchange Float Pending */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Exchange Float Out</span>
            <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
              <ClockIcon className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono">{formatCurrency(summary.totalExchangePending)}</p>
          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">Pending Return</span>
        </div>

        {/* Total Left (Cash in Hand / Drawer) */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm bg-gradient-to-b from-white to-emerald-50/20 dark:from-zinc-900 dark:to-emerald-950/20">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Total Left (Till)</span>
            <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
              <ScaleIcon className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 font-mono">{formatCurrency(summary.totalLeft)}</p>
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Actual Cash in Drawer</span>
        </div>
      </div>
    </div>
  );
};
