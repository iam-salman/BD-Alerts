import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Battery50Icon, 
  ArrowPathIcon, 
  ClockIcon, 
  MapPinIcon, 
  BoltIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  CalendarIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ChevronDownIcon,
  ArrowDownTrayIcon,
  CloudArrowUpIcon,
  XMarkIcon,
  TableCellsIcon,
  SquaresPlusIcon,
  PlusIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Legend,
  AreaChart,
  Area,
  LineChart,
  Line
} from 'recharts';
import { KazamBattery, SwappingSession, Station, StationGroup } from '@/types';
import { getBatteries } from '@/lib/batteryService';
import { db } from '@/lib/firebase';
import { collection, getDocs, setDoc, doc, deleteDoc, query, where, Timestamp } from 'firebase/firestore';
import { useBatteryData } from '@/hooks/useBatteryData';
import CustomSelect from '../components/CustomSelect';
import { format, formatDistanceToNow, subDays, startOfMonth, endOfMonth, isWithinInterval, startOfDay, endOfDay, differenceInDays } from 'date-fns';

const MANUAL_IMPORT_HEADERS = [
  "Swap ID", "Date/time", "Station ID", "Station Name", "Driver ID", "Driver Name", "Phone", "Mode Of Payment", "Vehicle Number", 
  "Battery IN 1", "SOC Start 1", "Battery IN 2", "SOC Start 2", "Battery OUT 1", "SOC End 1", "Battery OUT 2", "SOC End 2", 
  "SOC Consumed 1", "SOC Consumed 2", "Swap Start", "Swap End", "Duration", "Penalty Amount", "Penalty Paid Am", 
  "Pending Penalty", "Swap Amount", "Total Amount", "Odometer Range 1", "Odometer Range 2"
];

