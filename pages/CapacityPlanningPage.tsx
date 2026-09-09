
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { 
  PresentationChartLineIcon, 
  ArrowPathIcon,
  BuildingStorefrontIcon,
  Battery50Icon,
  ClockIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  BoltIcon,
  TableCellsIcon,
  CloudArrowUpIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { useBatteryData } from '@/hooks/useBatteryData';
import SortableHeader from '@/components/SortableHeader';
import { Station, SwappingSession } from '@/types';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, setDoc, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval, isBefore, parseISO, addHours } from 'date-fns';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  Legend,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis
} from 'recharts';

interface DailyStat {
  stationId: string;
  stationName: string;
  date: string;
  swapCount: number;
  peakHourlySwaps: number;
  hourly: number[];
  hourlyCategories: Record<number, Record<string, number>>;
}

const MANUAL_IMPORT_HEADERS = [
  "Swap ID", "Date/time", "Station ID", "Station Name", "Driver ID", "Driver Name", "Phone", "Mode Of Payment", "Vehicle Number", "Battery IN 1", "SOC Start 1", "Battery IN 2", "SOC Start 2", "Battery OUT 1", "SOC End 1", "Battery OUT 2", "SOC End 2", "SOC Consumed 1", "SOC Consumed 2", "Swap Start", "Swap End", "Duration", "Penalty Amount", "Penalty Paid Am", "Pending Penalty", "Swap Amount", "Total Amount", "Odometer Range 1", "Odometer Range 2"
];

const SWAP_UPLOAD_HEADERS = MANUAL_IMPORT_HEADERS;

