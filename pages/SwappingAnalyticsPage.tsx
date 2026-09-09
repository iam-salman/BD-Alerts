
import React, { useState, useEffect, useMemo } from 'react';
import { 
  CalendarIcon, 
  ArrowPathIcon, 
  CloudArrowUpIcon, 
  TableCellsIcon, 
  XMarkIcon,
  ChartBarIcon,
  PresentationChartLineIcon,
  FunnelIcon,
  ClockIcon,
  PlusIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { SwappingSession } from '@/types';
import { format, startOfDay, eachDayOfInterval } from 'date-fns';
import CustomSelect from '@/components/CustomSelect';
import * as XLSX from 'xlsx';

const MANUAL_IMPORT_HEADERS = [
  "Swap ID", "Date/time", "Station ID", "Station Name", "Driver ID", "Driver Name", "Phone", "Mode Of Payment", "Vehicle Number", 
  "Battery IN 1", "SOC Start 1", "Battery IN 2", "SOC Start 2", "Battery OUT 1", "SOC End 1", "Battery OUT 2", "SOC End 2", 
  "SOC Consumed 1", "SOC Consumed 2", "Swap Start", "Swap End", "Duration", "Penalty Amount", "Penalty Paid Am", 
  "Pending Penalty", "Swap Amount", "Total Amount", "Odometer Range 1", "Odometer Range 2"
];

type ChartMetric = 
  | 'swaps' 
  | 'revenue' 
  | 'penalty' 
  | 'returned' 
  | 'assigned' 
  | 'soc_consumed' 
  | 'duration' 
  | 'price_points' 
  | 'stations' 
  | 'payment_modes' 
  | 'swap_types'
  | 'drivers'
  | 'swap_details'
  | 'revenue_penalty'
  | 'performance_metrics';

type ChartType = 'line' | 'bar' | 'area' | 'pie';

interface ChartConfig {
  id: string;
  title: string;
  metric: ChartMetric;
  type: ChartType;
  span?: 'single' | 'full';
  showTrend?: boolean;
}

const METRIC_OPTIONS: { value: ChartMetric; label: string; allowedTypes: ChartType[] }[] = [
  { value: 'swaps', label: 'Total Swaps', allowedTypes: ['line', 'bar', 'area'] },
  { value: 'revenue', label: 'Swap Amount (Revenue)', allowedTypes: ['line', 'bar', 'area'] },
  { value: 'penalty', label: 'Penalty Paid', allowedTypes: ['line', 'bar', 'area'] },
  { value: 'returned', label: 'Batteries Returned', allowedTypes: ['line', 'bar', 'area'] },
  { value: 'assigned', label: 'Batteries Assigned', allowedTypes: ['line', 'bar', 'area'] },
  { value: 'soc_consumed', label: 'Avg SOC Consumed', allowedTypes: ['line', 'bar'] },
  { value: 'duration', label: 'Avg Swap Duration', allowedTypes: ['line', 'bar'] },
  { value: 'price_points', label: 'Price Point Distribution', allowedTypes: ['bar'] },
  { value: 'stations', label: 'Station Performance', allowedTypes: ['bar'] },
  { value: 'payment_modes', label: 'Payment Mode Distribution', allowedTypes: ['pie'] },
  { value: 'swap_types', label: 'Swap Type Distribution', allowedTypes: ['pie'] },
  { value: 'drivers', label: 'Top 10 Drivers', allowedTypes: ['bar'] },
  { value: 'swap_details', label: 'Swap vs Return vs Assigned', allowedTypes: ['line', 'bar', 'area'] },
  { value: 'revenue_penalty', label: 'Revenue vs Penalty Paid', allowedTypes: ['line', 'bar'] },
  { value: 'performance_metrics', label: 'SOC Consumed vs Duration', allowedTypes: ['line', 'bar'] },
];

const DEFAULT_CHARTS: ChartConfig[] = [
  { id: '1', title: 'Total Swaps vs Days', metric: 'swaps', type: 'line' },
  { id: '2', title: 'Swap Amount vs Days (₹)', metric: 'revenue', type: 'bar' },
  { id: '3', title: 'Price Point Distribution', metric: 'price_points', type: 'bar' },
  { id: '4', title: 'Paid Penalty vs Days (₹)', metric: 'penalty', type: 'line' },
  { id: '5', title: 'Battery Movement', metric: 'returned', type: 'bar' },
  { id: '6', title: 'Station Performance (Top 10)', metric: 'stations', type: 'bar', span: 'full' },
  { id: '7', title: 'Payment Distribution', metric: 'payment_modes', type: 'pie' },
  { id: '8', title: 'Swap Type Distribution', metric: 'swap_types', type: 'pie' },
  { id: '9', title: 'Top 10 Drivers by Swap Count', metric: 'drivers', type: 'bar', span: 'full' },
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
                      type="text"
                      value={row[cIdx] || ''}
                      onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)}
                      onPaste={(e) => onPasteEvent(e, rIdx, cIdx)}
                      className="w-full px-2 py-2 bg-transparent outline-none focus:bg-indigo-50/50 dark:focus:bg-indigo-900/10 text-zinc-900 dark:text-zinc-100 font-medium"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > 100 && (
        <div className="flex justify-between items-center px-4 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
            Showing first 100 of {data.length} rows. Total data will be processed.
          </p>
        </div>
      )}
    </div>
  );
};

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const SwappingAnalyticsPage: React.FC = () => {
  const [sessions, setSessions] = useState<SwappingSession[]>([]);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showAddChartModal, setShowAddChartModal] = useState(false);
  
  const [charts, setCharts] = useState<ChartConfig[]>(() => {
    try {
      const saved = localStorage.getItem('analytics_charts_config');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_CHARTS;
  });

  const [hiddenSeries, setHiddenSeries] = useState<Record<string, string[]>>({});

  const toggleSeries = (chartId: string, seriesId: string) => {
    setHiddenSeries(prev => {
      const current = prev[chartId] || [];
      if (current.includes(seriesId)) {
        return { ...prev, [chartId]: current.filter(id => id !== seriesId) };
      }
      return { ...prev, [chartId]: [...current, seriesId] };
    });
  };

  const [newChart, setNewChart] = useState<Partial<ChartConfig>>({
    metric: 'swaps',
    type: 'line',
    span: 'single',
    showTrend: false
  });

  const [manualGridData, setManualGridData] = useState<string[][]>(() => {
    try {
      const saved = localStorage.getItem('analytics_manual_grid_data');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return Array.from({ length: 15 }, () => Array(29).fill(""));
  });
  const [isProcessingManual, setIsProcessingManual] = useState(false);

  // Filter State
  const [dateRange, setDateRange] = useState('all');
  const [stationFilter, setStationFilter] = useState('all');

  useEffect(() => {
    try {
      localStorage.setItem('analytics_charts_config', JSON.stringify(charts));
    } catch (e) {}
  }, [charts]);

  useEffect(() => {
    try {
      localStorage.setItem('analytics_manual_grid_data', JSON.stringify(manualGridData));
    } catch (e) {}
  }, [manualGridData]);

  const handleAddChart = () => {
    if (!newChart.metric) return;
    const metricDef = METRIC_OPTIONS.find(m => m.value === newChart.metric);
    const addedChart: ChartConfig = {
      id: Date.now().toString(),
      title: newChart.title || metricDef?.label || 'New Chart',
      metric: newChart.metric as ChartMetric,
      type: newChart.type as ChartType,
      span: newChart.span as any || 'single',
      showTrend: newChart.showTrend
    };
    setCharts([...charts, addedChart]);
    setShowAddChartModal(false);
    setNewChart({ metric: 'swaps', type: 'line', span: 'single', showTrend: false });
  };

  const removeChart = (id: string) => {
    setCharts(charts.filter(c => c.id !== id));
  };

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
        
        // Convert to array of arrays, starting from row 0 (headers are expected at row 0)
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        
        if (jsonData.length === 0) {
          alert("Excel file is empty.");
          return;
        }

        // Skip headers if they match our expectation or just take everything after header
        // For simplicity, we just take all rows and the user can check them in the grid
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
        alert("Failed to parse Excel file. Please ensure it's a valid .xlsx or .xls file.");
      }
    };
    reader.readAsBinaryString(file);
    // Clear input
    e.target.value = '';
  };

  const processManualData = () => {
    setIsProcessingManual(true);
    try {
      const newSessions: SwappingSession[] = [];
      
      const parseDate = (str: string) => {
        if (!str) return 0;
        const valStr = String(str).trim();
        if (!valStr) return 0;
        try {
          let d: Date | null = null;
          
          // First try to parse DD/MM/YYYY or DD-MM-YYYY format explicitly
          const dmyRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?)?/i;
          const match = valStr.match(dmyRegex);
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
            d = new Date(valStr);
          }
          
          return isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000);
        } catch(e) {
          console.error("Date parse error for:", str, e);
          return 0;
        }
      };

      const parseSOC = (val: any) => {
        const str = String(val || '').trim();
        if (!str) return 0;
        return parseInt(str.replace('%', '')) || 0;
      };

      manualGridData.forEach((row, idx) => {
        const col0 = String(row[0] || '').trim();
        if (!col0 || col0 === 'Swap ID') return;
        
        const session: SwappingSession = {
          _id: row[0],
          txn_id: row[0],
          timestamp: parseDate(row[1]),
          payee_id: row[2],
          dealer_name: row[3],
          payer_id: row[4],
          driverData: {
            _id: row[4],
            driver_id: row[4],
            name: row[5],
            phone: row[6]
          },
          mode: row[7].toLowerCase(),
          vehicle_number: row[8],
          old_battries: [row[9], row[11]].filter(Boolean),
          new_battries: [row[13], row[15]].filter(Boolean),
          soc_details: {
            old_soc: [parseSOC(row[10]), parseSOC(row[12])],
            new_soc: [parseSOC(row[14]), parseSOC(row[16])]
          },
          soc_range_1: parseSOC(row[17]),
          soc_range_2: parseSOC(row[18]),
          start_time: parseDate(row[19]),
          end_time: parseDate(row[20]),
          duration: parseFloat(row[21]) || 0,
          penalty_amount: parseFloat(row[22]) || 0,
          penalty_paid_amount: parseFloat(row[23]) || 0,
          total_penalty_paid: parseFloat(row[23]) || 0,
          amount: parseFloat(row[25]) || 0,
          odometer_range_1: parseFloat(row[27]) || 0,
          odometer_range_2: parseFloat(row[28]) || 0,
          type: 1,
          penalty_payment_count: 1,
          dealer_share: 0,
          odometer_details: {
            old_odometer: [],
            new_odometer: []
          }
        };
        newSessions.push(session);
      });

      if (newSessions.length > 0) {
        setSessions(newSessions);
        setDateRange('all');
        setShowManualModal(false);
      } else {
        alert("No valid rows found to import.");
      }
    } catch (err) {
      console.error("Manual processing error:", err);
      alert("Failed to process manual data. Check data format.");
    } finally {
      setIsProcessingManual(false);
    }
  };

  const uniqueStations = useMemo(() => {
    const stations = sessions?.map(s => s.dealer_name) || [];
    return ['all', ...Array.from(new Set(stations)).sort()];
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    let result = sessions;
    if (stationFilter !== 'all') {
      result = result.filter(s => s.dealer_name === stationFilter);
    }
    // Date range filtering would go here if we had more than 'all'
    // But since it's analytics of whatever is imported, we'll keep it simple for now
    return result;
  }, [sessions, stationFilter]);

  const uniqueAmounts = useMemo(() => {
    return Array.from(new Set(sessions.map(s => s.amount))).sort((a, b) => b - a); // Higher amounts first for stacking
  }, [sessions]);

  const dailyData = useMemo(() => {
    if (filteredSessions.length === 0) return [];

    const timestamps = filteredSessions?.map(s => s.timestamp) || [];
    const minDay = startOfDay(new Date(Math.min(...timestamps) * 1000));
    const maxDay = startOfDay(new Date(Math.max(...timestamps) * 1000));

    const interval = eachDayOfInterval({ start: minDay, end: maxDay });
    
    const baseData = interval?.map(day => {
      const dayStart = day.getTime() / 1000;
      const dayEnd = dayStart + 86399;
      const daySessions = filteredSessions.filter(s => s.timestamp >= dayStart && s.timestamp <= dayEnd);

      const pricePointData: Record<string, number> = {};
      uniqueAmounts.forEach(amt => {
        pricePointData[`pp_${amt}`] = daySessions.filter(s => s.amount === amt).length;
      });

      const data = {
        date: format(day, 'MMM dd'),
        fullDate: day,
        swaps: daySessions.length,
        swapCount: daySessions.filter(s => (s.old_battries?.length || 0) > 0 && (s.new_battries?.length || 0) > 0).length,
        assignedCount: daySessions.filter(s => (s.old_battries?.length || 0) === 0 && (s.new_battries?.length || 0) > 0).length,
        returnCount: daySessions.filter(s => (s.old_battries?.length || 0) > 0 && (s.new_battries?.length || 0) === 0).length,
        ...pricePointData,
        penaltyPaid: daySessions.reduce((acc, s) => acc + (s.penalty_paid_amount || 0), 0),
        returnedBatteries: daySessions.reduce((acc, s) => acc + (s.old_battries?.length || 0), 0),
        assignedBatteries: daySessions.reduce((acc, s) => acc + (s.new_battries?.length || 0), 0),
        revenue: daySessions.reduce((acc, s) => acc + s.amount, 0),
        totalAmount: daySessions.reduce((acc, s) => acc + s.amount + (s.total_penalty_paid || 0), 0),
        socConsumed: daySessions.length > 0 
          ? Math.round(daySessions.reduce((acc, s) => acc + (s.soc_range_1 + s.soc_range_2) / (s.old_battries?.length || 1), 0) / daySessions.length)
          : 0,
        duration: daySessions.length > 0
          ? Math.round((daySessions.reduce((acc, s) => acc + s.duration, 0) / daySessions.length) * 10) / 10
          : 0
      };
      
      return data;
    });

    // Add moving average for trends (7-day window)
    return baseData?.map((d, i, arr) => {
      const windowSize = 7;
      const start = Math.max(0, i - Math.floor(windowSize / 2));
      const end = Math.min(arr.length, i + Math.floor(windowSize / 2) + 1);
      const window = arr.slice(start, end);
      
      const res: any = { ...d };
      Object.keys(d).forEach(key => {
        const val = (d as any)[key];
        if (typeof val === 'number' && key !== 'fullDate') {
           const sum = window.reduce((acc, curr) => acc + ((curr as any)[key] || 0), 0);
           res[`${key}Trend`] = Math.round((sum / window.length) * 10) / 10;
        }
      });
      return res;
    });
  }, [filteredSessions]);

  const stationData = useMemo(() => {
    if (filteredSessions.length === 0) return [];
    
    const stations = Array.from(new Set(filteredSessions?.map(s => s.dealer_name) || []));
    return stations?.map(name => {
      const sSessions = filteredSessions.filter(s => s.dealer_name === name);
      return {
        name,
        swaps: sSessions.length,
        revenue: sSessions.reduce((acc, s) => acc + s.amount, 0),
        penalty: sSessions.reduce((acc, s) => acc + (s.penalty_paid_amount || 0), 0),
        total: sSessions.reduce((acc, s) => acc + s.amount + (s.total_penalty_paid || 0), 0)
      };
    }).sort((a, b) => b.total - a.total);
  }, [filteredSessions]);

  const paymentModeData = useMemo(() => {
    const modes = Array.from(new Set(filteredSessions?.map(s => s.mode) || []));
    return modes?.map(mode => ({
      name: mode.toUpperCase(),
      value: filteredSessions.filter(s => s.mode === mode).length
    }));
  }, [filteredSessions]);

  const swapTypeData = useMemo(() => {
    const types = [
      { name: 'Full Swap', count: filteredSessions.filter(s => (s.old_battries?.length || 0) > 0 && (s.new_battries?.length || 0) > 0).length },
      { name: 'Return Only', count: filteredSessions.filter(s => (s.old_battries?.length || 0) > 0 && (s.new_battries?.length || 0) === 0).length },
      { name: 'Assign Only', count: filteredSessions.filter(s => (s.old_battries?.length || 0) === 0 && (s.new_battries?.length || 0) > 0).length },
    ];
    return types.filter(t => t.count > 0);
  }, [filteredSessions]);

  const driverData = useMemo(() => {
    const driversMap: Record<string, { name: string, swaps: number, revenue: number }> = {};
    filteredSessions.forEach(s => {
      const id = s.driverData?._id || 'unknown';
      if (!driversMap[id]) {
        driversMap[id] = { name: s.driverData?.name || 'Unknown', swaps: 0, revenue: 0 };
      }
      driversMap[id].swaps += 1;
      driversMap[id].revenue += s.amount;
    });
    return Object.values(driversMap).sort((a, b) => b.swaps - a.swaps).slice(0, 10);
  }, [filteredSessions]);

  const renderChartContent = (chart: ChartConfig) => {
    const isStation = chart.metric === 'stations';
    const isPie = chart.type === 'pie';
    const chartHidden = hiddenSeries[chart.id] || [];

    if (isPie) {
      const data = chart.metric === 'payment_modes' ? paymentModeData : swapTypeData;
      const dataKey = chart.metric === 'payment_modes' ? 'value' : 'count';
      return (
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey={dataKey}
            label
          >
            {data?.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      );
    }

    if (isStation) {
      return (
        <BarChart layout="vertical" data={stationData.slice(0, 10)}>
          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0" />
          <XAxis type="number" axisLine={false} tickLine={false} hide />
          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={150} tick={{ fontSize: 10, fontWeight: 700 }} />
          <Tooltip />
          <Legend onClick={(e) => toggleSeries(chart.id, String(e.dataKey))} />
          {!chartHidden.includes('revenue') && <Bar dataKey="revenue" name="Swap Amount" fill="#6366f1" stackId="a" />}
          {!chartHidden.includes('penalty') && <Bar dataKey="penalty" name="Penalty Paid" fill="#ef4444" stackId="a" />}
        </BarChart>
      );
    }

    if ((chart.metric as string) === 'revenue_penalty') {
      const e = [
        { key: 'revenue', name: 'Revenue', color: '#10b981' },
        { key: 'penaltyPaid', name: 'Penalty', color: '#ef4444' }
      ];
      const ChartC: any = chart.type === 'line' ? LineChart : BarChart;
      return (
        <ChartC data={dailyData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend onClick={(e) => toggleSeries(chart.id, String(e.dataKey))} />
          {e.map(i => !chartHidden.includes(i.key) && (
            chart.type === 'line' 
              ? <Line key={i.key} type="monotone" dataKey={i.key as string} stroke={i.color} name={i.name} strokeWidth={3} />
              : <Bar key={i.key} dataKey={i.key as string} fill={i.color} name={i.name} radius={[4, 4, 0, 0]} />
          ))}
        </ChartC>
      );
    }

    if ((chart.metric as string) === 'performance_metrics') {
      const e = [
        { key: 'socConsumed', name: 'Avg SOC', color: '#f59e0b' },
        { key: 'duration', name: 'Avg Duration', color: '#6366f1' }
      ];
      const ChartC: any = chart.type === 'line' ? LineChart : BarChart;
      return (
        <ChartC data={dailyData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend onClick={(e) => toggleSeries(chart.id, String(e.dataKey))} />
          {e.map(i => !chartHidden.includes(i.key) && (
            chart.type === 'line' 
              ? <Line key={i.key} type="monotone" dataKey={i.key as string} stroke={i.color} name={i.name} strokeWidth={3} />
              : <Bar key={i.key} dataKey={i.key as string} fill={i.color} name={i.name} radius={[4, 4, 0, 0]} />
          ))}
        </ChartC>
      );
    }

    if (chart.metric === 'drivers') {
      return (
        <BarChart data={driverData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600 }} />
          <Tooltip />
          <Bar dataKey="swaps" name="Total Swaps" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
        </BarChart>
      );
    }

    const metricKey = chart.metric as string;
    const color = COLORS[METRIC_OPTIONS.findIndex(m => m.value === chart.metric) % COLORS.length];

    if (chart.metric === 'swap_details') {
      const entries = [
        { key: 'swaps', name: 'Total Volume', color: '#6366f1' },
        { key: 'swapCount', name: 'Full Swap', color: '#10b981' },
        { key: 'assignedCount', name: 'Assigned Only', color: '#f59e0b' },
        { key: 'returnCount', name: 'Return Only', color: '#ef4444' }
      ];

      const renderSeries = (entry: typeof entries[0]) => {
        if (chartHidden.includes(entry.key)) return null;
        if (chart.type === 'line') return <Line type="monotone" dataKey={entry.key as string} stroke={entry.color} name={entry.name} strokeWidth={3} dot={{ r: 3 }} />;
        if (chart.type === 'area') return <Area type="monotone" dataKey={entry.key as string} stroke={entry.color} fill={entry.color} fillOpacity={0.1} name={entry.name} />;
        return <Bar dataKey={entry.key as string} fill={entry.color} name={entry.name} radius={[4, 4, 0, 0]} />;
      };

      const ChartComp: any = chart.type === 'line' ? LineChart : chart.type === 'area' ? AreaChart : BarChart;

      return (
        <ChartComp data={dailyData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Legend onClick={(e) => toggleSeries(chart.id, String(e.dataKey))} />
          {entries.map(renderSeries)}
          {chart.showTrend && (
            <Line type="monotone" dataKey="swapsTrend" stroke="#141414" strokeDasharray="5 5" name="Volume Trend (7d Avg)" dot={false} strokeWidth={2} opacity={0.5} />
          )}
        </ChartComp>
      );
    }

    if (chart.metric === 'price_points') {
      const pEntries = uniqueAmounts.map((amt, idx) => ({
        key: `pp_${amt}`,
        name: `₹${amt}`,
        color: COLORS[idx % COLORS.length]
      }));
      return (
        <BarChart data={dailyData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend onClick={(e) => toggleSeries(chart.id, String(e.dataKey))} />
          {pEntries.map(e => !chartHidden.includes(e.key) && (
            <Bar key={e.key} dataKey={e.key} name={e.name} fill={e.color} stackId="a" />
          ))}
        </BarChart>
      );
    }

    if (chart.type === 'line') {
      return (
        <LineChart data={dailyData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600 }} />
          <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
          <Line type="monotone" dataKey={metricKey} stroke={color} strokeWidth={4} dot={{ r: 4, fill: color }} activeDot={{ r: 6 }} name={chart.title} />
          {chart.showTrend && <Line type="monotone" dataKey={`${metricKey}Trend`} stroke="#000" strokeDasharray="5 5" dot={false} opacity={0.3} name="Trend (7d Avg)" />}
        </LineChart>
      );
    }

    if (chart.type === 'area') {
      return (
        <AreaChart data={dailyData}>
          <defs>
            <linearGradient id={`color-${chart.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="date" axisLine={false} tickLine={false} />
          <YAxis axisLine={false} tickLine={false} />
          <Tooltip />
          <Area type="monotone" dataKey={metricKey} stroke={color} fillOpacity={1} fill={`url(#color-${chart.id})`} name={chart.title} />
        </AreaChart>
      );
    }

    return (
      <BarChart data={dailyData}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
        <XAxis dataKey="date" axisLine={false} tickLine={false} />
        <YAxis axisLine={false} tickLine={false} />
        <Tooltip />
        {chart.metric === 'returned' ? (
          <>
            <Legend onClick={(e) => toggleSeries(chart.id, String(e.dataKey))} />
            {!chartHidden.includes('returnedBatteries') && <Bar dataKey="returnedBatteries" name="Returned" fill="#f59e0b" />}
            {!chartHidden.includes('assignedBatteries') && <Bar dataKey="assignedBatteries" name="Assigned" fill="#6366f1" />}
          </>
        ) : (
          <Bar dataKey={metricKey} fill={color} radius={[8, 8, 0, 0]} name={chart.title} />
        )}
      </BarChart>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl">
              <PresentationChartLineIcon className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h1 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight">Swapping <span className="text-indigo-600">Analytics</span></h1>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 font-medium ml-1">Visual data analysis of your swapping sessions</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <button 
            onClick={() => setShowAddChartModal(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-2xl font-bold text-sm border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 transition-all active:scale-95"
          >
            <PlusIcon className="w-5 h-5 text-indigo-600" /> Add Chart
          </button>
          <button 
            onClick={() => setShowManualModal(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-none"
          >
            <CloudArrowUpIcon className="w-5 h-5" /> Import Data
          </button>
          
          <div className="flex-1 md:w-64">
            <CustomSelect 
              value={stationFilter}
              onChange={setStationFilter}
              options={uniqueStations.map(s => ({ value: s, label: s === 'all' ? 'All Stations' : s }))}
            />
          </div>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 p-20 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 text-center flex flex-col items-center gap-6">
          <div className="w-20 h-20 bg-zinc-50 dark:bg-zinc-800/50 rounded-full flex items-center justify-center">
            <CloudArrowUpIcon className="w-10 h-10 text-zinc-300" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">No Data Found</h2>
            <p className="text-zinc-500 max-w-sm mx-auto font-medium">Please import your swap session Excel data to generate the analytics dashboard.</p>
          </div>
          <button 
            onClick={() => setShowManualModal(true)}
            className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all"
          >
            Import Data Now
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Summary Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm flex flex-col gap-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Total Swaps</span>
              <span className="text-2xl font-black text-zinc-900 dark:text-white">{filteredSessions.length}</span>
            </div>
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm flex flex-col gap-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Swap Amount</span>
              <span className="text-2xl font-black text-emerald-600">₹{filteredSessions.reduce((acc, s) => acc + s.amount, 0).toLocaleString()}</span>
            </div>
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm flex flex-col gap-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Penalty Paid</span>
              <span className="text-2xl font-black text-rose-500">₹{filteredSessions.reduce((acc, s) => acc + (s.penalty_paid_amount || 0), 0).toLocaleString()}</span>
            </div>
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm flex flex-col gap-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Bat In/Out</span>
              <span className="text-2xl font-black text-amber-500">
                {filteredSessions.reduce((acc, s) => acc + (s.old_battries?.length || 0), 0)} / {filteredSessions.reduce((acc, s) => acc + (s.new_battries?.length || 0), 0)}
              </span>
            </div>
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm flex flex-col gap-1 col-span-2 md:col-span-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Avg. per Swap</span>
              <span className="text-2xl font-black text-indigo-600">
                ₹{Math.round(filteredSessions.reduce((acc, s) => acc + s.amount, 0) / (filteredSessions.length || 1))}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {charts?.map((chart) => (
              <div 
                key={chart.id} 
                className={`bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-6 relative group ${chart.span === 'full' ? 'lg:col-span-2' : ''}`}
              >
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <ChartBarIcon className="w-5 h-5 text-indigo-500" /> {chart.title}
                  </h3>
                  <button 
                    onClick={() => removeChart(chart.id)}
                    className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-full opacity-0 group-hover:opacity-100 transition-all active:scale-90"
                    title="Remove Chart"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>

                <div className={`${chart.span === 'full' ? 'h-[400px]' : 'h-[300px]'} w-full`}>
                  <ResponsiveContainer width="100%" height="100%">
                    {renderChartContent(chart)}
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Import Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-[95vw] h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800">
            <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                  <CloudArrowUpIcon className="w-7 h-7 text-indigo-600" />
                  Import Swap Analytics Data
                </h3>
                <p className="text-zinc-500 text-sm font-medium mt-1">Paste your excel data into the grid below (Supports many days of data)</p>
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
                    Process Analytics Data
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
                Note: This page is designed to analyze multiple days of session data imported via Excel.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add Chart Modal */}
      {showAddChartModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in zoom-in duration-300">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
            <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                <PlusIcon className="w-6 h-6 text-indigo-600" />
                Add New Chart
              </h3>
              <button 
                onClick={() => setShowAddChartModal(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Chart Title</label>
                <input 
                  type="text" 
                  value={newChart.title || ''}
                  onChange={(e) => setNewChart({...newChart, title: e.target.value})}
                  placeholder="e.g. Daily Revenue Analysis"
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-zinc-900 dark:text-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Metric to Visualize</label>
                <CustomSelect 
                  value={newChart.metric || 'swaps'}
                  onChange={(val) => {
                    const metric = METRIC_OPTIONS.find(m => m.value === val);
                    setNewChart({
                      ...newChart, 
                      metric: val as ChartMetric,
                      title: metric?.label,
                      type: metric?.allowedTypes[0]
                    });
                  }}
                  options={METRIC_OPTIONS.map(m => ({ value: m.value, label: m.label }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Chart Type</label>
                  <CustomSelect 
                    value={newChart.type || 'bar'}
                    onChange={(val) => setNewChart({...newChart, type: val as ChartType})}
                    options={METRIC_OPTIONS.find(m => m.value === newChart.metric)?.allowedTypes.map(t => ({ 
                      value: t, 
                      label: t.charAt(0).toUpperCase() + t.slice(1) 
                    })) || []}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Layout</label>
                  <CustomSelect 
                    value={newChart.span || 'single'}
                    onChange={(val) => setNewChart({...newChart, span: val as any})}
                    options={[
                      { value: 'single', label: 'Single Column' },
                      { value: 'full', label: 'Full Width' }
                    ]}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">Show trend line</p>
                  <p className="text-xs text-zinc-500">Calculate and overlay a basic trend</p>
                </div>
                <button 
                  onClick={() => setNewChart({...newChart, showTrend: !newChart.showTrend})}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${newChart.showTrend ? 'bg-indigo-600' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${newChart.showTrend ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <button 
                onClick={handleAddChart}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-none active:scale-95"
              >
                Add Chart to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SwappingAnalyticsPage;
