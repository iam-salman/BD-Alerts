
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertTriangle, 
  MapPin, 
  Clock, 
  RefreshCw,
  Map as MapIcon,
  CheckCircle2,
  X,
  Filter,
  FileDown as ImportIcon,
  Download,
  User,
  Zap,
  Info,
  CalendarDays,
  Table as TableIcon,
  Trash2,
  Trash
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { getGeofenceAlerts, getBatteries, saveAlertHistory } from '@/lib/batteryService';
import { KazamGeofenceAlert, KazamBattery } from '@/types';
import Header from '@/components/Header';
import SortableHeader from '@/components/SortableHeader';
import PaginationFooter from '@/components/PaginationFooter';
import CustomSelect from '@/components/CustomSelect';

const IMPORT_HEADERS = [
  "Battery ID", 
  "Solution", 
  "Make", 
  "Model", 
  "Status", 
  "Station ID", 
  "Driver ID", 
  "Station Name", 
  "Driver Name", 
  "Driver Mobile Number", 
  "Last Swapped", 
  "Total Swaps", 
  "Charge Cycles", 
  "Latitude", 
  "Longitude", 
  "SOH", 
  "SOC", 
  "Battery Voltage", 
  "Battery Temperature", 
  "BMS_ID", 
  "IOT_ID"
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
        <table className="w-full text-left text-[10px] border-collapse bg-white dark:bg-zinc-950 min-w-[1500px]">
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
                  <td key={cIdx} className="p-0 border-r border-b border-zinc-200 dark:border-zinc-800 min-w-[120px]">
                    <input
                      id={`cell-${rIdx}-${cIdx}`}
                      value={row[cIdx] || ''}
                      onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)}
                      onPaste={(e) => onPasteEvent(e, rIdx, cIdx)}
                      className="w-full h-full px-3 py-2 bg-transparent outline-none focus:bg-indigo-50 dark:focus:bg-indigo-900/20 font-medium text-zinc-700 dark:text-zinc-200"
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
            Showing first 50 of {data.length} rows. Total data will be processed.
          </p>
        </div>
      )}
    </div>
  );
};

