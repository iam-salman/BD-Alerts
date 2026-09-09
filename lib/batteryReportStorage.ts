import { KazamBattery } from '../types';

export const BATTERIES_CACHE_KEY = "bd_ops_batteries_cache_v3";
export const BATTERY_GRID_CACHE_KEY = "bd_ops_alerts_battery_grid_v1";
export const INGESTION_GRID_CACHE_KEY = "bd_ops_ingestion_grid_v3";
export const BATTERY_REPORT_TIMESTAMP_KEY = "bd_ops_battery_report_updated_at";

export const BATTERY_REPORT_HEADERS = [
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
  "Last Swap Date",
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

const parseDateToMs = (dateStr?: string | number): number => {
  if (!dateStr || dateStr === 'N/A' || dateStr === '--') return 0;
  if (typeof dateStr === 'number') {
    return dateStr > 100000000000 ? dateStr : dateStr * 1000;
  }
  const str = String(dateStr).trim();
  if (!str) return 0;

  // Check DD-MM-YYYY or DD/MM/YYYY with optional time
  const ddmmyyyyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (ddmmyyyyMatch) {
    const [_, d, m, y, h, min, s] = ddmmyyyyMatch;
    const isoStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${(h || '00').padStart(2, '0')}:${(min || '00').padStart(2, '0')}:${(s || '00').padStart(2, '0')}`;
    const ts = new Date(isoStr).getTime();
    if (!isNaN(ts)) return ts;
  }

  // Check YYYY-MM-DD
  const yyyymmddMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (yyyymmddMatch) {
    const [_, y, m, d, h, min, s] = yyyymmddMatch;
    const isoStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${(h || '00').padStart(2, '0')}:${(min || '00').padStart(2, '0')}:${(s || '00').padStart(2, '0')}`;
    const ts = new Date(isoStr).getTime();
    if (!isNaN(ts)) return ts;
  }

  const parsed = new Date(str).getTime();
  return isNaN(parsed) ? 0 : parsed;
};

const cleanDriverId = (val?: any): string => {
  if (!val) return '';
  const str = String(val).trim();
  if (!str || str.toLowerCase() === 'n/a' || str === '--') return '';
  if (/^67[a-f0-9]{22}$/i.test(str)) return '';
  return str;
};

const normalizeHeader = (h: any): string => {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
};

/**
 * Smart parser for a 2D matrix of strings into KazamBattery records.
 * Identifies header row by looking for key headers or defaults to standard indices.
 */
export const parseBatteryReportGrid = (grid: string[][]): KazamBattery[] => {
  if (!grid || grid.length === 0) return [];

  let headerRowIdx = -1;
  const colMap: Record<string, number> = {};

  for (let r = 0; r < Math.min(5, grid.length); r++) {
    const row = grid[r];
    if (!row || !Array.isArray(row)) continue;
    const normRow = row.map(normalizeHeader);
    const hasBatId = normRow.some(h => h.includes('batteryid') || h.includes('batid') || h === 'battery' || h === 'id');
    const hasSoc = normRow.some(h => h === 'soc' || h.includes('stateofcharge'));
    const hasStatus = normRow.some(h => h.includes('status'));

    if (hasBatId || (hasSoc && hasStatus)) {
      headerRowIdx = r;
      normRow.forEach((norm, cIdx) => {
        if (norm.includes('batteryid') || norm.includes('batid') || (norm === 'id' && !colMap.batteryId)) colMap.batteryId = cIdx;
        else if (norm.includes('solution')) colMap.solution = cIdx;
        else if (norm.includes('make')) colMap.make = cIdx;
        else if (norm.includes('model')) colMap.model = cIdx;
        else if (norm.includes('status')) colMap.status = cIdx;
        else if (norm.includes('stationid') || norm.includes('dealerid')) colMap.stationId = cIdx;
        else if (norm.includes('driverid') || norm.includes('drivercode')) colMap.driverId = cIdx;
        else if (norm.includes('stationname') || norm.includes('dealername')) colMap.stationName = cIdx;
        else if (norm.includes('drivername')) colMap.driverName = cIdx;
        else if (norm.includes('drivermobile') || norm.includes('driverphone') || norm.includes('phone') || norm.includes('mobile')) colMap.driverMobile = cIdx;
        else if (norm.includes('lastswap') || norm.includes('swapdate') || norm.includes('lastswapped') || norm.includes('swappedon')) colMap.lastSwap = cIdx;
        else if (norm.includes('totalswaps') || norm.includes('swaps')) colMap.totalSwaps = cIdx;
        else if (norm.includes('chargecycles') || norm === 'cycles') colMap.chargeCycles = cIdx;
        else if (norm === 'latitude' || norm === 'lat') colMap.lat = cIdx;
        else if (norm === 'longitude' || norm === 'long' || norm === 'lng') colMap.lng = cIdx;
        else if (norm === 'soh') colMap.soh = cIdx;
        else if (norm === 'soc') colMap.soc = cIdx;
        else if (norm.includes('voltage')) colMap.voltage = cIdx;
        else if (norm.includes('temperature') || norm === 'temp') colMap.temp = cIdx;
        else if (norm.includes('bms')) colMap.bmsId = cIdx;
        else if (norm.includes('iot')) colMap.iotId = cIdx;
        else if (norm.includes('lastupdate') || norm.includes('lastupdated') || norm.includes('updatedon') || norm.includes('updatedat')) colMap.lastUpdated = cIdx;
      });
      break;
    }
  }

  const getCol = (row: string[], key: string, defaultIdx: number): string => {
    if (colMap[key] !== undefined && colMap[key] >= 0 && colMap[key] < row.length) {
      return (row[colMap[key]] || '').trim();
    }
    return (row[defaultIdx] || '').trim();
  };

  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  const result: KazamBattery[] = [];

  for (let r = startRow; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length === 0) continue;

    const batId = getCol(row, 'batteryId', 0);
    if (!batId || batId === "Battery ID" || batId.toLowerCase() === "battery_id") continue;

    const statusStr = getCol(row, 'status', 4).toLowerCase();
    let statusCode = 0;
    if (statusStr.includes("assigned")) statusCode = 2;
    else if (statusStr.includes("charging")) statusCode = 4;
    else if (statusStr.includes("error")) statusCode = 3;

    const rawStationId = getCol(row, 'stationId', 5);
    const stationId = rawStationId === 'N/A' || rawStationId === '--' ? '' : rawStationId;

    const rawDriverId = getCol(row, 'driverId', 6);
    const driverId = cleanDriverId(rawDriverId);

    const rawStationName = getCol(row, 'stationName', 7);
    const stationName = rawStationName === 'N/A' || rawStationName === '--' ? '' : rawStationName;

    const lastSwapStr = getCol(row, 'lastSwap', 10);
    const lastSwapMs = parseDateToMs(lastSwapStr);

    const lastUpdatedStr = colMap.lastUpdated !== undefined ? getCol(row, 'lastUpdated', -1) : '';
    const lastUpdatedMs = lastUpdatedStr ? parseDateToMs(lastUpdatedStr) : undefined;

    const driverName = getCol(row, 'driverName', 8);
    const driverMobile = getCol(row, 'driverMobile', 9);

    const batObj: KazamBattery = {
      _id: batId,
      id: batId,
      make: getCol(row, 'make', 2) || "Vecmocon",
      model: getCol(row, 'model', 3) || "Vec_connected_bat",
      status: statusCode,
      dealer_id: stationId,
      driver_id: driverId,
      dealer_name: stationName,
      driverData: driverId ? {
        name: driverName || "",
        phone: driverMobile || ""
      } : undefined,
      last_swap_on: lastSwapMs || undefined,
      last_updated_on: lastUpdatedMs,
      cycles: parseInt(getCol(row, 'chargeCycles', 12)) || parseInt(row[11]) || 0,
      charge_cycles: parseInt(getCol(row, 'chargeCycles', 12)) || 0,
      location: {
        coordinates: [
          parseFloat(getCol(row, 'lng', 14)) || 76.809,
          parseFloat(getCol(row, 'lat', 13)) || 30.677
        ]
      },
      soh: parseFloat(getCol(row, 'soh', 15)) || 100,
      soc: parseFloat(getCol(row, 'soc', 16)) || 100,
      voltage: parseFloat(getCol(row, 'voltage', 17)) || 52.0,
      temperature: parseFloat(getCol(row, 'temp', 18)) || 40,
      bms_id: getCol(row, 'bmsId', 19),
      iot_id: getCol(row, 'iotId', 20),
      network: true,
      odometer: 0
    };

    result.push(batObj);
  }

  return result;
};

