
import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { format, eachDayOfInterval } from 'date-fns';
import { 
  ArrowUpTrayIcon, 
  UserGroupIcon, 
  CalendarIcon, 
  ChartBarIcon,
  ArrowTrendingUpIcon,
  CheckBadgeIcon,
  XMarkIcon,
  TableCellsIcon,
  CloudArrowUpIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';

import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  CartesianGrid 
} from 'recharts';

const MANUAL_IMPORT_HEADERS = [
  "Swap ID", "Date/time", "Station ID", "Station Name", "Driver ID", "Driver Name", "Phone", "Mode Of Payment", "Vehicle Number", 
  "Battery IN 1", "SOC Start 1", "Battery IN 2", "SOC Start 2", "Battery OUT 1", "SOC End 1", "Battery OUT 2", "SOC End 2", 
  "SOC Consumed 1", "SOC Consumed 2", "Swap Start", "Swap End", "Duration", "Penalty Amount", "Penalty Paid Am", 
  "Pending Penalty", "Swap Amount", "Total Amount", "Odometer Range 1", "Odometer Range 2"
];

const parsePasteData = (text: string, currentData: string[][], startRow: number, startCol: number, totalCols: number) => {
  const rows = text.split(/\r\n|\n|\r/);
  if (rows.length === 0 || (rows.length === 1 && rows[0] === '')) return currentData;
  const newRowCount = Math.max(currentData.length, startRow + rows.length);
  const newData = Array.from({ length: newRowCount }, (_, i) => currentData[i] ? [...currentData[i]] : Array(totalCols).fill(''));
  rows.forEach((rowStr, rIdx) => {
    const currentRow = startRow + rIdx;
    let cells: string[] = [];
    if (rowStr.includes('\t')) {
      cells = rowStr.split('\t');
    } else {
      cells = [rowStr];
    }
    cells.forEach((cellData, cIdx) => {
      const currentCol = startCol + cIdx;
      if (currentCol < totalCols) {
        newData[currentRow][currentCol] = cellData.trim().replace(/^"|"$/g, '').replace(/""/g, '"');
      }
    });
  });
  return newData;
};