const GeofenceAlertsPage: React.FC = () => {
  const [alerts, setAlerts] = useState<KazamGeofenceAlert[]>([]);
  const [batteries, setBatteries] = useState<KazamBattery[]>([]);
  const [counts, setCounts] = useState<{ active: number; resolved: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | 'none' } | null>(null);
  const batteriesFetched = React.useRef(false);

  // Filters state
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [filterType, setFilterType] = useState<string>('');
  const [filterOwner, setFilterOwner] = useState<string>('');
  const [filterSwapStatus, setFilterSwapStatus] = useState<string>('all');
  const [showFakeAlerts, setShowFakeAlerts] = useState<boolean>(true);

  // Import State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importGridData, setImportGridData] = useState<string[][]>(() => {
    try {
      const saved = localStorage.getItem('geofence_battery_import_grid');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return Array.from({ length: 15 }, () => Array(21).fill(''));
  });
  const [isProcessingImport, setIsProcessingImport] = useState(false);
  const [batterySwapData, setBatterySwapData] = useState<Map<string, string>>(new Map()); // BatteryID -> LastSwapDate string

  useEffect(() => {
    try {
      localStorage.setItem('geofence_battery_import_grid', JSON.stringify(importGridData));
    } catch (e) {}
  }, [importGridData]);

  // Resolve Modal State
  const [selectedAlert, setSelectedAlert] = useState<KazamGeofenceAlert | null>(null);
  const [resolveNotes, setResolveNotes] = useState('Alert resolved and marked as completed');
  const [resolving, setResolving] = useState(false);

  const fetchBatteriesData = async () => {
    try {
      const batteriesRes = await getBatteries();
      if (batteriesRes.success) {
        setBatteries(batteriesRes.data);
      }
    } catch (err: any) {
      console.error('Failed to fetch batteries:', err);
    }
  };

  const fetchAlertsData = async (currentPage: number, currentLimit: number) => {
    setLoading(true);
    setError(null);
    try {
      const alertsRes = await getGeofenceAlerts(currentPage, currentLimit, filterStatus, filterType);

      if (alertsRes.success && alertsRes.data) {
        const data = alertsRes.data;
        const result = data.alerts || [];
        const total = data.pagination?.total ?? (data.counts?.total || result.length);
        
        setAlerts(result);
        setTotalRecords(total);
        setTotalPages(data.pagination?.totalPages || Math.ceil(total / currentLimit) || 1);
        if (data.counts) {
          setCounts(data.counts);
        }
      } else {
        setError(alertsRes.error || 'Failed to fetch alerts');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    await Promise.all([
      fetchAlertsData(page, itemsPerPage),
      fetchBatteriesData()
    ]);
  };

  const handleQuickResolve = async (alertId: string) => {
    setResolving(true);
    const defaultNotes = "Alert resolved and marked as completed";
    try {
      const res = await saveAlertHistory(alertId, defaultNotes);
      if (res.success) {
        setAlerts(prev => prev.map(a => a.alertId === alertId ? { ...a, isResolved: true } : a));
        // Success silent update, but refresh counts in background
        fetchAlertsData(page, itemsPerPage);
      } else {
        alert(res.error || 'Failed to resolve alert');
      }
    } catch (err: any) {
      alert(err.message || 'An error occurred');
    } finally {
      setResolving(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedAlert || !resolveNotes.trim()) return;

    setResolving(true);
    try {
      const res = await saveAlertHistory(selectedAlert.alertId, resolveNotes);
      if (res.success) {
        // Update local state temporarily or refresh
        setAlerts(prev => prev.map(a => a.alertId === selectedAlert.alertId ? { ...a, isResolved: true } : a));
        setSelectedAlert(null);
        setResolveNotes('Alert resolved and marked as completed');
        // Refresh counts
        fetchAlertsData(page, itemsPerPage);
      } else {
        alert(res.error || 'Failed to resolve alert');
      }
    } catch (err: any) {
      alert(err.message || 'An error occurred');
    } finally {
      setResolving(false);
    }
  };

  const handleExport = () => {
    if (alerts.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = [
      'Alert ID',
      'Battery ID',
      'IoT ID',
      'Type',
      'Latitude',
      'Longitude',
      'Station/Dealer',
      'Geofence ID',
      'Range (m)',
      'Distance (m)',
      'Timestamp',
      'Status'
    ];

    const rows = sortedAlerts.map(alert => {
      const status = alert.isResolved ? 'Resolved' : 'Open';
      const date = new Date(alert.timestamp * 1000).toLocaleString();
      
      return [
        alert.alertId,
        alert.batteryId,
        alert.batteryIotId,
        alert.alertType,
        alert.batteryLocation.latitude,
        alert.batteryLocation.longitude,
        `"${alert.dealer?.dealerName || '--'}"`,
        alert.geofenceId,
        alert.geofenceRange,
        alert.distanceFromGeofence,
        `"${date}"`,
        status
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `geofence_alerts_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    const load = async () => {
      const tasks: Promise<any>[] = [fetchAlertsData(page, itemsPerPage)];
      if (!batteriesFetched.current) {
        tasks.push(fetchBatteriesData());
        batteriesFetched.current = true;
      }
      await Promise.all(tasks);
    };
    load();
  }, [page, itemsPerPage, filterStatus, filterType]);

  const handleImportPasteEvent = (e: React.ClipboardEvent, rIdx: number, cIdx: number) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    if (!text) return;
    const newData = parsePasteData(text, importGridData, rIdx, cIdx, 21);
    setImportGridData(newData);
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
          Array.from({ length: 21 }, (_, i) => {
            const val = row[i];
            if (val instanceof Date) return format(val, 'dd/MM/yyyy HH:mm:ss a');
            return val !== undefined && val !== null ? String(val) : "";
          })
        );

        setImportGridData(newGridData);
      } catch (err) {
        console.error("Excel import error:", err);
        alert("Failed to parse Excel file.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleImportData = () => {
    setIsProcessingImport(true);
    const newMap = new Map<string, string>();
    
    // Improved robust processing of grid data
    // Format usually: Battery ID at [0], Last Swapped at [10]
    importGridData.forEach(row => {
      // Find index of Battery ID and Last Swapped in case user pasted with headers or shifted columns
      // But we assume the standard grid layout provided in IMPORT_HEADERS
      const col0 = String(row[0] || '').trim();
      if (!col0 || col0.toLowerCase().includes('battery id')) return;
      
      const batteryId = col0;
      const lastSwap = row[10] != null ? String(row[10]).trim() : '';
      
      if (batteryId && lastSwap && lastSwap.toLowerCase() !== 'n/a' && !lastSwap.toLowerCase().includes('last swapped')) {
        newMap.set(batteryId, lastSwap);
      }
    });

    if (newMap.size > 0) {
      setBatterySwapData(newMap);
      setIsImportModalOpen(false);
      setIsProcessingImport(false);
      alert(`Imported last swap data for ${newMap.size} batteries.`);
    } else {
      setIsProcessingImport(false);
      alert('No valid data found to import. Please ensure Battery ID is in the first column and Last Swapped is in the 11th column.');
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' | 'none' = 'asc';
    if (sortConfig && sortConfig.key === key) {
      if (sortConfig.direction === 'asc') direction = 'desc';
      else if (sortConfig.direction === 'desc') direction = 'none';
    }
    setSortConfig(direction === 'none' ? null : { key, direction });
  };

  const batteryMap = useMemo(() => {
    const map = new Map<string, KazamBattery>();
    batteries.forEach(b => map.set(b.id, b));
    return map;
  }, [batteries]);

  const getFakeStatus = (alert: KazamGeofenceAlert) => {
    const battery = batteryMap.get(alert.batteryId);
    
    // 1. Invalid coordinates
    if (alert.alertType === 'INVALID_COORDINATES' || (alert.batteryLocation.latitude === 0 && alert.batteryLocation.longitude === 0)) {
      return { isFake: true, reason: 'Invalid Coordinates' };
    }

    // 2. Battery assigned to driver
    if (battery?.driverData?.name) {
      return { isFake: true, reason: 'Assigned to Driver' };
    }

    // 3. Alert before last swap
    const lastSwapStr = batterySwapData.get(alert.batteryId);
    if (lastSwapStr) {
      // Parse DD/MM/YYYY HH:mm:ss AM/PM
      try {
        const [datePart, timePart, ampm] = lastSwapStr.split(' ');
        const [day, month, year] = datePart.split('/').map(Number);
        let [hours, minutes, seconds] = timePart.split(':').map(Number);
        
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        
        const lastSwapTime = new Date(year, month - 1, day, hours, minutes, seconds).getTime() / 1000;
        
        if (alert.timestamp < lastSwapTime) {
          return { isFake: true, reason: 'Pre-Swap Alert' };
        }
      } catch (e) {
        console.error('Failed to parse date:', lastSwapStr, e);
      }
    }

    return { isFake: false, reason: null };
  };

  const filteredAlerts = useMemo(() => {
    let result = [...alerts];

    // Filter by Owner Type
    if (filterOwner) {
      result = result.filter(alert => {
        const battery = batteryMap.get(alert.batteryId);
        if (!battery) return filterOwner === 'unknown';
        
        // Robust check for driver assignment: check both driverData and driver_id
        const hasDriver = !!(battery.driverData?.name) || (!!battery.driver_id && battery.driver_id !== 'N/A' && battery.driver_id !== '--');
        // Robust check for station assignment: if no driver and has station name/id
        const hasStation = !hasDriver && (!!(battery.dealer_name && battery.dealer_name.trim() !== '' && battery.dealer_name !== '--') || (!!battery.dealer_id && battery.dealer_id !== '--'));

        if (filterOwner === 'driver') return hasDriver;
        if (filterOwner === 'station') return hasStation;
        if (filterOwner === 'unknown') return !hasDriver && !hasStation;
        return true;
      });
    }

    // Filter by Swap Sync Status
    if (filterSwapStatus !== 'all') {
      result = result.filter(alert => {
        const fakeStatus = getFakeStatus(alert);
        if (filterSwapStatus === 'pre-swap') return fakeStatus.reason === 'Pre-Swap Alert';
        if (filterSwapStatus === 'post-swap') {
          // If we have swap data, ensure it's NOT pre-swap.
          // If no swap data imported, we treat as unknown for this specific filter
          const hasSwapData = !!batterySwapData.get(alert.batteryId);
          return hasSwapData && fakeStatus.reason !== 'Pre-Swap Alert';
        }
        return true;
      });
    }

    // Hide Fake Alerts if toggled
    if (!showFakeAlerts) {
      result = result.filter(alert => !getFakeStatus(alert).isFake);
    }

    return result;
  }, [alerts, batteryMap, filterOwner, filterSwapStatus, showFakeAlerts, batterySwapData]);

  const sortedAlerts = useMemo(() => {
    if (!sortConfig) return filteredAlerts;

    return [...filteredAlerts].sort((a, b) => {
      let aValue: any = a[sortConfig.key as keyof KazamGeofenceAlert];
      let bValue: any = b[sortConfig.key as keyof KazamGeofenceAlert];

      // Handle nested values if needed
      if (sortConfig.key === 'dealerName') {
        aValue = a.dealer?.dealerName;
        bValue = b.dealer?.dealerName;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredAlerts, sortConfig]);

  const renderBatteryId = (batteryId: string) => {
    const battery = batteryMap.get(batteryId);
    const isOnline = battery?.network;
    
    return (
      <div className={`px-2 py-1 rounded text-xs font-bold inline-block ${
        isOnline 
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      }`}>
        {batteryId}
      </div>
    );
  };

  const getOwnerInfo = (batteryId: string) => {
    const battery = batteryMap.get(batteryId);
    if (!battery) return '--';

    if (battery.driverData?.name) {
      return (
        <div>
          <p className="text-xs font-bold text-zinc-900 dark:text-white">{battery.driverData.name}</p>
          <p className="text-[10px] text-zinc-500">{battery.driver_id || '--'}</p>
        </div>
      );
    }

    return (
      <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
        {battery.dealer_name || 'In Station'}
      </p>
    );
  };

  if (loading && alerts.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <MapIcon className="w-7 h-7 text-indigo-600" />
            Geofence Alerts
          </h1>
          <p className="text-sm text-zinc-500 font-medium">Real-time geofence breach monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export Report
          </button>
          <button 
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all shadow-sm"
          >
            <ImportIcon className="w-4 h-4" />
            Import Report
          </button>
          <button 
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-bold text-zinc-500 uppercase">Filters:</span>
        </div>
        
        <div className="flex items-center gap-2">
          <CustomSelect
            options={[
              { value: 'active', label: 'Status: Open' },
              { value: 'resolved', label: 'Status: Resolved' },
              { value: '', label: 'Status: All' }
            ]}
            value={filterStatus}
            onChange={(val) => { setFilterStatus(val); setPage(1); }}
            className="!py-2 !px-3 min-w-[140px]"
          />
        </div>

        <div className="flex items-center gap-2">
          <CustomSelect
            options={[
              { value: '', label: 'All Types' },
              { value: 'EXIT', label: 'Exit' },
              { value: 'ENTER', label: 'Enter' },
              { value: 'INVALID_COORDINATES', label: 'Invalid Coords' }
            ]}
            value={filterType}
            onChange={(val) => { setFilterType(val); setPage(1); }}
            className="!py-2 !px-3 min-w-[140px]"
          />
        </div>

        <div className="flex items-center gap-2">
          <CustomSelect
            options={[
              { value: '', label: 'All Owners' },
              { value: 'driver', label: 'With Driver' },
              { value: 'station', label: 'With Station' },
              { value: 'unknown', label: 'Unknown' }
            ]}
            value={filterOwner}
            onChange={(val) => { setFilterOwner(val); setPage(1); }}
            className="!py-2 !px-3 min-w-[140px]"
          />
        </div>

        <div className="flex items-center gap-2">
          <CustomSelect
            options={[
              { value: 'all', label: 'All Swap Sync' },
              { value: 'pre-swap', label: 'Pre-Swap (Fake)' },
              { value: 'post-swap', label: 'Post-Swap (Valid)' }
            ]}
            value={filterSwapStatus}
            onChange={(val) => { setFilterSwapStatus(val); setPage(1); }}
            className="!py-2 !px-3 min-w-[160px]"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none ml-auto">
          <input 
            type="checkbox" 
            checked={showFakeAlerts}
            onChange={(e) => setShowFakeAlerts(e.target.checked)}
            className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">Show Fake Alerts</span>
        </label>
      </div>

      {counts && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Total Alerts</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-white">{counts.total.toLocaleString()}</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Active Alerts</p>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{counts.active.toLocaleString()}</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <p className="text-[10px] font-bold text-green-500 uppercase tracking-wider mb-1">Resolved Alerts</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{counts.resolved.toLocaleString()}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-bold">{error}</p>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50/50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
                <SortableHeader label="Alert ID" sortKey="alertId" currentSort={sortConfig} onSort={handleSort} />
                <SortableHeader label="Battery ID" sortKey="batteryId" currentSort={sortConfig} onSort={handleSort} />
                <SortableHeader label="IoT ID" sortKey="batteryIotId" currentSort={sortConfig} onSort={handleSort} />
                <SortableHeader label="Type" sortKey="alertType" currentSort={sortConfig} onSort={handleSort} />
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Battery Location</th>
                <SortableHeader label="Station / Dealer" sortKey="dealerName" currentSort={sortConfig} onSort={handleSort} />
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Range/Dist</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Current Owner</th>
                <SortableHeader label="Timestamp" sortKey="timestamp" currentSort={sortConfig} onSort={handleSort} />
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Last Swapped</th>
                <SortableHeader label="Status" sortKey="isResolved" currentSort={sortConfig} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {sortedAlerts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-zinc-500 font-medium italic">
                    No geofence alerts found
                  </td>
                </tr>
              ) : (
                sortedAlerts.map((alert) => {
                  const fakeStatus = getFakeStatus(alert);
                  return (
                    <tr key={alert._id} className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${fakeStatus.isFake ? 'opacity-60 bg-zinc-50/50 grayscale-[0.5]' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-xs font-mono font-bold text-zinc-600 dark:text-zinc-400">{alert.alertId}</span>
                          {fakeStatus.isFake && (
                            <span className="text-[9px] font-bold text-red-500 flex items-center gap-0.5">
                              <Zap className="w-2.5 h-2.5" />
                              Fake: {fakeStatus.reason}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {renderBatteryId(alert.batteryId)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs text-zinc-500 font-medium">{alert.batteryIotId}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          alert.alertType === 'EXIT' 
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' 
                            : alert.alertType === 'ENTER'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                              : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}>
                          {alert.alertType}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span>{alert.batteryLocation.latitude.toFixed(5)}, {alert.batteryLocation.longitude.toFixed(5)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-zinc-900 dark:text-white">
                        <div className="whitespace-nowrap">
                          {alert.dealer?.dealerName || '--'}
                          <p className="text-[10px] text-zinc-500 font-normal">ID: {alert.geofenceId}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Range: <span className="font-bold">{alert.geofenceRange}m</span></p>
                          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Dist: <span className="font-bold text-indigo-600 dark:text-indigo-400">{alert.distanceFromGeofence}m</span></p>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getOwnerInfo(alert.batteryId)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-zinc-500 whitespace-nowrap">
                          <Clock className="w-4 h-4" />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-zinc-900 dark:text-white">
                              {new Date(alert.timestamp * 1000).toLocaleDateString()}
                            </span>
                            <span className="text-[10px] font-medium">
                              {new Date(alert.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-zinc-500 whitespace-nowrap">
                          {batterySwapData.get(alert.batteryId) ? (
                            <>
                              <CalendarDays className="w-4 h-4 text-indigo-500" />
                              <span className="text-xs font-bold text-zinc-900 dark:text-white">
                                {batterySwapData.get(alert.batteryId)}
                              </span>
                            </>
                          ) : (
                            <span className="text-[10px] italic text-zinc-400">Not imported</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {alert.isResolved ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Resolved
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="relative group min-w-[70px]">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 group-hover:opacity-0 transition-opacity">
                                Open
                              </span>
                              <button
                                onClick={() => {
                                  setSelectedAlert(alert);
                                  setResolveNotes('Alert resolved and marked as completed');
                                }}
                                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-600 text-white rounded-full text-[10px] font-bold px-2 py-0.5"
                              >
                                Resolve
                              </button>
                            </div>
                            <button
                              onClick={() => handleQuickResolve(alert.alertId)}
                              disabled={resolving}
                              className="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all"
                              title="Quick Resolve (1-Click)"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <PaginationFooter 
          currentPage={page}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          onPageChange={setPage}
          onItemsPerPageChange={setItemsPerPage}
          dataLength={totalRecords}
        />
      </div>

      {/* Resolve Modal */}
      <AnimatePresence>
        {selectedAlert && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedAlert(null)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50">
                <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  Resolve Alert
                </h3>
                <button 
                  onClick={() => setSelectedAlert(null)}
                  className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase">Alert Details</p>
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">{selectedAlert.alertId}</p>
                  <p className="text-xs text-zinc-500">{selectedAlert.message}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Resolution Notes</label>
                  <textarea
                    value={resolveNotes}
                    onChange={(e) => setResolveNotes(e.target.value)}
                    placeholder="Enter details about how the alert was resolved..."
                    className="w-full h-32 px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none transition-all"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setSelectedAlert(null)}
                    className="flex-1 px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleResolve}
                    disabled={resolving || !resolveNotes.trim()}
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {resolving ? <RefreshCw className="w-5 h-5 animate-spin mx-auto" /> : 'Resolve Alert'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Import Modal */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsImportModalOpen(false)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50">
                <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <ImportIcon className="w-5 h-5 text-indigo-600" />
                  Import Battery Swap Report
                </h3>
                <button 
                  onClick={() => setIsImportModalOpen(false)}
                  className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-indigo-50/50 dark:bg-indigo-900/10 p-4 rounded-xl border border-indigo-100/50 dark:border-indigo-900/30">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-indigo-700 dark:text-indigo-300">
                      <p className="font-bold mb-1 tracking-tight uppercase text-[10px]">Import Guidelines:</p>
                      <ul className="list-disc list-inside space-y-0.5 opacity-80">
                        <li>Col 1: Battery ID</li>
                        <li>Col 11: Last Swapped (Format: DD/MM/YYYY HH:MM:SS AM/PM)</li>
                        <li>Supports direct Excel copy-paste into grid</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-700 transition-all shadow-sm cursor-pointer whitespace-nowrap">
                      <Download className="w-3 h-3" />
                      Browse Excel
                      <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelImport} />
                    </label>
                    <button 
                      onClick={() => setImportGridData(Array.from({ length: 15 }, () => Array(21).fill('')))}
                      className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                      title="Clear Grid"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-950 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
                  <ExcelGrid 
                    headers={IMPORT_HEADERS} 
                    data={importGridData} 
                    onChange={setImportGridData}
                    onPasteEvent={handleImportPasteEvent}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setIsImportModalOpen(false)}
                    className="flex-1 px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all font-button"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImportData}
                    disabled={isProcessingImport}
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-2 font-button"
                  >
                    {isProcessingImport ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TableIcon className="w-4 h-4" />}
                    Import From Grid
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GeofenceAlertsPage;
