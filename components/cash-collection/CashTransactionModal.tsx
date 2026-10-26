import React, { useState, useEffect } from 'react';
import { 
  XMarkIcon, 
  BanknotesIcon, 
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { CashTransaction, IncomingCategory, CashStatus, CashDenomination } from '@/lib/cashCollectionStorage';
import CustomSelect from '@/components/CustomSelect';
import CustomDatePicker from '@/components/CustomDatePicker';
import CashDenominationSelector from './CashDenominationSelector';

interface CashTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tx: Omit<CashTransaction, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => Promise<any>;
  initialData?: CashTransaction | null;
}

const CATEGORIES: { value: IncomingCategory; label: string; desc: string }[] = [
  { value: 'Swap Collection', label: 'Swap Collection', desc: 'Swap collection for specific date range' },
  { value: 'Driver Connection', label: 'Driver Connection', desc: 'Driver onboarding deposit (reconciled at month end)' },
  { value: 'Replacement of Items', label: 'Replacement of Items', desc: 'Replacement items & spare parts revenue' },
  { value: 'Driver EMI', label: 'Driver EMI', desc: 'Driver vehicle or battery EMI collection' }
];

export const CashTransactionModal: React.FC<CashTransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData
}) => {
  const [category, setCategory] = useState<IncomingCategory>('Swap Collection');
  const [driverId, setDriverId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [stationName, setStationName] = useState('');
  const [expectedAmount, setExpectedAmount] = useState<string>('');
  const [cashAmount, setCashAmount] = useState<string>('');
  const [onlineAmount, setOnlineAmount] = useState<string>('');
  const [status, setStatus] = useState<CashStatus>('Received');
  const [swapPeriodFrom, setSwapPeriodFrom] = useState('');
  const [swapPeriodTo, setSwapPeriodTo] = useState('');
  const [denominations, setDenominations] = useState<CashDenomination>({});
  const [showDenomSection, setShowDenomSection] = useState(false);
  const [isReconciled, setIsReconciled] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [collectedBy, setCollectedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      const cat = initialData.category === 'Driver Repair' ? 'Replacement of Items' : (initialData.category || 'Swap Collection');
      setCategory(cat as IncomingCategory);
      setDriverId(initialData.driverId || '');
      setDriverName(initialData.driverName || '');
      setDriverPhone(initialData.driverPhone || '');
      setStationName(initialData.stationName || '');
      setExpectedAmount(String(initialData.expectedAmount || ''));
      setCashAmount(String(initialData.cashAmount || ''));
      setOnlineAmount(String(initialData.onlineAmount || ''));
      setStatus(initialData.status || 'Received');
      setSwapPeriodFrom(initialData.swapPeriodFrom || '');
      setSwapPeriodTo(initialData.swapPeriodTo || '');
      setDenominations(initialData.denominations || {});
      setShowDenomSection(Boolean(initialData.denominations?.total || (initialData.cashAmount && initialData.cashAmount > 0)));
      setIsReconciled(Boolean(initialData.isReconciled));
      setReceiptUrl(initialData.receiptUrl || '');
      setPaymentReference(initialData.paymentReference || '');
      setCollectedBy(initialData.collectedBy || '');
      setNotes(initialData.notes || '');
      setDate(initialData.date || new Date().toISOString().split('T')[0]);
    } else {
      setCategory('Swap Collection');
      setDriverId('');
      setDriverName('');
      setDriverPhone('');
      setStationName('');
      setExpectedAmount('');
      setCashAmount('');
      setOnlineAmount('');
      setStatus('Received');
      setSwapPeriodFrom('');
      setSwapPeriodTo('');
      setDenominations({});
      setShowDenomSection(false);
      setIsReconciled(false);
      setReceiptUrl('');
      setPaymentReference('');
      setCollectedBy('');
      setNotes('');
      setDate(new Date().toISOString().split('T')[0]);
    }
  }, [initialData, isOpen]);

  // Auto-calculate status when amounts change
  const numExpected = parseFloat(expectedAmount) || 0;
  const numCash = parseFloat(cashAmount) || 0;
  const numOnline = parseFloat(onlineAmount) || 0;
  const numReceived = numCash + numOnline;
  const numPending = Math.max(0, numExpected - numReceived);

  useEffect(() => {
    if (!initialData) {
      if (numReceived >= numExpected && numExpected > 0) {
        setStatus('Received');
      } else if (numReceived > 0) {
        setStatus('Partial Received');
      } else {
        setStatus('Not Received');
      }
    }
  }, [numExpected, numCash, numOnline, initialData]);

  // If cash > 0, auto expand denomination section
  useEffect(() => {
    if (numCash > 0 && !showDenomSection) {
      setShowDenomSection(true);
    }
  }, [numCash]);

  if (!isOpen) return null;

  // Preset quick ranges for Swap Period
  const handleSwapRangePreset = (type: 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth') => {
    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = today.getMonth();

    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dt}`;
    };

    if (type === 'thisWeek') {
      const first = new Date(today);
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday
      first.setDate(diff);
      setSwapPeriodFrom(fmt(first));
      setSwapPeriodTo(fmt(today));
    } else if (type === 'lastWeek') {
      const first = new Date(today);
      const day = today.getDay();
      const diff = today.getDate() - day - 6; // Last week Monday
      first.setDate(diff);
      const last = new Date(first);
      last.setDate(first.getDate() + 6); // Last week Sunday
      setSwapPeriodFrom(fmt(first));
      setSwapPeriodTo(fmt(last));
    } else if (type === 'thisMonth') {
      const first = new Date(curYear, curMonth, 1);
      setSwapPeriodFrom(fmt(first));
      setSwapPeriodTo(fmt(today));
    } else if (type === 'lastMonth') {
      const first = new Date(curYear, curMonth - 1, 1);
      const last = new Date(curYear, curMonth, 0);
      setSwapPeriodFrom(fmt(first));
      setSwapPeriodTo(fmt(last));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numExpected <= 0 && numReceived <= 0) {
      alert("Please enter expected or received amount");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        category,
        driverId: category === 'Swap Collection' ? undefined : (driverId.trim() || undefined),
        driverName: category === 'Swap Collection' ? undefined : (driverName.trim() || undefined),
        driverPhone: category === 'Swap Collection' ? undefined : (driverPhone.trim() || undefined),
        stationName: category === 'Swap Collection' ? undefined : (stationName.trim() || undefined),
        expectedAmount: numExpected,
        cashAmount: numCash,
        onlineAmount: numOnline,
        totalReceived: numReceived,
        pendingAmount: numPending,
        status,
        swapPeriodFrom: category === 'Swap Collection' && swapPeriodFrom ? swapPeriodFrom : undefined,
        swapPeriodTo: category === 'Swap Collection' && swapPeriodTo ? swapPeriodTo : undefined,
        denominations: numCash > 0 && denominations && denominations.total ? denominations : undefined,
        isReconciled: category === 'Driver Connection' ? isReconciled : undefined,
        reconciledMonth: category === 'Driver Connection' && isReconciled ? date.slice(0, 7) : undefined,
        receiptUrl: receiptUrl.trim() || undefined,
        paymentReference: paymentReference.trim() || undefined,
        collectedBy: collectedBy.trim() || undefined,
        notes: notes.trim() || undefined,
        date: date || new Date().toISOString().split('T')[0]
      }, initialData?.id);
      onClose();
    } catch (err: any) {
      console.error(err);
      alert("Error saving transaction: " + (err.message || 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
              <BanknotesIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                {initialData ? 'Edit Incoming Collection' : 'Record Incoming Collection'}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Log cash/online receipt from swap, connection, replacement or EMI
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl transition-colors cursor-pointer">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 sm:p-6 space-y-4 sm:space-y-5 scrollbar-thin">
          {/* Category Selection */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
              Collection Category *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  type="button"
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border text-left flex flex-col justify-between cursor-pointer ${
                    category === cat.value
                      ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 shadow-xs ring-1 ring-indigo-500'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  <span className="truncate">{cat.label}</span>
                  {category === cat.value && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1"></span>}
                </button>
              ))}
            </div>
          </div>

          {/* DRIVER CONNECTION MONTH-END RECONCILIATION NOTICE */}
          {category === 'Driver Connection' && (
            <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 flex items-start gap-2.5 animate-in fade-in duration-200">
              <InformationCircleIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <span className="font-bold text-indigo-950 dark:text-indigo-200 block">
                  Driver Connection Month-End Reconciliation
                </span>
                <span className="text-indigo-700 dark:text-indigo-300 block text-[11px]">
                  Driver connection onboarding deposits are settled at month-end. When pending ("⏳ Settle at Month-End"), collections are preserved without inflating daily till. When checked as settled/reconciled, the cash amount is realized and credited directly into Cash Collection and Till.
                </span>
                <div className="pt-1 flex items-center gap-2">
                  <label className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isReconciled}
                      onChange={(e) => setIsReconciled(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Mark as Settled / Reconciled at Month-End (Credits to Cash Collection & Till)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* SWAP COLLECTION SPECIFIC STEP 1 & 2: EXPECTED AMOUNT -> SWAP RECEIVING PERIOD */}
          {category === 'Swap Collection' && (
            <>
              {/* Step 1: Expected Amount */}
              <div className="p-4 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-indigo-950 dark:text-indigo-200 uppercase tracking-wider">
                    1. Expected / Billed Swap Collection Amount (₹) *
                  </label>
                  <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                    Write expected amount first
                  </span>
                </div>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 15000"
                  value={expectedAmount}
                  onChange={(e) => setExpectedAmount(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-800 rounded-xl text-base font-bold font-mono focus:ring-2 focus:ring-indigo-500 outline-none text-zinc-900 dark:text-white"
                  required
                />
              </div>

              {/* Step 2: Swap Collection Receiving From Date to To Date */}
              <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/50 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <CalendarDaysIcon className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                      2. Swap Collection Receiving Period (Date Range) *
                    </span>
                  </div>
                  {/* Range presets */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleSwapRangePreset('thisWeek')}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-zinc-800 border border-amber-200 dark:border-amber-800 text-[10px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer"
                    >
                      This Week
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwapRangePreset('lastWeek')}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-zinc-800 border border-amber-200 dark:border-amber-800 text-[10px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer"
                    >
                      Last Week
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwapRangePreset('thisMonth')}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-zinc-800 border border-amber-200 dark:border-amber-800 text-[10px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer"
                    >
                      This Month
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwapRangePreset('lastMonth')}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-zinc-800 border border-amber-200 dark:border-amber-800 text-[10px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer"
                    >
                      Last Month
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CustomDatePicker
                    label="Receiving From Date"
                    value={swapPeriodFrom}
                    onChange={setSwapPeriodFrom}
                    placeholder="Select Start Date"
                  />
                  <CustomDatePicker
                    label="Receiving To Date"
                    value={swapPeriodTo}
                    onChange={setSwapPeriodTo}
                    placeholder="Select End Date"
                  />
                </div>
              </div>
            </>
          )}

          {/* NON-SWAP CATEGORIES: EXPECTED AMOUNT INPUT */}
          {category !== 'Swap Collection' && (
            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200/70 dark:border-zinc-800 space-y-2">
              <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                {category === 'Driver Connection' ? 'Security Deposit / Expected Amount (₹) *' : 'Expected / Billed Amount (₹) *'}
              </label>
              <input
                type="number"
                step="any"
                placeholder="0"
                value={expectedAmount}
                onChange={(e) => setExpectedAmount(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-base font-bold font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>
          )}

          {/* PAYMENT RECEIVING: CASH & ONLINE SPLIT */}
          <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200/70 dark:border-zinc-800 space-y-3">
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block uppercase tracking-wider">
              {category === 'Swap Collection' ? '3. Received Collection (Cash & Online Split)' : 'Payment Collection (Cash & Online Split)'}
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                  Cash Received in Hand (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="0"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-emerald-300 dark:border-emerald-800/60 rounded-xl text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-indigo-600 dark:text-indigo-400 mb-1">
                  Online (UPI / Bank) (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="0"
                  value={onlineAmount}
                  onChange={(e) => setOnlineAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-indigo-300 dark:border-indigo-800/60 rounded-xl text-sm font-bold font-mono text-indigo-600 dark:text-indigo-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Quick summary line */}
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/60 flex flex-wrap items-center justify-between text-xs font-mono">
              <span className="text-zinc-500">
                Total Received: <strong className="text-zinc-900 dark:text-white font-bold">₹{numReceived.toLocaleString('en-IN')}</strong>
              </span>
              <span className={numPending > 0 ? 'text-rose-500 font-bold' : 'text-emerald-500 font-bold'}>
                Pending / Not Received: ₹{numPending.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* CASH DENOMINATIONS (NOTES & COINS COUNT) */}
          {(numCash > 0 || showDenomSection) && (
            <div className="space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                  {category === 'Swap Collection' ? '4. Cash Denominations (Notes & Coins Breakdown)' : 'Cash Denominations (Notes & Coins Breakdown)'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowDenomSection(false)}
                  className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer"
                >
                  Hide Breakdown
                </button>
              </div>
              <CashDenominationSelector
                value={denominations}
                onChange={setDenominations}
                targetCashAmount={numCash}
                onApplyTotalToCash={(total) => setCashAmount(String(total))}
              />
            </div>
          )}

          {/* Button to open Denominations if cash is 0 or hidden */}
          {(!showDenomSection || numCash === 0) && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => setShowDenomSection(true)}
                className="text-xs font-bold text-emerald-600 hover:underline cursor-pointer"
              >
                + Record Cash Notes & Coins Breakdown (500, 200, 100... notes & coins)
              </button>
            </div>
          )}

          {/* Status Selection */}
          <div className="grid grid-cols-3 gap-2">
            {(['Received', 'Partial Received', 'Not Received'] as CashStatus[]).map(st => (
              <button
                type="button"
                key={st}
                onClick={() => setStatus(st)}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold text-center border transition-all cursor-pointer ${
                  status === st
                    ? st === 'Received'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 shadow-xs'
                      : st === 'Partial Received'
                      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 shadow-xs'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800 shadow-xs'
                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-50'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Driver & Station Fields (Only for Driver Connection, Driver EMI, and Replacement - NOT required for Swap Collection) */}
          {category !== 'Swap Collection' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Driver Name / ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh Kumar (DRV-102)"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Driver Phone
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 9876543210"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Station / Hub Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Gurugram Cyber Hub Station"
                    value={stationName}
                    onChange={(e) => setStationName(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <CustomDatePicker
                    label="Payment Date"
                    value={date}
                    onChange={setDate}
                    required
                  />
                </div>
              </div>
            </>
          )}

          {/* Payment Date for Swap Collection */}
          {category === 'Swap Collection' && (
            <div>
              <CustomDatePicker
                label="Payment Date"
                value={date}
                onChange={setDate}
                required
              />
            </div>
          )}

          {/* Google Drive Receipt Link */}
          <div>
            <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Transaction Receipt (Google Drive Link)</span>
              {receiptUrl && (
                <a
                  href={receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 text-[11px] font-bold"
                >
                  <span>Test Link</span>
                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </a>
              )}
            </label>
            <input
              type="url"
              placeholder="https://drive.google.com/file/d/... or sharing link"
              value={receiptUrl}
              onChange={(e) => setReceiptUrl(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <p className="text-[10px] text-zinc-400 mt-1">
              Save Google Drive sharing link or file URL to avoid consuming database file storage.
            </p>
          </div>

          {/* Reference and Collector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                Ref / UTR / Chit No.
              </label>
              <input
                type="text"
                placeholder="e.g. UPI-12345678 or Slip #402"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                Collected By
              </label>
              <input
                type="text"
                placeholder="e.g. Operator Name"
                value={collectedBy}
                onChange={(e) => setCollectedBy(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
              Notes / Remarks
            </label>
            <textarea
              rows={2}
              placeholder="Optional notes or details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : initialData ? 'Update Collection' : 'Save Collection Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CashTransactionModal;