const ExcelGrid: React.FC<{
  headers: string[];
  data: string[][];
  onChange: (newData: string[][]) => void;
  onPasteEvent: (e: React.ClipboardEvent, r: number, c: number) => void;
}> = ({ headers, data, onChange, onPasteEvent }) => {
  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    const newData = [...data];
    if (!newData[rowIndex]) newData[rowIndex] = Array(headers.length).fill('');
    newData[rowIndex] = [...newData[rowIndex]];
    newData[rowIndex][colIndex] = value;
    onChange(newData);
  };
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-xl max-h-[400px]">
        <table className="w-full text-left text-xs border-collapse bg-white dark:bg-zinc-950 min-w-[2500px]">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-900 sticky top-0 z-10 shadow-sm">
              <th className="w-10 p-2 border-r border-b border-zinc-200 dark:border-zinc-800 text-center text-zinc-400 font-mono">#</th>
              {headers.map((h, i) => (
                <th key={i} className="p-3 border-r border-b border-zinc-200 dark:border-zinc-800 font-bold uppercase text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data.length > 100 ? data.slice(0, 100) : data).map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                <td className="p-2 border-r border-b border-zinc-200 dark:border-zinc-800 text-center bg-zinc-50 dark:bg-zinc-900 text-zinc-400 font-mono">{rIdx + 1}</td>
                {Array.from({ length: headers.length }).map((_, cIdx) => (
                  <td key={cIdx} className="p-0 border-r border-b border-zinc-200 dark:border-zinc-800 min-w-[150px]">
                    <input
                      id={`cell-${rIdx}-${cIdx}`}
                      value={row[cIdx] || ''}
                      onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)}
                      onPaste={(e) => onPasteEvent(e, rIdx, cIdx)}
                      className="w-full h-full px-3 py-2.5 bg-transparent outline-none focus:bg-indigo-50 dark:focus:bg-indigo-900/20 font-medium text-zinc-700 dark:text-zinc-200"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface SwapData {
  driverId: string;
  driverName: string;
  timestamp: Date;
  dateStr: string;
}

interface DriverStats {
  id: string;
  name: string;
  totalSwaps: number;
  uniqueDays: Set<string>;
  dailyAverage: number;
  consistencyScore: number;
  dailySwaps: Record<string, number>;
}

const DriverInsightsPage: React.FC = () => {
  const [rawData, setRawData] = useState<SwapData[]>([]);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualGridData, setManualGridData] = useState<string[][]>(() => {
    try {
      const saved = localStorage.getItem('driver_insights_manual_grid_data');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return Array.from({ length: 15 }, () => Array(29).fill(""));
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'distribution' | 'trends' | 'ledger'>('distribution');
  const [driverSearch, setDriverSearch] = useState('');
  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('driver_insights_manual_grid_data', JSON.stringify(manualGridData));
    } catch (e) {}
  }, [manualGridData]);

  const handleManualPasteEvent = (e: React.ClipboardEvent, rIdx: number, cIdx: number) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    if (!text) return;
    const newData = parsePasteData(text, manualGridData, rIdx, cIdx, 29);
    setManualGridData(newData);
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        if (jsonData.length === 0) return;

        const newGridData = jsonData.map(row => 
          Array.from({ length: 29 }, (_, i) => {
            const val = row[i];
            if (val instanceof Date) return format(val, 'dd/MM/yyyy HH:mm:ss');
            return val !== undefined && val !== null ? String(val) : "";
          })
        );
        setManualGridData(newGridData);
      } catch (err) {
        console.error("Excel import error:", err);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const processManualData = () => {
    setIsProcessing(true);
    setError(null);
    try {
      const processed: SwapData[] = [];
      
      const parseDate = (str: any): Date | null => {
        if (str instanceof Date) return str;
        if (!str) return null;
        
        const s = String(str).trim();
        
        // Robustly parse DD/MM/YYYY or DD-MM-YYYY format
        const dmyRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?)?/i;
        const match = s.match(dmyRegex);
        
        if (match) {
          const day = parseInt(match[1]);
          const month = parseInt(match[2]);
          const year = parseInt(match[3]);
          
          let hours = match[4] ? parseInt(match[4]) : 0;
          const mins = match[5] ? parseInt(match[5]) : 0;
          const secs = match[6] ? parseInt(match[6]) : 0;
          const ampm = match[7];
          
          if (ampm) {
            if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
            if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
          }
          
          const d = new Date(year, month - 1, day, hours, mins, secs);
          if (!isNaN(d.getTime())) return d;
        }

        const parsed = new Date(s);
        return isNaN(parsed.getTime()) ? null : parsed;
      };

      manualGridData.forEach((row) => {
        const col0 = String(row[0] || '').trim();
        if (!col0 || col0 === 'Swap ID') return;
        
        const timestamp = parseDate(row[1]);
        if (timestamp) {
          processed.push({
            driverId: String(row[4] || 'Unknown'), // Driver ID is at index 4
            driverName: String(row[5] || 'Unknown'), // Driver Name is at index 5
            timestamp,
            dateStr: format(timestamp, 'yyyy-MM-dd')
          });
        }
      });

      if (processed.length > 0) {
        setRawData(processed.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()));
        setShowManualModal(false);
      } else {
        setError('No valid data found to process.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to process data');
    } finally {
      setIsProcessing(false);
    }
  };

  const insights = useMemo(() => {
    if (rawData.length === 0) return null;

    const statsMap: Record<string, DriverStats> = {};
    const allDays = new Set<string>();

    rawData.forEach(swap => {
      const dId = swap.driverId;
      if (!statsMap[dId]) {
        statsMap[dId] = {
          id: dId,
          name: swap.driverName,
          totalSwaps: 0,
          uniqueDays: new Set(),
          dailyAverage: 0,
          consistencyScore: 0,
          dailySwaps: {}
        };
      }
      statsMap[dId].totalSwaps += 1;
      statsMap[dId].uniqueDays.add(swap.dateStr);
      statsMap[dId].dailySwaps[swap.dateStr] = (statsMap[dId].dailySwaps[swap.dateStr] || 0) + 1;
      allDays.add(swap.dateStr);
    });

    const startDate = rawData[0].timestamp;
    const endDate = rawData[rawData.length - 1].timestamp;
    const sortedDays = Array.from(allDays).sort();
    const totalDaysInRange = eachDayOfInterval({ start: startDate, end: endDate }).length;

    const stats = Object.values(statsMap).map(s => ({
      ...s,
      dailyAverage: s.totalSwaps / (s.uniqueDays.size || 1),
      consistencyScore: (s.uniqueDays.size / totalDaysInRange) * 100
    }));

    // Daily swaps frequency distribution (how many driver-days had 1 swap, 2 swaps, etc.)
    const dailyFrequencyDist: Record<number, number> = {};
    Object.values(statsMap).forEach(driver => {
      Object.values(driver.dailySwaps).forEach(count => {
        dailyFrequencyDist[count] = (dailyFrequencyDist[count] || 0) + 1;
      });
    });

    const dailyFrequencyData = Object.entries(dailyFrequencyDist).map(([count, occurrences]) => ({
      name: `${count} Swap${Number(count) > 1 ? 's' : ''}/Day`,
      swaps: Number(count),
      occurrences
    })).sort((a, b) => a.swaps - b.swaps);

    // Lifetime total swap distribution (how many drivers had exactly X swaps in total)
    const lifetimeDist: Record<string, number> = {
      '1 swap': 0,
      '2 swaps': 0,
      '3 swaps': 0,
      '4 swaps': 0,
      '5 swaps': 0,
      '6-10 swaps': 0,
      '11+ swaps': 0
    };
    Object.values(statsMap).forEach(driver => {
      const tot = driver.totalSwaps;
      if (tot === 1) lifetimeDist['1 swap']++;
      else if (tot === 2) lifetimeDist['2 swaps']++;
      else if (tot === 3) lifetimeDist['3 swaps']++;
      else if (tot === 4) lifetimeDist['4 swaps']++;
      else if (tot === 5) lifetimeDist['5 swaps']++;
      else if (tot <= 10) lifetimeDist['6-10 swaps']++;
      else lifetimeDist['11+ swaps']++;
    });

    const lifetimeData = Object.entries(lifetimeDist).map(([key, val]) => ({
      category: key,
      drivers: val
    }));

    // Date-wise overall swaps and active drivers
    const dateWiseSwaps: Record<string, { totalSwaps: number; uniqueDrivers: Set<string> }> = {};
    rawData.forEach(swap => {
      if (!dateWiseSwaps[swap.dateStr]) {
        dateWiseSwaps[swap.dateStr] = {
          totalSwaps: 0,
          uniqueDrivers: new Set()
        };
      }
      dateWiseSwaps[swap.dateStr].totalSwaps += 1;
      dateWiseSwaps[swap.dateStr].uniqueDrivers.add(swap.driverId);
    });

    const dateTrendData = sortedDays.map(dateStr => {
      const item = dateWiseSwaps[dateStr];
      const parsedDate = new Date(dateStr + 'T00:00:00');
      return {
        dateStr,
        formattedDate: format(parsedDate, 'MMM d, yyyy'),
        shortDate: format(parsedDate, 'MMM d'),
        totalSwaps: item ? item.totalSwaps : 0,
        activeDrivers: item ? item.uniqueDrivers.size : 0,
        avgSwapsPerActiveDriver: item && item.uniqueDrivers.size > 0 
          ? parseFloat((item.totalSwaps / item.uniqueDrivers.size).toFixed(2)) 
          : 0
      };
    });

    // Calculate max daily swaps by any driver to highlight
    let maxDailySwapsByAnyDriver = 0;
    Object.values(statsMap).forEach(driver => {
      Object.values(driver.dailySwaps).forEach(count => {
        if (count > maxDailySwapsByAnyDriver) maxDailySwapsByAnyDriver = count;
      });
    });

    return {
      topSwappers: [...stats].sort((a, b) => b.totalSwaps - a.totalSwaps),
      consistentSwappers: [...stats].sort((a, b) => b.consistencyScore - a.consistencyScore),
      totalDrivers: stats.length,
      averageSwapsPerDriver: rawData.length / stats.length,
      dateRange: { start: startDate, end: endDate },
      totalDays: totalDaysInRange,
      dailyFrequencyData,
      lifetimeData,
      dateTrendData,
      dailyFrequencyDist,
      maxDailySwapsByAnyDriver,
      statsMap
    };
  }, [rawData]);

  const exportToCSV = (type: 'top' | 'consistent') => {
    if (!insights) return;
    
    let headers: string[] = [];
    let data: any[] = [];
    let filename = '';

    if (type === 'top') {
      headers = ['Rank', 'Driver Name', 'Driver ID', 'Total Swaps', 'Active Days', 'Avg Swaps/Day'];
      data = insights.topSwappers.map((d, i) => [
        i + 1,
        `"${d.name}"`,
        d.id,
        d.totalSwaps,
        d.uniqueDays.size,
        d.dailyAverage.toFixed(2)
      ]);
      filename = `top_performers_${format(new Date(), 'yyyyMMdd')}.csv`;
    } else {
      headers = ['Driver Name', 'Driver ID', 'Days Swapped', 'Total Range Days', 'Consistency Score (%)'];
      data = insights.consistentSwappers.map((d) => [
        `"${d.name}"`,
        d.id,
        d.uniqueDays.size,
        insights.totalDays,
        d.consistencyScore.toFixed(2)
      ]);
      filename = `consistent_swappers_${format(new Date(), 'yyyyMMdd')}.csv`;
    }

    const csvContent = [
      headers.join(','),
      ...data.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredLedgerDrivers = useMemo(() => {
    if (!insights) return [];
    if (!driverSearch.trim()) return insights.topSwappers;
    const query = driverSearch.toLowerCase();
    return insights.topSwappers.filter(
      d => d.name.toLowerCase().includes(query) || d.id.toLowerCase().includes(query)
    );
  }, [insights, driverSearch]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Driver Swapping Insights</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Analyze performance and consistency from swap history</p>
        </div>
        
        <button 
          onClick={() => setShowManualModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 dark:shadow-none hover:bg-indigo-700 transition-all active:scale-95"
        >
          <CloudArrowUpIcon className="w-5 h-5" />
          <span>Import Swap History</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 p-4 rounded-xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">!</div>
          <span className="text-sm font-semibold">{error}</span>
        </div>
      )}

      {!insights && !isProcessing && (
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-900/50">
          <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mb-4 text-zinc-400">
            <ChartBarIcon className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white">No Data Analyzed</h3>
          <p className="text-zinc-500 dark:text-zinc-400 max-w-sm text-center mt-2 font-medium">
            Click "Import Swap History" to paste or upload your data grid for analysis.
          </p>
        </div>
      )}

      {insights && (
        <>
          {/* Main Top Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-xl flex items-center justify-center">
                  <UserGroupIcon className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total Drivers</span>
              </div>
              <div className="text-2xl font-black text-zinc-900 dark:text-white">{insights.totalDrivers}</div>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-xl flex items-center justify-center">
                  <ArrowTrendingUpIcon className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total Swaps</span>
              </div>
              <div className="text-2xl font-black text-zinc-900 dark:text-white">{rawData.length}</div>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-orange-50 dark:bg-orange-900/20 text-orange-600 rounded-xl flex items-center justify-center">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Date Range</span>
              </div>
              <div className="text-sm font-bold text-zinc-900 dark:text-white">
                {format(insights.dateRange.start, 'MMM d')} - {format(insights.dateRange.end, 'MMM d, yyyy')}
              </div>
              <div className="text-[10px] text-zinc-400 mt-1 font-bold uppercase tracking-widest">{insights.totalDays} Days Analyzed</div>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/20 text-purple-600 rounded-xl flex items-center justify-center">
                  <CheckBadgeIcon className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Avg Swaps/Driver</span>
              </div>
              <div className="text-2xl font-black text-zinc-900 dark:text-white">{insights.averageSwapsPerDriver.toFixed(1)}</div>
            </div>
          </div>

          {/* Interactive Navigation Tab Switcher */}
          <div className="flex border-b border-zinc-200 dark:border-zinc-800 gap-1 overflow-x-auto pb-px">
            <button
              onClick={() => setActiveTab('distribution')}
              className={`flex items-center gap-2 px-6 py-3.5 border-b-2 font-bold text-sm transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'distribution'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <ChartBarIcon className="w-4 h-4" />
              <span>Swap Distribution</span>
            </button>
            <button
              onClick={() => setActiveTab('trends')}
              className={`flex items-center gap-2 px-6 py-3.5 border-b-2 font-bold text-sm transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'trends'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <ArrowTrendingUpIcon className="w-4 h-4" />
              <span>Date-Wise Trends</span>
            </button>
            <button
              onClick={() => setActiveTab('ledger')}
              className={`flex items-center gap-2 px-6 py-3.5 border-b-2 font-bold text-sm transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'ledger'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <UserGroupIcon className="w-4 h-4" />
              <span>Driver Daily Ledger</span>
            </button>
          </div>

          {/* Tab Content 1: Swap Distribution & Overview */}
          {activeTab === 'distribution' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Secondary Helper Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-zinc-50 dark:bg-zinc-900/30 p-5 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Single Swaps (1x)</span>
                  <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                    {insights.dailyFrequencyDist[1] || 0} <span className="text-xs font-bold text-zinc-400">Days</span>
                  </p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">Number of driver active days with exactly 1 swap</p>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-900/30 p-5 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Double Swaps (2x)</span>
                  <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                    {insights.dailyFrequencyDist[2] || 0} <span className="text-xs font-bold text-zinc-400">Days</span>
                  </p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">Number of driver active days with exactly 2 swaps</p>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-900/30 p-5 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Multiple Swaps (3x+)</span>
                  <p className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">
                    {Object.entries(insights.dailyFrequencyDist).filter(([k]) => Number(k) >= 3).reduce((sum, [_, v]) => sum + v, 0)} <span className="text-xs font-bold text-zinc-400">Days</span>
                  </p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">Number of driver active days with 3 or more swaps</p>
                </div>
              </div>

              {/* Graphical Analysis */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Daily frequency bar chart */}
                <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
                  <div className="mb-4">
                    <h4 className="font-bold text-zinc-900 dark:text-white text-base">Daily Swaps Frequency Distribution</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">Analyses how many swaps drivers take on a daily basis (Occurrences across entire history)</p>
                  </div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={insights.dailyFrequencyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} className="dark:hidden" />
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} className="hidden dark:block" />
                        <XAxis dataKey="name" fontSize={11} stroke="#71717a" />
                        <YAxis fontSize={11} stroke="#71717a" />
                        <Tooltip 
                          contentStyle={{ background: '#18181b', border: 'none', borderRadius: '12px', color: '#fff' }}
                        />
                        <Bar dataKey="occurrences" fill="#6366f1" radius={[8, 8, 0, 0]} name="Driver-Days" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Lifetime distribution chart */}
                <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
                  <div className="mb-4">
                    <h4 className="font-bold text-zinc-900 dark:text-white text-base">Lifetime Total Swaps Distribution</h4>
                    <p className="text-xs text-zinc-400 mt-0.5">How many drivers have completed exactly X swaps in total across entire history</p>
                  </div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={insights.lifetimeData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} className="dark:hidden" />
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} className="hidden dark:block" />
                        <XAxis dataKey="category" fontSize={11} stroke="#71717a" />
                        <YAxis fontSize={11} stroke="#71717a" />
                        <Tooltip 
                          contentStyle={{ background: '#18181b', border: 'none', borderRadius: '12px', color: '#fff' }}
                        />
                        <Bar dataKey="drivers" fill="#10b981" radius={[8, 8, 0, 0]} name="Drivers" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Classic rankings side-by-side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                    <h3 className="font-black text-zinc-900 dark:text-white flex items-center gap-2">
                      <ArrowTrendingUpIcon className="w-5 h-5 text-indigo-600" />
                      Top Performers (Max Swaps)
                    </h3>
                    <button 
                      onClick={() => exportToCSV('top')}
                      className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all text-zinc-400 hover:text-indigo-600 flex items-center gap-2 cursor-pointer"
                      title="Export to CSV"
                    >
                      <ArrowDownTrayIcon className="w-5 h-5" />
                      <span className="text-[10px] font-bold uppercase hidden sm:inline">Export</span>
                    </button>
                  </div>
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 sticky top-0">
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 whitespace-nowrap">Driver</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-center">Total Swaps</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-center">Active Days</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-right">Avg / Day</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {insights.topSwappers.slice(0, 50).map((driver, idx) => (
                          <tr key={driver.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 flex items-center justify-center text-[10px] font-bold">
                                  {idx + 1}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-zinc-900 dark:text-white">{driver.name}</span>
                                  <span className="text-[10px] text-zinc-400 font-mono">{driver.id}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="inline-flex px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 text-[10px] font-black">
                                {driver.totalSwaps}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center text-xs font-bold text-zinc-600 dark:text-zinc-400">
                              {driver.uniqueDays.size}
                            </td>
                            <td className="px-6 py-4 text-right text-xs font-bold text-zinc-900 dark:text-white">
                              {driver.dailyAverage.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                    <h3 className="font-black text-zinc-900 dark:text-white flex items-center gap-2">
                      <CalendarIcon className="w-5 h-5 text-emerald-600" />
                      Everyday Swappers (Consistency)
                    </h3>
                    <button 
                      onClick={() => exportToCSV('consistent')}
                      className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all text-zinc-400 hover:text-emerald-600 flex items-center gap-2 cursor-pointer"
                      title="Export to CSV"
                    >
                      <ArrowDownTrayIcon className="w-5 h-5" />
                      <span className="text-[10px] font-bold uppercase hidden sm:inline">Export</span>
                    </button>
                  </div>
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 sticky top-0">
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 whitespace-nowrap">Driver</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-center">Days Swapped</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-center">Range (Days)</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-right">Consistency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {insights.consistentSwappers.slice(0, 50).map((driver) => (
                          <tr key={driver.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-zinc-900 dark:text-white">{driver.name}</span>
                                <span className="text-[10px] text-zinc-400 font-mono">{driver.id}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="text-xs font-bold text-zinc-900 dark:text-white">
                                {driver.uniqueDays.size}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center text-xs font-bold text-zinc-600 dark:text-zinc-400">
                              {insights.totalDays}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full ${driver.consistencyScore > 80 ? 'bg-emerald-500' : driver.consistencyScore > 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                    style={{ width: `${driver.consistencyScore}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-black text-zinc-900 dark:text-white">{driver.consistencyScore.toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content 2: Date-Wise Swap Trends */}
          {activeTab === 'trends' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Daily Area Chart */}
              <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
                <div className="mb-4">
                  <h4 className="font-bold text-zinc-900 dark:text-white text-base">Daily Swapping Trend Timeline</h4>
                  <p className="text-xs text-zinc-400 mt-0.5">Chronological timeline showing total swaps vs. unique active drivers per day</p>
                </div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={insights.dateTrendData}>
                      <defs>
                        <linearGradient id="colorSwaps" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorDrivers" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} className="dark:hidden" />
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} className="hidden dark:block" />
                      <XAxis dataKey="shortDate" fontSize={11} stroke="#71717a" />
                      <YAxis fontSize={11} stroke="#71717a" />
                      <Tooltip 
                        contentStyle={{ background: '#18181b', border: 'none', borderRadius: '12px', color: '#fff' }}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="totalSwaps" stroke="#6366f1" fillOpacity={1} fill="url(#colorSwaps)" strokeWidth={2.5} name="Total Swaps" />
                      <Area type="monotone" dataKey="activeDrivers" stroke="#10b981" fillOpacity={1} fill="url(#colorDrivers)" strokeWidth={2.5} name="Unique Active Drivers" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Date-wise Table Grid */}
              <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
                  <h3 className="font-black text-zinc-900 dark:text-white text-base">Date-Wise Chronological Ledger</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Detailed view of performance trends for every day in the swap record</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">Date</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-center">Total Swaps</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-center">Unique Active Drivers</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-right">Avg Swaps / Active Driver</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {insights.dateTrendData.map((day) => (
                        <tr key={day.dateStr} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <td className="px-6 py-4 text-xs font-bold text-zinc-900 dark:text-white">
                            {day.formattedDate}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-black">
                              {day.totalSwaps}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                            {day.activeDrivers}
                          </td>
                          <td className="px-6 py-4 text-right text-xs font-bold text-zinc-900 dark:text-white">
                            {day.avgSwapsPerActiveDriver.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content 3: Driver Daily Swap Ledger */}
          {activeTab === 'ledger' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Search filter bar */}
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:max-w-md">
                  <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                  <input
                    type="text"
                    value={driverSearch}
                    onChange={(e) => setDriverSearch(e.target.value)}
                    placeholder="Search driver by Name or ID..."
                    className="w-full pl-11 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-zinc-800 dark:text-white placeholder-zinc-400 shadow-sm"
                  />
                </div>
                <div className="text-xs text-zinc-400 font-bold uppercase tracking-wider">
                  Showing {filteredLedgerDrivers.length} of {insights.topSwappers.length} Drivers
                </div>
              </div>

              {/* Ledger Driver Grid table */}
              <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
                        <th className="w-12 px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">#</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">Driver Details</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-center">Total Swaps</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-center">Swapped Days</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-center">Daily Average</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-right">Daily Log analysis</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {filteredLedgerDrivers.map((driver, idx) => {
                        const isExpanded = expandedDriverId === driver.id;
                        const dailyEntries = Object.entries(driver.dailySwaps).sort((a, b) => b[0].localeCompare(a[0]));
                        
                        const personalChartData = dailyEntries.slice().reverse().map(([dateStr, count]) => {
                          const parsedDate = new Date(dateStr + 'T00:00:00');
                          return {
                            date: format(parsedDate, 'MMM d'),
                            Swaps: count
                          };
                        });

                        return (
                          <React.Fragment key={driver.id}>
                            <tr 
                              onClick={() => setExpandedDriverId(isExpanded ? null : driver.id)}
                              className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer"
                            >
                              <td className="px-6 py-4 text-zinc-400 font-mono text-xs font-bold">{idx + 1}</td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-zinc-900 dark:text-white">{driver.name}</span>
                                  <span className="text-[10px] text-zinc-400 font-mono">{driver.id}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="inline-flex px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-black">
                                  {driver.totalSwaps}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                {driver.uniqueDays.size}
                              </td>
                              <td className="px-6 py-4 text-center text-xs font-bold text-zinc-800 dark:text-white">
                                {driver.dailyAverage.toFixed(2)}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700/80 rounded-xl text-[10px] font-bold text-zinc-600 dark:text-zinc-300 transition-all cursor-pointer">
                                  <span>{isExpanded ? 'Collapse' : 'Analyze Daily'}</span>
                                  {isExpanded ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
                                </button>
                              </td>
                            </tr>
                            
                            {/* Expandable Panel container */}
                            {isExpanded && (
                              <tr className="bg-zinc-50/50 dark:bg-zinc-900/10">
                                <td colSpan={6} className="px-8 py-6 border-y border-zinc-100 dark:border-zinc-800">
                                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-top-4 duration-300">
                                    
                                    {/* Stats Profile summary */}
                                    <div className="bg-white dark:bg-zinc-950 p-5 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
                                      <div>
                                        <h4 className="font-bold text-zinc-900 dark:text-white text-sm">Daily Frequency Breakdown</h4>
                                        <p className="text-[10px] text-zinc-400 mt-0.5">Analyzing the swap behaviors of {driver.name}</p>
                                      </div>
                                      
                                      <div className="my-4 space-y-2">
                                        <div className="flex justify-between items-center text-xs border-b border-zinc-100 dark:border-zinc-800/80 pb-2">
                                          <span className="text-zinc-400 font-semibold">Max swaps in a single day</span>
                                          <span className="font-black text-indigo-600 dark:text-indigo-400">
                                            {Math.max(...Object.values(driver.dailySwaps))} Swaps
                                          </span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs border-b border-zinc-100 dark:border-zinc-800/80 pb-2">
                                          <span className="text-zinc-400 font-semibold">Total swapping active days</span>
                                          <span className="font-bold text-zinc-800 dark:text-zinc-200">{driver.uniqueDays.size} days</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs pb-1">
                                          <span className="text-zinc-400 font-semibold">Daily swap average</span>
                                          <span className="font-bold text-zinc-800 dark:text-zinc-200">{driver.dailyAverage.toFixed(2)} swaps/day</span>
                                        </div>
                                      </div>

                                      <div className="bg-indigo-50/50 dark:bg-indigo-950/10 p-3 rounded-xl border border-indigo-100/40 dark:border-indigo-900/10">
                                        <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">Activity Counts</p>
                                        <div className="flex gap-4 mt-2">
                                          <div className="text-center flex-1">
                                            <p className="text-sm font-black text-indigo-600 dark:text-indigo-400">{Object.values(driver.dailySwaps).filter(c => c === 1).length}</p>
                                            <p className="text-[9px] text-zinc-400 font-semibold">1-Swap Days</p>
                                          </div>
                                          <div className="text-center flex-1">
                                            <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{Object.values(driver.dailySwaps).filter(c => c === 2).length}</p>
                                            <p className="text-[9px] text-zinc-400 font-semibold">2-Swap Days</p>
                                          </div>
                                          <div className="text-center flex-1">
                                            <p className="text-sm font-black text-purple-600 dark:text-purple-400">{Object.values(driver.dailySwaps).filter(c => c >= 3).length}</p>
                                            <p className="text-[9px] text-zinc-400 font-semibold">3+ Swap Days</p>
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Personal swap line chart */}
                                    <div className="bg-white dark:bg-zinc-950 p-5 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm flex flex-col h-[230px]">
                                      <h4 className="font-bold text-zinc-900 dark:text-white text-sm">Personal Daily Swap Timeline</h4>
                                      <div className="flex-1 mt-3 min-h-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                          <LineChart data={personalChartData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} className="dark:hidden" />
                                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} className="hidden dark:block" />
                                            <XAxis dataKey="date" fontSize={9} stroke="#71717a" />
                                            <YAxis fontSize={9} stroke="#71717a" allowDecimals={false} />
                                            <Tooltip contentStyle={{ background: '#18181b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '10px' }} />
                                            <Line type="monotone" dataKey="Swaps" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                          </LineChart>
                                        </ResponsiveContainer>
                                      </div>
                                    </div>

                                    {/* Scrollable list of exact logs */}
                                    <div className="bg-white dark:bg-zinc-950 p-5 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm flex flex-col h-[230px]">
                                      <h4 className="font-bold text-zinc-900 dark:text-white text-sm mb-2">Chronological Daily Logs</h4>
                                      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 text-xs">
                                        {dailyEntries.map(([dateStr, count]) => {
                                          const parsedDate = new Date(dateStr + 'T00:00:00');
                                          return (
                                            <div key={dateStr} className="flex justify-between items-center py-2 px-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-100/50 dark:border-zinc-800/30">
                                              <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                                                {format(parsedDate, 'PPPP')}
                                              </span>
                                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                                                count === 1 
                                                  ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-400' 
                                                  : count === 2 
                                                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400' 
                                                    : 'bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400'
                                              }`}>
                                                {count} Swap{count > 1 ? 's' : ''}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>

                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {showManualModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-[95vw] h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800">
            <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                  <CloudArrowUpIcon className="w-7 h-7 text-indigo-600" />
                  Import Swap History
                </h3>
                <p className="text-zinc-500 text-sm font-medium mt-1 font-sans">Paste your excel data into the grid below (Supports Tab-Separated values or Excel Upload)</p>
              </div>
              <button 
                onClick={() => setShowManualModal(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
              >
                <XMarkIcon className="w-6 h-6 text-zinc-400" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden p-8 flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-4 bg-indigo-50/50 dark:bg-indigo-900/10 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/30">
                <div className="flex items-center gap-4">
                  <div className="bg-white dark:bg-zinc-800 p-2 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700">
                    <TableCellsIcon className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div className="text-xs">
                    <p className="font-bold text-zinc-900 dark:text-white">Grid Interface</p>
                    <p className="text-zinc-500 font-medium">Supports direct Excel copy-paste</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100 dark:shadow-none cursor-pointer active:scale-95">
                    <CloudArrowUpIcon className="w-4 h-4" />
                    <span>Upload Excel</span>
                    <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelImport} />
                  </label>
                  <button 
                    onClick={() => setManualGridData(Array.from({ length: 15 }, () => Array(29).fill("")))}
                    className="px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                  >
                    Clear All
                  </button>
                  <button 
                    onClick={processManualData}
                    disabled={isProcessing}
                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 dark:shadow-none flex items-center gap-2"
                  >
                    {isProcessing ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <ChartBarIcon className="w-4 h-4" />}
                    Analyze Data
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 bg-zinc-50 dark:bg-zinc-950 rounded-2xl p-0.5">
                <ExcelGrid 
                  headers={MANUAL_IMPORT_HEADERS} 
                  data={manualGridData} 
                  onChange={setManualGridData}
                  onPasteEvent={handleManualPasteEvent}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverInsightsPage;