/**
 * Returns batteries from localStorage.
 */
export const getStoredBatteries = (): KazamBattery[] => {
  try {
    const cached = localStorage.getItem(BATTERIES_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as KazamBattery[];
      }
    }

    // Fallback: Check if grid cache is present and parse it
    const gridStr = localStorage.getItem(BATTERY_GRID_CACHE_KEY) || localStorage.getItem(INGESTION_GRID_CACHE_KEY);
    if (gridStr) {
      const grid = JSON.parse(gridStr);
      if (Array.isArray(grid) && grid.length > 0) {
        const parsedBats = parseBatteryReportGrid(grid);
        if (parsedBats.length > 0) {
          localStorage.setItem(BATTERIES_CACHE_KEY, JSON.stringify(parsedBats));
          return parsedBats;
        }
      }
    }
  } catch (e) {
    console.error("Error reading stored batteries from localStorage:", e);
  }
  return [];
};

/**
 * Saves uploaded battery report data into localStorage and triggers sync events.
 */
export const saveBatteryReport = (batteries: KazamBattery[], rawGrid?: string[][]): void => {
  try {
    localStorage.setItem(BATTERIES_CACHE_KEY, JSON.stringify(batteries));
    localStorage.setItem(BATTERY_REPORT_TIMESTAMP_KEY, String(Date.now()));
    
    if (rawGrid && Array.isArray(rawGrid)) {
      localStorage.setItem(BATTERY_GRID_CACHE_KEY, JSON.stringify(rawGrid));
      localStorage.setItem(INGESTION_GRID_CACHE_KEY, JSON.stringify(rawGrid));
    }

    // Broadcast update across the current window and all listeners
    window.dispatchEvent(new CustomEvent('batteryReportUpdated', { detail: { count: batteries.length } }));
    window.dispatchEvent(new Event('storage'));
  } catch (e) {
    console.error("Failed to save battery report to localStorage:", e);
  }
};

/**
 * Clears stored battery report data.
 */
export const clearStoredBatteries = (): void => {
  try {
    localStorage.removeItem(BATTERIES_CACHE_KEY);
    localStorage.removeItem(BATTERY_GRID_CACHE_KEY);
    localStorage.removeItem(INGESTION_GRID_CACHE_KEY);
    localStorage.removeItem(BATTERY_REPORT_TIMESTAMP_KEY);

    window.dispatchEvent(new CustomEvent('batteryReportUpdated', { detail: { count: 0 } }));
    window.dispatchEvent(new Event('storage'));
  } catch (e) {
    console.error("Failed to clear battery report from localStorage:", e);
  }
};

/**
 * Subscribes to battery report changes in localStorage.
 */
export const subscribeToBatteryReport = (callback: (batteries: KazamBattery[]) => void): (() => void) => {
  const handler = () => {
    const bats = getStoredBatteries();
    callback(bats);
  };

  window.addEventListener('batteryReportUpdated', handler);
  window.addEventListener('storage', handler);

  return () => {
    window.removeEventListener('batteryReportUpdated', handler);
    window.removeEventListener('storage', handler);
  };
};