const STORAGE_KEY = 'utilisation_swap_history';

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
            {(data.length > 50 ? data.slice(0, 50) : data).map((row, rIdx) => (
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
      {data.length > 50 && (
        <div className="flex justify-between items-center px-4 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
            Showing first 50 rows. Total data will be processed.
          </p>
        </div>
      )}
    </div>
  );
};

interface BatteryStats {
  id: string;
  model: string;
  totalSwaps: number;
  totalDistance: number;
  totalSocConsumed: number;
  driverActiveTimeMs: number;
  stationTimeMs: number;
  lastSwapTimestamp: number | null;
  lastReturnTimestamp: number | null;
  lastStationName?: string;
  city: string;
  currentState: 'Driver' | 'Station' | 'Unknown';
  ahDelivered: number;
  activeDays: Set<string>; // Set of YYYY-MM-DD strings
  utilization: 'Idle' | 'Low' | 'Healthy' | 'High';
  swapsPerDay: number;
  kmPerDay: number;
  swapsPerActiveDay: number;
  kmPerSwap: number;
}

const BatteryUtilisationPage: React.FC = () => {
  const [batteries, setBatteries] = useState<KazamBattery[]>([]);
  const [swapHistory, setSwapHistory] = useState<SwappingSession[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [cityGroups, setCityGroups] = useState<StationGroup[]>([]);
  const { getAllDealers } = useBatteryData();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupBy, setGroupBy] = useState<'none' | 'city'>('none');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  
  // Manual Import State
  const [showManualModal, setShowManualModal] = useState(false);
  const [isGroupsModalOpen, setIsGroupsModalOpen] = useState(false);
  const [manualGridData, setManualGridData] = useState<string[][]>(() => Array.from({ length: 15 }, () => Array(29).fill("")));
  const [isProcessingManual, setIsProcessingManual] = useState(false);

  const dateRange = useMemo(() => {
    if (swapHistory.length === 0) {
      return { start: startOfDay(new Date()), end: endOfDay(new Date()) };
    }
    const timestamps = swapHistory.map(s => s.timestamp * 1000);
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    return { start: startOfDay(new Date(minTs)), end: endOfDay(new Date(maxTs)) };
  }, [swapHistory]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [battRes, stationsRes] = await Promise.all([
          getBatteries(),
          getAllDealers()
        ]);

        if (battRes.success) setBatteries(battRes.data);
        if (!battRes.success) setError(battRes.error);
        if (stationsRes) setStations(stationsRes);

        // Fetch City Groups
        const groupsQuery = query(collection(db, 'station_groups'), where('type', '==', 'city'));
        const groupsSnap = await getDocs(groupsQuery);
        const groups = groupsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StationGroup));
        setCityGroups(groups);

        // Load and de-minify swap history from local storage
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            // Check if it's the new minified format or old format
            if (Array.isArray(parsed) && parsed.length > 0 && 'ts' in parsed[0]) {
              const restoredSessions: SwappingSession[] = parsed.map((m: any) => ({
                timestamp: m.ts || 0,
                old_battries: m.ob || [],
                new_battries: m.nb || [],
                odometer_range_1: m.or1 || 0,
                odometer_range_2: m.or2 || 0,
                soc_range_1: m.sr1 || 0,
                soc_range_2: m.sr2 || 0,
                // Dummy values for required non-essential fields to satisfy the SwappingSession type
                _id: Math.random().toString(36).substring(7),
                txn_id: '',
                payee_id: '',
                dealer_name: '',
                payer_id: '',
                driverData: { _id: '', driver_id: '', name: '', phone: '' },
                mode: 'cash',
                vehicle_number: '',
                soc_details: { old_soc: [], new_soc: [] },
                start_time: 0,
                end_time: 0,
                duration: 0,
                type: 1,
                amount: 0,
                dealer_share: 0,
                odometer_details: { old_odometer: [], new_odometer: [] },
                total_penalty_paid: 0,
                penalty_payment_count: 0
              }));
              setSwapHistory(restoredSessions);
            } else {
              setSwapHistory(parsed);
            }
          } catch (e) {
            console.error("Failed to parse saved swap history", e);
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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
        
        if (jsonData.length === 0) {
          alert("Excel file is empty.");
          return;
        }

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
        alert("Failed to parse Excel file.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const processManualData = () => {
    setIsProcessingManual(true);
    try {
      const newSessions: SwappingSession[] = [];
      let minTimestamp = Infinity;
      let maxTimestamp = -Infinity;
      
      const parseDate = (val: any) => {
        if (!val) return 0;
        const str = String(val).trim();
        if (!str) return 0;
        
        try {
          let d: Date | null = null;
          
          // First try to parse DD/MM/YYYY or DD-MM-YYYY format explicitly
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
            
            d = new Date(year, month - 1, day, hours, mins, secs);
          }
          
          // Fallback to native parsing
          if (!d || isNaN(d.getTime())) {
            d = new Date(str);
          }
          
          const ts = isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000);
          if (ts > 0) {
            minTimestamp = Math.min(minTimestamp, ts);
            maxTimestamp = Math.max(maxTimestamp, ts);
          }
          return ts;
        } catch(e) {
          return 0;
        }
      };

      const parseSOC = (val: any) => {
        if (val === undefined || val === null || val === '') return 0;
        const str = String(val).trim();
        return parseInt(str.replace('%', '')) || 0;
      };

      const parseFloatVal = (val: any) => {
        if (val === undefined || val === null || val === '') return 0;
        const num = parseFloat(String(val).replace(/[^0-9.]/g, ''));
        return isNaN(num) ? 0 : num;
      };

      manualGridData.forEach((row, idx) => {
        if (!row[0] || String(row[0]).trim() === '' || row[0] === 'Swap ID') return;
        
        const timestamp = parseDate(row[1]);
        if (timestamp === 0) return; // Skip invalid dates

        const session: SwappingSession = {
          _id: String(row[0]),
          txn_id: String(row[0]),
          timestamp: timestamp,
          payee_id: String(row[2] || ''),
          dealer_name: String(row[3] || ''),
          payer_id: String(row[4] || ''),
          driverData: {
            _id: String(row[4] || ''),
            driver_id: String(row[4] || ''),
            name: String(row[5] || 'Unknown'),
            phone: String(row[6] || '')
          },
          mode: (String(row[7] || 'cash')).toLowerCase(),
          vehicle_number: String(row[8] || ''),
          old_battries: [row[9], row[11]].filter(Boolean).map(String),
          new_battries: [row[13], row[15]].filter(Boolean).map(String),
          soc_details: {
            old_soc: [parseSOC(row[10]), parseSOC(row[12])],
            new_soc: [parseSOC(row[14]), parseSOC(row[16])]
          },
          soc_range_1: parseSOC(row[17]), // Related to Battery IN 1
          soc_range_2: parseSOC(row[18]), // Related to Battery IN 2
          start_time: parseDate(row[19]) || timestamp,
          end_time: parseDate(row[20]) || timestamp,
          duration: parseFloatVal(row[21]),
          penalty_amount: parseFloatVal(row[22]),
          penalty_paid_amount: parseFloatVal(row[23]),
          total_penalty_paid: parseFloatVal(row[23]),
          amount: parseFloatVal(row[25]),
          odometer_range_1: parseFloatVal(row[27]), // Related to Battery IN 1
          odometer_range_2: parseFloatVal(row[28]), // Related to Battery IN 2
          type: 1,
          penalty_payment_count: 1,
          dealer_share: 0,
          odometer_details: {
            old_odometer: [parseFloatVal(row[27])],
            new_odometer: [parseFloatVal(row[28])]
          }
        };
        newSessions.push(session);
      });

      if (newSessions.length > 0) {
        setSwapHistory(newSessions);

        // Minify data for storage to avoid QuotaExceededError
        const minifiedData = newSessions.map(s => ({
          ts: s.timestamp,
          ob: s.old_battries,
          nb: s.new_battries,
          or1: s.odometer_range_1,
          or2: s.odometer_range_2,
          sr1: s.soc_range_1,
          sr2: s.soc_range_2
        }));

        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(minifiedData));
        } catch (storageErr) {
          console.warn("Local storage quota exceeded, but data will persist in memory for this session.");
        }
        
        setShowManualModal(false);
      } else {
        alert("Could not find any valid swap sessions to process. Please check your data and date formats.");
      }
    } catch (err) {
      console.error("Manual processing error:", err);
      alert("Failed to process data. Check console for details.");
    } finally {
      setIsProcessingManual(false);
    }
  };

  const stationMap = useMemo(() => new Map(stations.map(s => [s.dealer_id, s])), [stations]);

  const stationIdToCity = useMemo(() => {
    const map = new Map<string, string>();
    cityGroups.forEach(group => {
      group.stationIds?.forEach(sid => {
        map.set(sid, group.name);
      });
    });
    return map;
  }, [cityGroups]);

  const cityOptions = useMemo(() => {
    // Get all cities from stations and custom groups
    const citiesFromStations = new Set(stations.map(s => s.city).filter(Boolean));
    const citiesFromGroups = new Set(cityGroups.map(g => g.name));
    const allCities = Array.from(new Set([...Array.from(citiesFromStations), ...Array.from(citiesFromGroups)] as string[])).sort();
    
    return [
      { value: 'all', label: 'All Cities' },
      ...allCities.map(c => ({ value: c, label: c }))
    ];
  }, [stations, cityGroups]);

  const daysInPeriod = useMemo(() => {
    if (swapHistory.length === 0) return 1;
    
    const start = startOfDay(dateRange.start);
    const end = endOfDay(dateRange.end);
    const diff = differenceInDays(end, start) + 1;
    return Math.max(1, diff);
  }, [dateRange]);

  const periodString = useMemo(() => {
    if (swapHistory.length === 0) return 'No data';
    return `${format(dateRange.start, 'MMM dd, yyyy')} - ${format(dateRange.end, 'MMM dd, yyyy')}`;
  }, [dateRange, swapHistory.length]);

  const utilisationData = useMemo(() => {
    const stats: Record<string, BatteryStats> = {};

    const getCityForDealer = (dealerId: string | undefined, dealerName?: string) => {
      const sid = dealerId || 'UNASSIGNED_POOL';
      return stationIdToCity.get(sid) || stationMap.get(sid)?.city || 'Station Unknown';
    };

    // Initialize stats for batteries
    batteries.forEach(b => {
      const city = getCityForDealer(b.dealer_id, b.dealer_name);
      
      // Filter by city if selected
      if (selectedCity !== 'all' && city !== selectedCity) return;

      const effectiveDealerName = b.dealer_id ? (b.dealer_name || 'Unknown Station') : 'UNASSIGNED ASSETS';

      stats[b.id] = {
        id: b.id,
        model: b.model,
        totalSwaps: 0,
        totalDistance: 0,
        totalSocConsumed: 0,
        driverActiveTimeMs: 0,
        stationTimeMs: 0,
        lastSwapTimestamp: null,
        lastReturnTimestamp: null,
        lastStationName: effectiveDealerName,
        city,
        currentState: 'Unknown',
        ahDelivered: 0,
        activeDays: new Set(),
        utilization: 'Idle',
        swapsPerDay: 0,
        kmPerDay: 0,
        swapsPerActiveDay: 0,
        kmPerSwap: 0
      };
    });

    // Process history
    const filteredHistory = swapHistory.filter(session => {
      const timestamp = session.timestamp * 1000;
      const withinDate = timestamp >= dateRange.start.getTime() && timestamp <= dateRange.end.getTime();
      if (!withinDate) return false;

      // Filter by city if selected
      if (selectedCity !== 'all') {
        const sessionCity = getCityForDealer(session.payee_id, session.dealer_name);
        if (sessionCity !== selectedCity) return false;
      }
      return true;
    });

    const sortedHistory = [...filteredHistory].sort((a, b) => a.timestamp - b.timestamp);

    sortedHistory.forEach(session => {
      const timestamp = session.timestamp * 1000;
      const dateStr = format(new Date(timestamp), 'yyyy-MM-dd');

      // Process batteries given to driver (new_battries)
      session.new_battries.forEach(battId => {
        if (!stats[battId]) {
          stats[battId] = {
            id: battId, model: 'Unknown', totalSwaps: 0, totalDistance: 0, totalSocConsumed: 0,
            driverActiveTimeMs: 0, stationTimeMs: 0, lastSwapTimestamp: null, lastReturnTimestamp: null,
            lastStationName: session.dealer_name,
            city: 'Station Unknown',
            currentState: 'Unknown', ahDelivered: 0, activeDays: new Set(), utilization: 'Idle',
            swapsPerDay: 0, kmPerDay: 0, swapsPerActiveDay: 0, kmPerSwap: 0
          };
        }

        const bStat = stats[battId];
        bStat.totalSwaps += 1;
        bStat.activeDays.add(dateStr);
        bStat.lastStationName = session.dealer_name;
        
        if (bStat.lastReturnTimestamp) {
          bStat.stationTimeMs += (timestamp - bStat.lastReturnTimestamp);
        }
        
        bStat.lastSwapTimestamp = timestamp;
        bStat.currentState = 'Driver';
      });

      // Process batteries returned to station (old_battries)
      session.old_battries.forEach((battId, index) => {
        if (!stats[battId]) {
          stats[battId] = {
            id: battId, model: 'Unknown', totalSwaps: 0, totalDistance: 0, totalSocConsumed: 0,
            driverActiveTimeMs: 0, stationTimeMs: 0, lastSwapTimestamp: null, lastReturnTimestamp: null,
            lastStationName: session.dealer_name,
            city: 'Station Unknown',
            currentState: 'Unknown', ahDelivered: 0, activeDays: new Set(), utilization: 'Idle',
            swapsPerDay: 0, kmPerDay: 0, swapsPerActiveDay: 0, kmPerSwap: 0
          };
        }

        const bStat = stats[battId];
        const distance = index === 0 ? session.odometer_range_1 : session.odometer_range_2;
        const socConsumed = index === 0 ? session.soc_range_1 : session.soc_range_2;

        bStat.totalDistance += distance || 0;
        bStat.totalSocConsumed += socConsumed || 0;
        bStat.lastStationName = session.dealer_name;
        
        const capacityAh = 100; 
        bStat.ahDelivered += ((socConsumed || 0) / 100) * capacityAh;

        if (bStat.lastSwapTimestamp) {
          bStat.driverActiveTimeMs += (timestamp - bStat.lastSwapTimestamp);
        }

        bStat.lastReturnTimestamp = timestamp;
        bStat.currentState = 'Station';
      });
    });

    // Finalize stats and classification
    Object.values(stats).forEach(bStat => {
      // Ensure city is 'Station Unknown' if not set
      if (!bStat.city) bStat.city = 'Station Unknown';

      bStat.swapsPerDay = bStat.totalSwaps / daysInPeriod;
      bStat.kmPerDay = bStat.totalDistance / daysInPeriod;
      bStat.swapsPerActiveDay = bStat.activeDays.size > 0 ? bStat.totalSwaps / bStat.activeDays.size : 0;
      bStat.kmPerSwap = bStat.totalSwaps > 0 ? bStat.totalDistance / bStat.totalSwaps : 0;

      if (bStat.totalSwaps === 0) bStat.utilization = 'Idle';
      else if (bStat.swapsPerDay < 0.5) bStat.utilization = 'Low';
      else if (bStat.swapsPerDay <= 1.5) bStat.utilization = 'Healthy';
      else bStat.utilization = 'High';
    });

    return Object.values(stats);
  }, [batteries, swapHistory, stations, cityGroups, selectedCity, dateRange, daysInPeriod]);

  const coreKPIs = useMemo(() => {
    const totalBatteries = utilisationData.length;
    const activeBatteries = utilisationData.filter(b => b.totalSwaps > 0).length;
    const idleBatteries = totalBatteries - activeBatteries;
    const totalSwaps = utilisationData.reduce((acc, b) => acc + b.totalSwaps, 0);
    const swapsPerDay = totalSwaps / daysInPeriod;
    const swapsPerBatteryPerDay = totalSwaps / (totalBatteries || 1) / daysInPeriod;
    const swapsPerActiveBatteryPerDay = totalSwaps / (activeBatteries || 1) / daysInPeriod;

    const split = {
      Idle: utilisationData.filter(b => b.utilization === 'Idle').length,
      Low: utilisationData.filter(b => b.utilization === 'Low').length,
      Healthy: utilisationData.filter(b => b.utilization === 'Healthy').length,
      High: utilisationData.filter(b => b.utilization === 'High').length,
    };

    return {
      totalBatteries,
      activeBatteries,
      idleBatteries,
      totalSwaps,
      swapsPerDay,
      swapsPerBatteryPerDay,
      swapsPerActiveBatteryPerDay,
      split
    };
  }, [utilisationData, daysInPeriod]);

  const chartData = useMemo(() => {
    // 1. Swaps Per Active Day Distribution
    const activeBins = {
      '0-0.5': 0,
      '0.5-0.7': 0,
      '0.7-1.0': 0,
      '1.0-1.3': 0,
      '1.3-1.6': 0,
      '1.6-2.0': 0,
      '2.0-2.5': 0,
      '2.5+': 0
    };

    utilisationData.forEach(b => {
      if (b.totalSwaps === 0) return;
      const val = b.swapsPerActiveDay;
      if (val < 0.5) activeBins['0-0.5']++;
      else if (val < 0.7) activeBins['0.5-0.7']++;
      else if (val < 1.0) activeBins['0.7-1.0']++;
      else if (val < 1.3) activeBins['1.0-1.3']++;
      else if (val < 1.6) activeBins['1.3-1.6']++;
      else if (val < 2.0) activeBins['1.6-2.0']++;
      else if (val < 2.5) activeBins['2.0-2.5']++;
      else activeBins['2.5+']++;
    });

    const activeDayDist = Object.entries(activeBins).map(([range, count]) => ({ range, count }));

    // 2. Swaps Per Day (Calendar) Distribution
    const dayBins = {
      '0-0.2': 0,
      '0.2-0.4': 0,
      '0.4-0.6': 0,
      '0.6-0.8': 0,
      '0.8-1.0': 0,
      '1.0-1.2': 0,
      '1.2-1.4': 0,
      '1.4+': 0
    };

    utilisationData.forEach(b => {
      if (b.totalSwaps === 0) return;
      const val = b.swapsPerDay;
      if (val < 0.2) dayBins['0-0.2']++;
      else if (val < 0.4) dayBins['0.2-0.4']++;
      else if (val < 0.6) dayBins['0.4-0.6']++;
      else if (val < 0.8) dayBins['0.6-0.8']++;
      else if (val < 1.0) dayBins['0.8-1.0']++;
      else if (val < 1.2) dayBins['1.0-1.2']++;
      else if (val < 1.4) dayBins['1.2-1.4']++;
      else dayBins['1.4+']++;
    });

    const dayDist = Object.entries(dayBins).map(([range, count]) => ({ range, count }));

    // 3. Daily Fleet Performance (Efficiency vs Volume)
    const dailyMap: Record<string, { count: number, activeBatteries: Set<string> }> = {};
    
    const filteredForCity = swapHistory.filter(s => {
      if (selectedCity === 'all') return true;
      const sid = s.payee_id || 'UNASSIGNED_POOL';
      const sessionCity = stationIdToCity.get(sid) || stationMap.get(sid)?.city || 'Station Unknown';
      return sessionCity === selectedCity;
    });

    filteredForCity.forEach(s => {
      const date = format(new Date(s.timestamp * 1000), 'MMM dd');
      if (!dailyMap[date]) dailyMap[date] = { count: 0, activeBatteries: new Set() };
      dailyMap[date].count += 1;
      s.new_battries.forEach(id => dailyMap[date].activeBatteries.add(id));
      s.old_battries.forEach(id => dailyMap[date].activeBatteries.add(id));
    });

    const trendData = Object.entries(dailyMap)
      .map(([date, data]) => ({ 
        date, 
        swaps: data.count, 
        utilization: data.activeBatteries.size > 0 ? (data.count / data.activeBatteries.size).toFixed(2) : 0 
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 4. Pie Chart Data
    const pieData = [
      { name: 'Idle', value: coreKPIs.split.Idle, color: '#ef4444' },
      { name: 'Low', value: coreKPIs.split.Low, color: '#f59e0b' },
      { name: 'Healthy', value: coreKPIs.split.Healthy, color: '#10b981' },
      { name: 'High', value: coreKPIs.split.High, color: '#8b5cf6' },
    ].filter(d => d.value > 0);

    // 5. Top 10 Batteries by KM
    const topDistance = [...utilisationData]
      .filter(b => b.totalDistance > 0)
      .sort((a, b) => b.totalDistance - a.totalDistance)
      .slice(0, 10)
      .map(b => ({ id: b.id, km: Math.round(b.totalDistance) }));

    return { activeDayDist, dayDist, trendData, pieData, topDistance };
  }, [utilisationData, coreKPIs.split, swapHistory, selectedCity, stationIdToCity, stationMap]);

  const [chartType, setChartType] = useState<'active' | 'calendar'>('active');

  const filteredData = useMemo(() => {
    return utilisationData.filter(b => 
      b.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.model.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => b.totalSwaps - a.totalSwaps);
  }, [utilisationData, searchQuery]);

  const handleExport = () => {
    const headers = [
      'Battery ID',
      'Last Station',
      'Total Swaps',
      'Total KM',
      'Active Days',
      'Swaps/Day',
      'KM/Day',
      'Swaps/Active Day',
      'KM/Swap',
      'Utilization'
    ];

    const csvRows = [
      headers.join(','),
      ...filteredData.map(b => [
        b.id,
        `"${b.lastStationName || 'Unknown'}"`,
        b.totalSwaps,
        b.totalDistance,
        b.activeDays.size,
        b.swapsPerDay.toFixed(3),
        b.kmPerDay.toFixed(3),
        b.swapsPerActiveDay.toFixed(3),
        b.kmPerSwap.toFixed(3),
        b.utilization
      ].join(','))
    ];

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `battery_utilisation_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-indigo-100 dark:border-indigo-900/30 rounded-full"></div>
          <div className="absolute top-0 left-0 w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="text-zinc-500 font-bold animate-pulse">Processing Swapping Sessions...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header & Filters */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <ChartBarIcon className="w-8 h-8 text-indigo-600" />
            Battery Utilisation
          </h1>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-1">
            <p className="text-zinc-500 dark:text-zinc-400 font-medium">
              Analyzing {coreKPIs.totalSwaps.toLocaleString()} swaps over {daysInPeriod} days
            </p>
            <span className="hidden sm:inline text-zinc-300 dark:text-zinc-700">•</span>
            <div className="flex items-center gap-1 text-[10px] bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full font-black text-indigo-600 uppercase tracking-widest">
              <CalendarIcon className="w-3 h-3" />
              {periodString}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search battery..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none w-48"
            />
          </div>

          <div className="flex items-center gap-2">
            <MapPinIcon className="w-4 h-4 text-zinc-400" />
            <CustomSelect
              options={cityOptions}
              value={selectedCity}
              onChange={(val) => setSelectedCity(val)}
              className="!py-2 !px-3 min-w-[160px]"
              searchable
            />
          </div>

          <button
            onClick={() => setIsGroupsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold transition-all shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <SquaresPlusIcon className="w-4 h-4" />
            Manage Groups
          </button>

          <button
            onClick={() => setShowManualModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-emerald-200 dark:shadow-none"
          >
            <CloudArrowUpIcon className="w-4 h-4" />
            Import Swap Data
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-indigo-200 dark:shadow-none"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">Battery Inventory</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase">Total</p>
              <p className="text-xl font-black text-zinc-900 dark:text-white">{coreKPIs.totalBatteries}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase">Active</p>
              <p className="text-xl font-black text-emerald-500">{coreKPIs.activeBatteries}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase">Idle</p>
              <p className="text-xl font-black text-red-500">{coreKPIs.idleBatteries}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">Core KPI (Per Day)</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase">Swaps/Day</p>
              <p className="text-xl font-black text-zinc-900 dark:text-white">{coreKPIs.swapsPerDay.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase">Utilization</p>
              <p className="text-xl font-black text-indigo-600">{coreKPIs.swapsPerBatteryPerDay.toFixed(3)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">Utilization Split</p>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(coreKPIs.split).map(([key, val]) => (
              <div key={key}>
                <p className="text-[9px] font-bold text-zinc-400 uppercase">{key}</p>
                <p className={`text-sm font-black ${
                  key === 'Healthy' ? 'text-emerald-500' : 
                  key === 'Idle' ? 'text-red-500' : 
                  key === 'Low' ? 'text-amber-500' : 'text-purple-500'
                }`}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Overall KPI:</span>
            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Swaps/Battery/Day: <span className="text-indigo-600">{coreKPIs.swapsPerBatteryPerDay.toFixed(3)}</span></span>
          </div>
          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800"></div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Swaps/Active/Day: <span className="text-indigo-600">{coreKPIs.swapsPerActiveBatteryPerDay.toFixed(3)}</span></span>
          </div>
        </div>
      </div>

      {/* Visual Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Main Distribution Line Chart */}
        <div className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm h-[450px] flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Fleet Distribution</h3>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Batteries vs Swap frequency</p>
            </div>
            <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
              <button 
                onClick={() => setChartType('active')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${chartType === 'active' ? 'bg-white dark:bg-zinc-700 text-indigo-600 shadow-sm' : 'text-zinc-500'}`}
              >
                Active Day
              </button>
              <button 
                onClick={() => setChartType('calendar')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${chartType === 'calendar' ? 'bg-white dark:bg-zinc-700 text-indigo-600 shadow-sm' : 'text-zinc-500'}`}
              >
                Calendar
              </button>
            </div>
          </div>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartType === 'active' ? chartData.activeDayDist : chartData.dayDist} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                <XAxis 
                  dataKey="range" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#71717a' }}
                  label={{ value: chartType === 'active' ? 'Swaps / Active Day' : 'Overall Swaps / Day', position: 'bottom', offset: 0, fontSize: 9, fontWeight: 900, fill: '#a1a1aa' }}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#71717a' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '1.5rem', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#6366f1" 
                  strokeWidth={4} 
                  dot={{ r: 6, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} 
                  activeDot={{ r: 8, strokeWidth: 0 }}
                  name="Batteries" 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily Throughput Trend */}
        <div className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm h-[450px] flex flex-col">
          <div className="mb-6">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">Daily Operational Velocity</h3>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Swap Volume & Fleet Efficiency</p>
          </div>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData.trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSwaps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#71717a' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#71717a' }} />
                <Tooltip contentStyle={{ borderRadius: '1.5rem', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} />
                <Area 
                  type="monotone" 
                  dataKey="swaps" 
                  stroke="#6366f1" 
                  strokeWidth={3} 
                  fillOpacity={1} 
                  fill="url(#colorSwaps)" 
                  name="Swap Count" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Efficiency Pie Chart */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm h-[400px] flex flex-col">
           <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-6">Fleet Health Split</h3>
           <div className="flex-1 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData.pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.pieData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }} />
              </PieChart>
            </ResponsiveContainer>
           </div>
        </div>

        {/* Top 10 High Mileage */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm h-[400px] flex flex-col">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-6">Top 10 High-Mileage Assets</h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.topDistance} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f1f1" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#71717a' }} />
                <YAxis 
                  dataKey="id" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fontWeight: 900, fill: '#18181b' }} 
                  width={80}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="km" fill="#10b981" radius={[0, 4, 4, 0]} name="Total KM" barSize={15} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                <th className="p-4 font-bold uppercase text-zinc-500">Battery details</th>
                <th className="p-4 font-bold uppercase text-zinc-500">Utilization</th>
                <th className="p-4 font-bold uppercase text-zinc-500 text-right">Total swaps</th>
                <th className="p-4 font-bold uppercase text-zinc-500 text-right">Total KM</th>
                <th className="p-4 font-bold uppercase text-zinc-500 text-right">Active days</th>
                <th className="p-4 font-bold uppercase text-zinc-500 text-right">Swaps/Day</th>
                <th className="p-4 font-bold uppercase text-zinc-500 text-right">Avg KM/Swap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {groupBy === 'none' ? (
                filteredData.map(b => (
                  <tr key={b.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-900 dark:text-white uppercase tracking-wider">{b.id}</span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[10px] text-zinc-500">{b.model}</span>
                          <span className="text-zinc-300 dark:text-zinc-700 mx-1">•</span>
                          <span className="text-[10px] text-zinc-400 italic">{b.lastStationName}</span>
                          <span className="text-zinc-300 dark:text-zinc-700 mx-1">•</span>
                          <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400">{b.city}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-lg font-black text-[9px] uppercase tracking-widest ${
                        b.utilization === 'Healthy' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20' :
                        b.utilization === 'High' ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/20' :
                        b.utilization === 'Low' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20' :
                        'bg-red-50 text-red-600 dark:bg-red-900/20'
                      }`}>
                        {b.utilization}
                      </span>
                    </td>
                    <td className="p-4 text-right font-bold text-zinc-700 dark:text-zinc-300">{b.totalSwaps}</td>
                    <td className="p-4 text-right font-bold text-zinc-700 dark:text-zinc-300">{Math.round(b.totalDistance)}</td>
                    <td className="p-4 text-right font-bold text-zinc-700 dark:text-zinc-300">{b.activeDays.size}</td>
                    <td className="p-4 text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-zinc-700 dark:text-zinc-300">{b.swapsPerDay.toFixed(2)}</span>
                        <span className="text-[9px] text-zinc-400">Act: {b.swapsPerActiveDay.toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right font-bold text-zinc-700 dark:text-zinc-300">{b.kmPerSwap.toFixed(1)}</td>
                  </tr>
                ))
              ) : (
                Array.from(new Set(filteredData.map(b => b.city))).sort().map(city => {
                  const cityData = filteredData.filter(b => b.city === city);
                  const citySwaps = cityData.reduce((acc, b) => acc + b.totalSwaps, 0);
                  const cityDistance = cityData.reduce((acc, b) => acc + b.totalDistance, 0);

                  return (
                    <React.Fragment key={city}>
                      <tr className="bg-zinc-100/50 dark:bg-zinc-800/50">
                        <td colSpan={2} className="p-4 py-3">
                          <div className="flex items-center gap-2">
                            <MapPinIcon className="w-4 h-4 text-indigo-600" />
                            <span className="font-black text-zinc-900 dark:text-white uppercase tracking-widest">{city}</span>
                            <span className="text-[10px] font-bold text-zinc-400 bg-white dark:bg-zinc-900 px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700">{cityData.length} Assets</span>
                          </div>
                        </td>
                        <td className="p-4 text-right font-black text-indigo-600">{citySwaps}</td>
                        <td className="p-4 text-right font-black text-emerald-600">{Math.round(cityDistance)}</td>
                        <td colSpan={3} className=""></td>
                      </tr>
                      {cityData.map(b => (
                        <tr key={b.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                          <td className="p-4 pl-8">
                            <div className="flex flex-col">
                              <span className="font-bold text-zinc-900 dark:text-white uppercase tracking-wider">{b.id}</span>
                              <span className="text-[10px] text-zinc-500 mt-0.5">{b.model}</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded-lg font-black text-[9px] uppercase tracking-widest ${
                              b.utilization === 'Healthy' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20' :
                              b.utilization === 'High' ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/20' :
                              b.utilization === 'Low' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20' :
                              'bg-red-50 text-red-600 dark:bg-red-900/20'
                            }`}>
                              {b.utilization}
                            </span>
                          </td>
                          <td className="p-4 text-right font-bold text-zinc-700 dark:text-zinc-300">{b.totalSwaps}</td>
                          <td className="p-4 text-right font-bold text-zinc-700 dark:text-zinc-300">{Math.round(b.totalDistance)}</td>
                          <td className="p-4 text-right font-bold text-zinc-700 dark:text-zinc-300">{b.activeDays.size}</td>
                          <td className="p-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="font-bold text-zinc-700 dark:text-zinc-300">{b.swapsPerDay.toFixed(2)}</span>
                              <span className="text-[9px] text-zinc-400">Act: {b.swapsPerActiveDay.toFixed(1)}</span>
                            </div>
                          </td>
                          <td className="p-4 text-right font-bold text-zinc-700 dark:text-zinc-300">{b.kmPerSwap.toFixed(1)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {showManualModal && (
          <div className="fixed -top-10 left-0 w-full h-[calc(100vh+40px)] z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-[95vw] h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800">
              <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                <div>
                  <h3 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                    <CloudArrowUpIcon className="w-7 h-7 text-indigo-600" />
                    Import Swap Data
                  </h3>
                  <p className="text-zinc-500 text-sm font-medium mt-1">Paste your excel data into the grid below (Supports Tab-Separated values)</p>
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
                      <p className="text-zinc-500">Supports direct Excel copy-paste (Tab Delimited)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100 dark:shadow-none cursor-pointer active:scale-95">
                      <CloudArrowUpIcon className="w-4 h-4" />
                      <span>Import Excel</span>
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
                      disabled={isProcessingManual}
                      className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 dark:shadow-none flex items-center gap-2"
                    >
                      {isProcessingManual ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <TableCellsIcon className="w-4 h-4" />}
                      Process Data
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
              
              <div className="p-6 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 text-center">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest italic">
                  Note: Ensure the columns in your excel sheet exactly match the header order in the grid above.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">Battery ID</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">Last Station</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">Total Swaps</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">Total KM</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">Active Days</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">Swaps/Day</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">KM/Day</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">Swaps/Active Day</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">KM/Swap</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">Utilization</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filteredData.map((b) => (
                <tr key={b.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                        <Battery50Icon className="w-4 h-4 text-zinc-500" />
                      </div>
                      <span className="text-xs font-bold text-zinc-900 dark:text-white">{b.id}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <MapPinIcon className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{b.lastStationName || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-zinc-600 dark:text-zinc-400">{b.totalSwaps}</td>
                  <td className="px-6 py-4 text-xs font-bold text-zinc-600 dark:text-zinc-400">{b.totalDistance.toLocaleString()}</td>
                  <td className="px-6 py-4 text-xs font-bold text-zinc-600 dark:text-zinc-400">{b.activeDays.size}</td>
                  <td className="px-6 py-4 text-xs font-bold text-zinc-600 dark:text-zinc-400">{b.swapsPerDay.toFixed(3)}</td>
                  <td className="px-6 py-4 text-xs font-bold text-zinc-600 dark:text-zinc-400">{b.kmPerDay.toFixed(3)}</td>
                  <td className="px-6 py-4 text-xs font-bold text-indigo-600 dark:text-indigo-400">{b.swapsPerActiveDay.toFixed(3)}</td>
                  <td className="px-6 py-4 text-xs font-bold text-zinc-600 dark:text-zinc-400">{b.kmPerSwap.toFixed(3)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      b.utilization === 'Healthy' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20' :
                      b.utilization === 'Idle' ? 'bg-red-50 text-red-600 dark:bg-red-900/20' :
                      b.utilization === 'Low' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20' :
                      'bg-purple-50 text-purple-600 dark:bg-purple-900/20'
                    }`}>
                      {b.utilization}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isGroupsModalOpen && (
          <StationGroupsModal 
            onClose={() => {
              setIsGroupsModalOpen(false);
              // Refresh groups
              const fetchGroups = async () => {
                const groupsQuery = query(collection(db, 'station_groups'), where('type', '==', 'city'));
                const groupsSnap = await getDocs(groupsQuery);
                const groups = groupsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StationGroup));
                setCityGroups(groups);
              };
              fetchGroups();
            }} 
            stations={[
              ...stations,
              { dealer_id: 'UNASSIGNED_POOL', name: 'Unassigned Assets', city: 'Unknown', id: '' } as Station
            ]}
            existingGroups={cityGroups}
          />
        )}
      </div>
    </div>
  );
};

interface StationGroupsModalProps {
  onClose: () => void;
  stations: Station[];
  existingGroups: StationGroup[];
}

const StationGroupsModal: React.FC<StationGroupsModalProps> = ({ onClose, stations, existingGroups }) => {
  const [groups, setGroups] = useState<StationGroup[]>(existingGroups);
  const [newGroupName, setNewGroupName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [searchStation, setSearchStation] = useState('');

  const handleAddGroup = () => {
    if (!newGroupName.trim()) return;
    const newGroup: StationGroup = {
      id: `city_${Date.now()}`,
      name: newGroupName.trim(),
      stationIds: [],
      stationNames: [],
      createdAt: new Date().toISOString(),
      type: 'city'
    };
    setGroups([...groups, newGroup]);
    setNewGroupName('');
  };

  const handleRemoveGroup = async (groupId: string) => {
    if (!window.confirm('Are you sure you want to delete this group?')) return;
    setGroups(groups.filter(g => g.id !== groupId));
    try {
      await deleteDoc(doc(db, 'station_groups', groupId));
    } catch (e) {
      console.error("Failed to delete group from Firestore", e);
    }
  };

  const toggleStationInGroup = (groupId: string, stationId: string, stationName: string) => {
    setGroups(prev => {
      // Find if station is currently in the target group
      const targetGroup = prev.find(g => g.id === groupId);
      const wasInTarget = targetGroup?.stationIds?.includes(stationId);

      // Cleaned groups: remove the station from ALL groups to ensure it only belongs to one city
      const cleanedGroups = prev.map(g => {
        const ids = g.stationIds || [];
        const names = g.stationNames || [];
        const index = ids.indexOf(stationId);
        
        if (index > -1) {
          const newIds = [...ids];
          const newNames = [...names];
          newIds.splice(index, 1);
          newNames.splice(index, 1);
          return { ...g, stationIds: newIds, stationNames: newNames };
        }
        return g;
      });

      if (wasInTarget) {
        // If it was in the target group, we just removed it (toggle off)
        return cleanedGroups;
      } else {
        // If it wasn't in target, add it now (it's already removed from others)
        return cleanedGroups.map(g => {
          if (g.id === groupId) {
            return {
              ...g,
              stationIds: [...(g.stationIds || []), stationId],
              stationNames: [...(g.stationNames || []), stationName]
            };
          }
          return g;
        });
      }
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // First, get all current group IDs in Firestore to handle deletions if any
      // Actually, my handleRemoveGroup does deleteDoc, so I just need to update current ones
      for (const group of groups) {
        await setDoc(doc(db, 'station_groups', group.id), {
          ...group,
          stationIds: group.stationIds || [],
          stationNames: group.stationNames || [],
          type: 'city',
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
      onClose();
    } catch (e) {
      console.error("Failed to save groups", e);
      alert("Failed to save groups. Check console for details.");
    } finally {
      setIsSaving(false);
    }
  };

  const availableStations = useMemo(() => {
    return (stations || []).filter(s => 
      s.name.toLowerCase().includes(searchStation.toLowerCase()) ||
      s.dealer_id.toLowerCase().includes(searchStation.toLowerCase())
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [stations, searchStation]);

  return (
    <div className="fixed -top-10 left-0 w-full h-[calc(100vh+40px)] z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300 text-zinc-900 dark:text-white">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-5xl h-[85vh] rounded-[2.5rem] shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-800/50">
          <div>
            <h2 className="text-xl font-bold">Manage City Groups</h2>
            <p className="text-xs text-zinc-500">Group stations under specific cities for better reporting.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors">
            <XMarkIcon className="w-6 h-6 text-zinc-500" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel: Groups List */}
          <div className="w-1/3 border-r border-zinc-100 dark:border-zinc-800 flex flex-col p-6 bg-zinc-50/30 dark:bg-zinc-900/30 overflow-y-auto">
            <div className="mb-6">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 block">Create New City</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="City Name..." 
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
                  className="flex-1 px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button 
                  onClick={handleAddGroup}
                  className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  <PlusIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 block">Existing Cities</label>
              {groups.length === 0 ? (
                <div className="text-center py-10 opacity-40">
                  <MapPinIcon className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-xs font-bold">No city groups defined</p>
                </div>
              ) : (
                groups.map(group => (
                  <div 
                    key={group.id}
                    className="p-4 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-sm relative group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold uppercase tracking-wider">{group.name}</span>
                      <button 
                        onClick={() => handleRemoveGroup(group.id)}
                        className="p-1.5 text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[9px] font-black bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800">
                        {group.stationIds?.length || 0} STATIONS
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Panel: Station Assignment */}
          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder="Search Station to assign..." 
                  value={searchStation}
                  onChange={(e) => setSearchStation(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest whitespace-nowrap">
                {availableStations.length} Total Stations
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {availableStations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 opacity-30 text-center">
                  <MagnifyingGlassIcon className="w-12 h-12 mb-4" />
                  <p className="text-sm font-bold uppercase tracking-widest">No stations found</p>
                  <p className="text-xs">Try searching for a different name or ID</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-6">
                  {availableStations.map(station => {
                    const currentGroupName = groups.find(g => (g.stationIds || []).includes(station.dealer_id))?.name;
                    return (
                      <div 
                        key={station.dealer_id}
                        className={`p-4 rounded-2xl border transition-all ${
                          currentGroupName 
                            ? 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-800' 
                            : 'bg-white dark:bg-zinc-800 border-zinc-100 dark:border-zinc-700 hover:border-zinc-300'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold">{station.name}</span>
                            <span className="text-[10px] text-zinc-400 uppercase font-mono">{station.dealer_id}</span>
                          </div>
                          {currentGroupName && (
                            <span className="text-[9px] font-black text-indigo-600 bg-white dark:bg-zinc-900 px-2 py-0.5 rounded-lg border border-indigo-100 dark:border-indigo-800 uppercase tracking-widest">
                              {currentGroupName}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap gap-2 mt-4">
                          {groups.length === 0 ? (
                            <span className="text-[9px] text-zinc-400 italic">Create a city group first</span>
                          ) : (
                            groups.map(group => {
                              const isActive = (group.stationIds || []).includes(station.dealer_id);
                              return (
                                <button
                                  key={group.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleStationInGroup(group.id, station.dealer_id, station.name);
                                  }}
                                  className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all shadow-sm ${
                                    isActive 
                                      ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                                      : 'bg-white dark:bg-zinc-700 text-zinc-500 border border-zinc-100 dark:border-zinc-600 hover:border-indigo-300 dark:hover:border-indigo-500'
                                  }`}
                                >
                                  {group.name}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50/80 dark:bg-zinc-800/80 backdrop-blur-sm">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all text-sm"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50 text-sm flex items-center gap-2"
          >
            {isSaving && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
            {isSaving ? 'Saving Changes...' : 'Save All Groups'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatteryUtilisationPage;