const parseDate = (dateStr: any): Date => {
  if (dateStr instanceof Date) return dateStr;
  if (!dateStr) return new Date();
  
  const str = String(dateStr).trim();
  
  // Robustly parse DD/MM/YYYY or DD-MM-YYYY format
  const dmyRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?)?/i;
  const match = str.match(dmyRegex);
  
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

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

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
    <div className="space-y-2 h-full flex flex-col">
      <div className="flex-1 overflow-auto border border-zinc-200 dark:border-zinc-800 rounded-xl relative">
        <table className="w-full text-left text-xs border-collapse bg-white dark:bg-zinc-950 min-w-full">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-900 sticky top-0 z-10 shadow-sm">
              <th className="w-10 p-2 border-r border-b border-zinc-200 dark:border-zinc-800 text-center text-zinc-400 font-mono">#</th>
              {headers.map((h, i) => (
                <th key={i} className={`p-3 border-r border-b border-zinc-200 dark:border-zinc-800 font-bold uppercase text-zinc-500 dark:text-zinc-400 whitespace-nowrap ${i === 25 ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data.length > 500 ? data.slice(0, 500) : data).map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                <td className="p-2 border-r border-b border-zinc-200 dark:border-zinc-800 text-center bg-zinc-50 dark:bg-zinc-900 text-zinc-400 font-mono">{rIdx + 1}</td>
                {Array.from({ length: headers.length }).map((_, cIdx) => (
                  <td key={cIdx} className={`p-0 border-r border-b border-zinc-200 dark:border-zinc-800 ${cIdx === 25 ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}>
                    <input
                      id={`cell-${rIdx}-${cIdx}`}
                      value={row[cIdx] || ''}
                      onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)}
                      onPaste={(e) => onPasteEvent(e, rIdx, cIdx)}
                      className="w-full h-full px-4 py-3 bg-transparent outline-none focus:bg-indigo-50 dark:focus:bg-indigo-900/20 font-medium text-zinc-700 dark:text-zinc-200"
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

interface StationPlanning {
  station: Station;
  avgDailySwaps: number;
  maxPeakHourlySwaps: number;
  recommendedBatteries: number;
  currentBatteries: number;
  gap: number;
  status: 'Critical' | 'Warning' | 'Optimal';
  dailyStats: DailyStat[];
  categories: string[];
}

const CapacityPlanningPage: React.FC = () => {
  const { getAllDealers, getAllSwappingSessions } = useBatteryData();
  const [stations, setStations] = useState<Station[]>([]);
  const [planningData, setPlanningData] = useState<StationPlanning[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [isSyncing, setIsSyncing] = useState(false);
  const [expandedStation, setExpandedStation] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | 'none' }>({ key: 'gap', direction: 'desc' });
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadGridData, setUploadGridData] = useState<string[][]>(() => Array.from({ length: 50 }, () => Array(29).fill("")));
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        if (prev.direction === 'desc') return { key, direction: 'none' };
        return { key, direction: 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const handlePaste = (e: React.ClipboardEvent, rIdx: number, cIdx: number) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    if (!text) return;
    const newData = parsePasteData(text, uploadGridData, rIdx, cIdx, 29);
    setUploadGridData(newData);
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
        const newGridData = jsonData.map(row => Array.from({ length: 29 }, (_, i) => String(row[i] ?? "")));
        setUploadGridData(newGridData);
      } catch (err) { console.error("Excel import error:", err); }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const processUploadedData = async () => {
    const validRows = uploadGridData.filter(row => row[1]?.trim() !== "" && row[1] !== "Date/time");
    if (validRows.length === 0) { alert("No valid data found in the grid."); return; }

    setIsProcessing(true);
    setProcessingStatus('Processing swap sessions...');
    
    try {
      const dealers = await getAllDealers();
      setStations(dealers);

      // Aggregate raw sessions into DailyStat
      const statsMap: Record<string, Record<string, { count: number, hourly: number[], hourlyCategories: Record<number, Record<string, number>> }>> = {};
      const foundCategories = new Set<string>();
      let minDate = new Date(8640000000000000);
      let maxDate = new Date(-8640000000000000);
      
      validRows.forEach(row => {
        const timestampRaw = row[1]?.trim(); // Date/time is index 1
        const stationName = row[3]?.trim(); // Station Name is index 3
        const amountValue = row[25]?.trim() || "0";
        let amount = parseFloat(amountValue);
        if (isNaN(amount)) amount = 0;
        
        if (!timestampRaw || !stationName) return;

        const date = parseDate(timestampRaw);

        if (isNaN(date.getTime())) return;

        if (date < minDate) minDate = date;
        if (date > maxDate) maxDate = date;

        const dateStr = format(date, 'yyyy-MM-dd');
        const hour = date.getHours();
        const station = dealers.find(d => d.name === stationName || d.dealer_id === stationName);
        
        if (!station) return;

        if (!statsMap[station.dealer_id]) statsMap[station.dealer_id] = {};
        if (!statsMap[station.dealer_id][dateStr]) {
          statsMap[station.dealer_id][dateStr] = { 
            count: 0, 
            hourly: new Array(24).fill(0),
            hourlyCategories: {}
          };
        }
        
        statsMap[station.dealer_id][dateStr].count++;
        statsMap[station.dealer_id][dateStr].hourly[hour]++;

        // Categorize by amount (Dynamic)
        const cat = amount > 0 ? String(amount) : 'Other';
        foundCategories.add(cat);
        
        if (!statsMap[station.dealer_id][dateStr].hourlyCategories[hour]) {
          statsMap[station.dealer_id][dateStr].hourlyCategories[hour] = {};
        }
        statsMap[station.dealer_id][dateStr].hourlyCategories[hour][cat] = (statsMap[station.dealer_id][dateStr].hourlyCategories[hour][cat] || 0) + 1;
      });

      if (maxDate.getTime() > minDate.getTime()) {
        const diffTime = Math.abs(maxDate.getTime() - minDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
        setPlanningWindowDays(diffDays);
      }

      const planningStartDate = subDays(new Date(), planningWindowDays);
      const categoriesArray = Array.from(foundCategories).sort((a, b) => {
        const numA = parseFloat(a);
        const numB = parseFloat(b);
        if (isNaN(numA)) return 1;
        if (isNaN(numB)) return -1;
        return numA - numB;
      });
      
      const allPlanningData: StationPlanning[] = dealers.map(station => {
        const stationStats = statsMap[station.dealer_id] || {};
        const dailyStats: DailyStat[] = Object.entries(stationStats).map(([date, data]) => ({
          stationId: station.dealer_id,
          stationName: station.name,
          date,
          swapCount: data.count,
          peakHourlySwaps: Math.max(...data.hourly),
          hourly: data.hourly,
          hourlyCategories: data.hourlyCategories
        })).sort((a, b) => a.date.localeCompare(b.date));

        const windowStats = dailyStats.filter(s => !isBefore(parseISO(s.date), planningStartDate));
        const totalSwapsInWindow = windowStats.reduce((acc, s) => acc + s.swapCount, 0);
        const maxPeakHourly = Math.max(...windowStats.map(s => s.peakHourlySwaps), 0);
        const avgDaily = windowStats.length > 0 ? totalSwapsInWindow / windowStats.length : 0;

        const baseRequirement = maxPeakHourly * cycleTimeHrs;
        const withSafety = baseRequirement * (1 + (safetyMarginPercent / 100));
        const withGrowth = withSafety * (1 + (growthFactorPercent / 100));
        
        const recommended = Math.ceil(withGrowth);
        // User request: count of batteries that are present at station (not assigned to driver)
        const current = (station.battery_status?.all || station.total_battries || 0) - (station.battery_status?.assigned || 0);
        const gap = recommended - current;

        let status: 'Critical' | 'Warning' | 'Optimal' = 'Optimal';
        if (gap > 10) status = 'Critical';
        else if (gap > 0) status = 'Warning';

        return {
          station,
          avgDailySwaps: parseFloat(avgDaily.toFixed(1)),
          maxPeakHourlySwaps: maxPeakHourly,
          recommendedBatteries: recommended,
          currentBatteries: current,
          gap,
          status,
          dailyStats,
          categories: categoriesArray
        };
      });

      setPlanningData(allPlanningData.sort((a, b) => b.gap - a.gap));
      setShowUploadModal(false);
      setProcessingStatus('');
    } catch (err) {
      console.error('Processing failed:', err);
      alert('Error processing data. Check console.');
    } finally {
      setIsProcessing(false);
    }
  };

  const sortedPlanningData = useMemo(() => {
    if (sortConfig.direction === 'none') return planningData;
    return [...planningData].sort((a, b) => {
      const getNestedValue = (obj: any, path: string) => {
        if (path === 'station.name') return obj.station.name;
        return path.split(".").reduce((acc, part) => acc && acc[part], obj);
      };

      let aVal = getNestedValue(a, sortConfig.key);
      let bVal = getNestedValue(b, sortConfig.key);

      if (aVal === undefined || aVal === null) aVal = "";
      if (bVal === undefined || bVal === null) bVal = "";

      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [planningData, sortConfig]);
  const [timeRange, setTimeRange] = useState<'1D' | '7D' | '30D' | 'MAX'>('30D');

  // Variable Parameters
  const [chargingTimeHrs, setChargingTimeHrs] = useState(3);
  const [bufferMinutes, setBufferMinutes] = useState(30);
  const [planningWindowDays, setPlanningWindowDays] = useState(30);
  const [safetyMarginPercent, setSafetyMarginPercent] = useState(10);
  const [growthFactorPercent, setGrowthFactorPercent] = useState(0);

  const cycleTimeHrs = useMemo(() => chargingTimeHrs + (bufferMinutes / 60), [chargingTimeHrs, bufferMinutes]);

  useEffect(() => {
    if (stations.length > 0 && planningData.length > 0 && planningData[0].dailyStats.length > 0) {
      const planningStartDate = subDays(new Date(), planningWindowDays);
      
      const updatedData = planningData.map(item => {
        const windowStats = item.dailyStats.filter(s => !isBefore(parseISO(s.date), planningStartDate));
        const totalSwapsInWindow = windowStats.reduce((acc, s) => acc + s.swapCount, 0);
        const maxPeakHourly = Math.max(...windowStats.map(s => s.peakHourlySwaps), 0);
        const avgDaily = windowStats.length > 0 ? totalSwapsInWindow / windowStats.length : 0;

        const baseRequirement = maxPeakHourly * cycleTimeHrs;
        const withSafety = baseRequirement * (1 + (safetyMarginPercent / 100));
        const withGrowth = withSafety * (1 + (growthFactorPercent / 100));
        
        const recommended = Math.ceil(withGrowth);
        const gap = recommended - item.currentBatteries;

        let status: 'Critical' | 'Warning' | 'Optimal' = 'Optimal';
        if (gap > 10) status = 'Critical';
        else if (gap > 0) status = 'Warning';

        return {
          ...item,
          avgDailySwaps: parseFloat(avgDaily.toFixed(1)),
          maxPeakHourlySwaps: maxPeakHourly,
          recommendedBatteries: recommended,
          gap,
          status
        };
      });
      // Sort by gap descending
      setPlanningData(updatedData.sort((a, b) => b.gap - a.gap));
    }
  }, [chargingTimeHrs, bufferMinutes, planningWindowDays, safetyMarginPercent, growthFactorPercent, cycleTimeHrs]);

  useEffect(() => {
    const initData = async () => {
      try {
        const dealers = await getAllDealers();
        setStations(dealers);
        setPlanningData(dealers.map(d => ({
          station: d,
          avgDailySwaps: 0,
          maxPeakHourlySwaps: 0,
          recommendedBatteries: 0,
          currentBatteries: (d.total_battries || 0) - (d.battery_status?.assigned || 0),
          gap: 0,
          status: 'Optimal',
          dailyStats: [],
          categories: []
        })));
      } catch (err) {
        console.error('Init failed:', err);
      } finally {
        setLoading(false);
      }
    };
    initData();
  }, []);

  const totalRecommended = planningData.reduce((acc, p) => acc + p.recommendedBatteries, 0);
  const totalCurrent = planningData.reduce((acc, p) => acc + p.currentBatteries, 0);
  const totalGap = totalRecommended - totalCurrent;

  // Aggregated Analytics Calculations
  const aggregatedData = useMemo(() => {
    if (planningData.length === 0) return { trend: [], distribution: [], correlation: [], categories: [] };

    const now = subDays(new Date(), 1); // Last complete day
    let startDate: Date;
    
    if (timeRange === '1D') startDate = now;
    else if (timeRange === '7D') startDate = subDays(now, 6);
    else if (timeRange === '30D') startDate = subDays(now, 29);
    else startDate = parseISO('2026-01-01');

    const dateMap: Record<string, { date: string, totalSwaps: number, avgPeak: number, count: number }> = {};
    const stationTotals: Record<string, { name: string, total: number }> = {};
    const categoriesSet = new Set<string>();

    const hourlyProfile: Record<number, any> = {};
    // Initialize 24 hours
    for (let i = 0; i < 24; i++) {
      const h = i === 0 ? 12 : i > 12 ? i - 12 : i;
      const ampm = i >= 12 ? 'pm' : 'am';
      hourlyProfile[i] = { hour: `${h}${ampm}`, total: 0, count: 0 };
    }

    planningData.forEach(p => {
      if (p.categories) p.categories.forEach(cat => categoriesSet.add(cat));
      p.dailyStats.forEach(s => {
        const sDate = parseISO(s.date);
        if (!isBefore(sDate, startOfDay(startDate)) && !isBefore(endOfDay(now), sDate)) {
          // Trend data
          if (!dateMap[s.date]) {
            dateMap[s.date] = { date: s.date, totalSwaps: 0, avgPeak: 0, count: 0 };
          }
          dateMap[s.date].totalSwaps += s.swapCount;
          dateMap[s.date].avgPeak += s.peakHourlySwaps;
          dateMap[s.date].count += 1;

          // Distribution data
          if (!stationTotals[s.stationId]) {
            stationTotals[s.stationId] = { name: s.stationName, total: 0 };
          }
          stationTotals[s.stationId].total += s.swapCount;

          // Hourly Profile aggregation
          if (s.hourlyCategories) {
            Object.entries(s.hourlyCategories).forEach(([hourStr, categories]) => {
              const hour = parseInt(hourStr);
              let hourTotal = 0;
              Object.entries(categories).forEach(([cat, count]) => {
                categoriesSet.add(cat);
                hourlyProfile[hour][cat] = (hourlyProfile[hour][cat] || 0) + count;
                hourTotal += count;
              });
              hourlyProfile[hour].total += hourTotal;
              hourlyProfile[hour].count += 1;
            });
          }
        }
      });
    });

    const categoriesArray = Array.from(categoriesSet).sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (isNaN(numA)) return 1;
      if (isNaN(numB)) return -1;
      return numA - numB;
    });

    const trend = Object.values(dateMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        ...d,
        avgPeak: parseFloat((d.avgPeak / d.count).toFixed(1))
      }));

    const distribution = Object.values(stationTotals)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8); // Top 8 stations

    // Filter hourlyProfile to user request (7am to 11pm)
    const correlation = Object.entries(hourlyProfile)
      .map(([h, data]) => ({ ...data, h: parseInt(h) }))
      .filter(d => d.h >= 7 && d.h <= 23)
      .sort((a, b) => a.h - b.h);

    return { trend, distribution, correlation, categories: categoriesArray };
  }, [planningData, timeRange]);

  const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#71717a'];

  if (loading && !isSyncing) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-zinc-500 font-bold">Loading capacity data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold font-heading text-zinc-900 dark:text-white mb-2">Capacity Planning</h2>
          <p className="text-zinc-500 dark:text-zinc-400 font-semibold">Analyze swap history and optimize battery distribution.</p>
        </div>
        <button 
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-none"
        >
          <TableCellsIcon className="w-5 h-5" />
          Upload Swap History
        </button>
      </div>

      {/* Planning Parameters */}
      <div className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
            <InformationCircleIcon className="w-5 h-5 text-indigo-600" />
          </div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Planning Parameters</h3>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex justify-between">
              Charge Time <span>{chargingTimeHrs}h</span>
            </label>
            <input 
              type="range" min="1" max="5" step="0.5"
              value={chargingTimeHrs}
              onChange={(e) => setChargingTimeHrs(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <p className="text-[10px] text-zinc-500 font-bold">Time to full charge (51V 45Ah)</p>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex justify-between">
              Buffer Time <span>{bufferMinutes}m</span>
            </label>
            <input 
              type="range" min="0" max="120" step="5"
              value={bufferMinutes}
              onChange={(e) => setBufferMinutes(parseInt(e.target.value))}
              className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <p className="text-[10px] text-zinc-500 font-bold">Handling & safety buffer</p>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex justify-between">
              Planning Window <span>{planningWindowDays}d</span>
            </label>
            <input 
              type="range" min="7" max="90" step="1"
              value={planningWindowDays}
              onChange={(e) => setPlanningWindowDays(parseInt(e.target.value))}
              className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <p className="text-[10px] text-zinc-500 font-bold">Historical data window</p>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex justify-between">
              Safety Margin <span>{safetyMarginPercent}%</span>
            </label>
            <input 
              type="range" min="0" max="50" step="5"
              value={safetyMarginPercent}
              onChange={(e) => setSafetyMarginPercent(parseInt(e.target.value))}
              className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <p className="text-[10px] text-zinc-500 font-bold">Extra capacity for spikes</p>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex justify-between">
              Growth Factor <span>{growthFactorPercent}%</span>
            </label>
            <input 
              type="range" min="0" max="100" step="5"
              value={growthFactorPercent}
              onChange={(e) => setGrowthFactorPercent(parseInt(e.target.value))}
              className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <p className="text-[10px] text-zinc-500 font-bold">Anticipated demand growth</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl">
              <Battery50Icon className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Total Recommended</p>
              <p className="text-2xl font-black text-zinc-900 dark:text-white">{totalRecommended}</p>
            </div>
          </div>
          <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
            <div className="bg-indigo-600 h-full" style={{ width: `${(totalCurrent / Math.max(1, totalRecommended)) * 100}%` }}></div>
          </div>
          <p className="text-[10px] font-bold text-zinc-500 mt-2">Current: {totalCurrent} / {totalRecommended}</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-2xl">
              <ExclamationCircleIcon className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Overall Shortfall</p>
              <p className="text-2xl font-black text-red-600">{totalGap > 0 ? totalGap : 0}</p>
            </div>
          </div>
          <p className="text-[11px] font-bold text-zinc-500">Additional batteries needed across all stations to meet peak demand.</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl">
              <ClockIcon className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Cycle Parameters</p>
              <p className="text-2xl font-black text-zinc-900 dark:text-white">~{cycleTimeHrs.toFixed(1)} Hrs</p>
            </div>
          </div>
          <p className="text-[11px] font-bold text-zinc-500">Charge ({chargingTimeHrs}h) + Buffer ({bufferMinutes}m). Target wait time: &lt;10m.</p>
        </div>
      </div>

      {/* Network Analytics Section */}
      <div className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
              <PresentationChartLineIcon className="w-5 h-5 text-indigo-600" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Network Analytics Overview</h3>
          </div>
          
          <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
            {(['1D', '7D', '30D', 'MAX'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                  timeRange === range 
                    ? 'bg-white dark:bg-zinc-700 text-indigo-600 shadow-sm' 
                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Chart 1: Volume Trend */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex justify-between items-end">
              <div>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Swap Volume Trend</p>
                <p className="text-sm font-bold text-zinc-500">Total swaps across all stations</p>
              </div>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={aggregatedData.trend}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                    tickFormatter={(str) => timeRange === '1D' ? str : format(parseISO(str), 'MMM d')}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="totalSwaps" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Station Distribution */}
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Station Distribution</p>
              <p className="text-sm font-bold text-zinc-500">Top 8 stations by volume</p>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={aggregatedData.distribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="total"
                  >
                    {aggregatedData.distribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36}
                    content={({ payload }) => (
                      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4">
                        {payload?.map((entry: any, index: number) => (
                          <div key={`item-${index}`} className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
                            <span className="text-[10px] font-bold text-zinc-500 truncate max-w-[80px]">{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Demand Profile by Category */}
          <div className="lg:col-span-3 space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex justify-between items-end">
              <div>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Demand Activity Profile</p>
                <p className="text-sm font-bold text-zinc-500">Hourly Swap Volume by Amount Category</p>
              </div>
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={aggregatedData.correlation} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                  <XAxis 
                    dataKey="hour" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                    tickFormatter={(h) => {
                      const hour = parseInt(h);
                      const ampm = hour >= 12 ? 'pm' : 'am';
                      const formattedHour = hour % 12 === 0 ? 12 : hour % 12;
                      return `${formattedHour}${ampm}`;
                    }}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 'bold' }} />
                  <Line type="monotone" dataKey="total" name="Total Swaps" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: 'white' }} activeDot={{ r: 6 }} />
                  {aggregatedData.categories.map((cat, idx) => (
                    <Line 
                      key={cat}
                      type="monotone" 
                      dataKey={cat} 
                      name={`Swap: ${cat}`} 
                      stroke={COLORS[(idx + 1) % COLORS.length]} 
                      strokeWidth={2} 
                      dot={{ r: 3, strokeWidth: 2, fill: 'white' }} 
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Main Planning Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-zinc-100 dark:border-zinc-800">
          <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Station-wise Capacity Analysis</h3>
          <p className="text-sm text-zinc-500 font-semibold mt-1">Based on peak hourly demand from the last {planningWindowDays} days.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b border-zinc-100 dark:border-zinc-800">
                <SortableHeader label="Station" sortKey="station.name" currentSort={sortConfig as any} onSort={handleSort} className="px-8 whitespace-nowrap" />
                <SortableHeader label="Avg Daily" sortKey="avgDailySwaps" currentSort={sortConfig as any} onSort={handleSort} className="text-center whitespace-nowrap" />
                <SortableHeader label="Peak Hourly" sortKey="maxPeakHourlySwaps" currentSort={sortConfig as any} onSort={handleSort} className="text-center whitespace-nowrap" />
                <SortableHeader label="Recommended" sortKey="recommendedBatteries" currentSort={sortConfig as any} onSort={handleSort} className="text-center whitespace-nowrap" />
                <SortableHeader label="Current" sortKey="currentBatteries" currentSort={sortConfig as any} onSort={handleSort} className="text-center whitespace-nowrap" />
                <SortableHeader label="Gap" sortKey="gap" currentSort={sortConfig as any} onSort={handleSort} className="text-center whitespace-nowrap" />
                <SortableHeader label="Status" sortKey="status" currentSort={sortConfig as any} onSort={handleSort} className="text-center whitespace-nowrap" />
                <th className="px-8 h-14 whitespace-nowrap text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {sortedPlanningData.map((item) => (
                <React.Fragment key={item.station.dealer_id}>
                  <tr 
                    className={`group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer ${expandedStation === item.station.dealer_id ? 'bg-zinc-50 dark:bg-zinc-800/50' : ''}`}
                    onClick={() => setExpandedStation(expandedStation === item.station.dealer_id ? null : item.station.dealer_id)}
                  >
                    <td className="px-8 py-6 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl group-hover:bg-white dark:group-hover:bg-zinc-700 transition-colors">
                          <BuildingStorefrontIcon className="w-5 h-5 text-zinc-500" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white">{item.station.name}</p>
                          <p className="text-[10px] font-bold text-zinc-400">{item.station.dealer_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-6 text-center whitespace-nowrap">
                      <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{item.avgDailySwaps}</span>
                    </td>
                    <td className="px-6 py-6 text-center whitespace-nowrap">
                      <span className="text-sm font-bold text-zinc-900 dark:text-white">{item.maxPeakHourlySwaps}</span>
                    </td>
                    <td className="px-6 py-6 text-center whitespace-nowrap">
                      <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{item.recommendedBatteries}</span>
                    </td>
                    <td className="px-6 py-6 text-center whitespace-nowrap">
                      <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{item.currentBatteries}</span>
                    </td>
                    <td className="px-6 py-6 text-center whitespace-nowrap">
                      <span className={`text-sm font-black ${item.gap > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        {item.gap > 0 ? `+${item.gap}` : item.gap}
                      </span>
                    </td>
                    <td className="px-6 py-6 text-center whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        item.status === 'Critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        item.status === 'Warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      {expandedStation === item.station.dealer_id ? (
                        <ChevronUpIcon className="w-5 h-5 text-zinc-400 inline" />
                      ) : (
                        <ChevronDownIcon className="w-5 h-5 text-zinc-400 inline" />
                      )}
                    </td>
                  </tr>
                  
                  {/* Expanded Charts */}
                  {expandedStation === item.station.dealer_id && (
                    <tr>
                      <td colSpan={8} className="px-8 py-8 bg-zinc-50/30 dark:bg-zinc-950/30">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                          <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
                            <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                              <PresentationChartLineIcon className="w-4 h-4" /> Swap Trend ({timeRange})
                            </h4>
                            <div className="h-64 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={item.dailyStats.filter(s => {
                                  const sDate = parseISO(s.date);
                                  const now = subDays(new Date(), 1);
                                  let startDate: Date;
                                  if (timeRange === '1D') startDate = now;
                                  else if (timeRange === '7D') startDate = subDays(now, 6);
                                  else if (timeRange === '30D') startDate = subDays(now, 29);
                                  else startDate = parseISO('2026-01-01');
                                  return !isBefore(sDate, startOfDay(startDate)) && !isBefore(endOfDay(now), sDate);
                                })}>
                                  <defs>
                                    <linearGradient id="colorSwaps" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                                  <XAxis 
                                    dataKey="date" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                                    tickFormatter={(str) => timeRange === '1D' ? str : format(parseISO(str), 'MMM d')}
                                  />
                                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} />
                                  <Tooltip 
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                                  />
                                  <Area type="monotone" dataKey="swapCount" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorSwaps)" />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
                            <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                              <BoltIcon className="w-4 h-4" /> Peak Demand Trend ({timeRange})
                            </h4>
                            <div className="h-64 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={item.dailyStats.filter(s => {
                                  const sDate = parseISO(s.date);
                                  const now = subDays(new Date(), 1);
                                  let startDate: Date;
                                  if (timeRange === '1D') startDate = now;
                                  else if (timeRange === '7D') startDate = subDays(now, 6);
                                  else if (timeRange === '30D') startDate = subDays(now, 29);
                                  else startDate = parseISO('2026-01-01');
                                  return !isBefore(sDate, startOfDay(startDate)) && !isBefore(endOfDay(now), sDate);
                                })}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                                  <XAxis 
                                    dataKey="date" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                                    tickFormatter={(str) => timeRange === '1D' ? str : format(parseISO(str), 'MMM d')}
                                  />
                                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} />
                                  <Tooltip 
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                                  />
                                  <Bar dataKey="peakHourlySwaps" fill="#10b981" radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Methodology Section */}
      <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white shadow-xl shadow-indigo-200 dark:shadow-none">
        <div className="flex items-start gap-6">
          <div className="p-4 bg-white/10 rounded-3xl backdrop-blur-md">
            <InformationCircleIcon className="w-8 h-8 text-white" />
          </div>
          <div className="space-y-4">
            <h3 className="text-2xl font-bold">Planning Methodology</h3>
            <p className="text-indigo-100 font-medium leading-relaxed">
              Our capacity model ensures that even during peak demand periods, drivers do not wait more than 10 minutes for a fully charged battery. 
              We calculate the recommended inventory based on the highest hourly swap rate recorded at each station over the selected planning window ({planningWindowDays} days).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
              <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm border border-white/10">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Battery Specs</p>
                <p className="text-sm font-bold">51V 45Ah (80% DoD)</p>
              </div>
              <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm border border-white/10">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Charge Cycle</p>
                <p className="text-sm font-bold">{chargingTimeHrs} Hours</p>
              </div>
              <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm border border-white/10">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Buffer Time</p>
                <p className="text-sm font-bold">{bufferMinutes} Minutes</p>
              </div>
              <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm border border-white/10">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Growth Factor</p>
                <p className="text-sm font-bold">+{growthFactorPercent}% Scaling</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] w-full max-w-5xl h-[85vh] shadow-2xl flex flex-col animate-in fade-in zoom-in-95 border border-zinc-200 dark:border-zinc-800">
            <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                  <TableCellsIcon className="w-8 h-8 text-indigo-600" />
                  Upload Swap History
                </h3>
                <p className="text-sm font-bold text-zinc-500 mt-1">Paste your swap history data or upload an Excel file.</p>
              </div>
              <button 
                onClick={() => setShowUploadModal(false)}
                className="p-3 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-2xl transition-all border border-zinc-200 dark:border-zinc-700 text-zinc-500"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 p-8 flex flex-col gap-6 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-4 bg-indigo-50/50 dark:bg-indigo-900/10 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/30">
                <div className="flex items-center gap-4">
                  <div className="bg-white dark:bg-zinc-800 p-2 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700">
                    <InformationCircleIcon className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div className="text-[10px] leading-tight font-bold text-zinc-500 uppercase tracking-widest">
                    Standard Swap Report Format (29 Columns)
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-md cursor-pointer active:scale-95">
                    <CloudArrowUpIcon className="w-4 h-4" />
                    <span>Excel</span>
                    <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelImport} />
                  </label>
                  <button 
                    onClick={() => setUploadGridData(Array.from({ length: 50 }, () => Array(29).fill("")))}
                    className="px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                  >
                    Clear
                  </button>
                  <button 
                    onClick={processUploadedData}
                    disabled={isProcessing}
                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <BoltIcon className="w-4 h-4" />}
                    Process & Analyze
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 bg-zinc-50 dark:bg-zinc-950 rounded-2xl p-0.5 overflow-hidden">
                <ExcelGrid 
                  headers={SWAP_UPLOAD_HEADERS} 
                  data={uploadGridData} 
                  onChange={setUploadGridData}
                  onPasteEvent={handlePaste}
                />
              </div>

              {processingStatus && (
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 rounded-lg border border-indigo-100 dark:border-indigo-900/30 animate-pulse">
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  {processingStatus}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CapacityPlanningPage;
