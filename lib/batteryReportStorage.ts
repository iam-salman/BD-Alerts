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

export const parseDateToMs = (dateVal?: string | number): number => {
  if (dateVal === null || dateVal === undefined) return 0;
  if (typeof dateVal === 'number') {
    if (isNaN(dateVal) || dateVal <= 0) return 0;
    // Excel serial date code (e.g. 25569 to 100000, roughly 1970 to 2070)
    if (dateVal >= 25569 && dateVal < 100000) {
      return Math.round((dateVal - 25569) * 86400 * 1000);
    }
    // Unix timestamp (if in seconds, convert to ms)
    return dateVal > 1e11 ? dateVal : dateVal * 1000;
  }

  const str = String(dateVal).trim();
  if (!str) return 0;
  const lower = str.toLowerCase();
  if (["n/a", "na", "--", "-", "none", "null", "undefined", "0", "never", "unknown"].includes(lower)) {
    return 0;
  }

  // Pure numeric string (e.g. "1712345678" or Excel "46235.6369")
  if (/^\d+(\.\d+)?$/.test(str)) {
    const num = parseFloat(str);
    if (!isNaN(num) && num > 0) {
      if (num >= 25569 && num < 100000) {
        return Math.round((num - 25569) * 86400 * 1000);
      }
      return num > 1e11 ? num : num * 1000;
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY with optional time & optional AM/PM
  // Examples: "01/08/2026 03:17:16 PM", "25-08-2026 15:30:00", "02/08/2026 04:31:50 PM", "24/05/2024"
  const ddmmyyyy = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\s*(am|pm))?)?$/i);
  if (ddmmyyyy) {
    const [_, d, m, y, hStr, minStr, secStr, ampm] = ddmmyyyy;
    let hour = hStr ? parseInt(hStr, 10) : 0;
    const min = minStr ? parseInt(minStr, 10) : 0;
    const sec = secStr ? parseInt(secStr, 10) : 0;

    if (ampm) {
      const isPM = ampm.toLowerCase() === "pm";
      if (isPM && hour < 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
    }

    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), hour, min, sec);
    if (!isNaN(date.getTime())) return date.getTime();
  }

  // YYYY-MM-DD or YYYY/MM/DD with optional time & optional AM/PM
  // Examples: "2026-08-01 15:17:16", "2026-08-01T15:17:16.000Z", "2026-08-01 03:17:16 PM"
  const yyyymmdd = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\s*(am|pm))?)?/i);
  if (yyyymmdd) {
    const [_, y, m, d, hStr, minStr, secStr, ampm] = yyyymmdd;
    let hour = hStr ? parseInt(hStr, 10) : 0;
    const min = minStr ? parseInt(minStr, 10) : 0;
    const sec = secStr ? parseInt(secStr, 10) : 0;

    if (ampm) {
      const isPM = ampm.toLowerCase() === "pm";
      if (isPM && hour < 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
    }

    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), hour, min, sec);
    if (!isNaN(date.getTime())) return date.getTime();
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
 * Parses SoC from raw cell string.
 * "N/A", "NA", "--", "", etc. evaluate to 0% as per specifications.
 * 0% stays 0% (never falls back to 100%).
 */
export const parseSocValue = (val: any): number => {
  if (val === null || val === undefined) return 0;
  const str = String(val).trim().toUpperCase();
  if (
    str === '' ||
    str === 'N/A' ||
    str === 'NA' ||
    str === '--' ||
    str === '-' ||
    str === 'NULL' ||
    str === 'UNDEFINED' ||
    str === 'NONE'
  ) {
    return 0;
  }
  const cleaned = str.replace(/%/g, '').trim();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.min(100, Math.max(0, Math.round(num * 10) / 10));
};

export const parseSohValue = (val: any): number => {
  if (val === null || val === undefined) return 100;
  const str = String(val).trim().toUpperCase();
  if (str === '' || str === 'N/A' || str === 'NA' || str === '--') return 100;
  const cleaned = str.replace(/%/g, '').trim();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 100;
  return Math.min(100, Math.max(0, Math.round(num * 10) / 10));
};

/**
 * Smart parser for a 2D matrix of strings into KazamBattery records.
 * Identifies header row by looking for key headers or defaults to standard indices.
 */
export const parseBatteryReportGrid = (grid: any[][]): KazamBattery[] => {
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
    const hasSwap = normRow.some(h => h.includes('swap'));

    if (hasBatId || (hasSoc && hasStatus) || hasSwap) {
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
        else if (norm.includes('totalswap') || norm === 'swaps' || norm === 'totalswaps' || norm.includes('freeswap')) colMap.totalSwaps = cIdx;
        else if (norm.includes('lastswap') || norm.includes('swapdate') || norm.includes('lastswapped') || norm.includes('swappedon') || norm.includes('swap') || norm.includes('swapped')) colMap.lastSwap = cIdx;
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

  const getCol = (row: any[], key: string, defaultIdx: number): string => {
    if (colMap[key] !== undefined && colMap[key] >= 0 && colMap[key] < row.length) {
      const val = row[colMap[key]];
      return val !== null && val !== undefined ? String(val).trim() : '';
    }
    if (defaultIdx >= 0 && defaultIdx < row.length) {
      const val = row[defaultIdx];
      return val !== null && val !== undefined ? String(val).trim() : '';
    }
    return '';
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

    let lastSwapStr = getCol(row, 'lastSwap', 10);
    let lastSwapMs = parseDateToMs(lastSwapStr);

    // Fallback: If lastSwapMs wasn't identified from the mapped column or default, check other columns for date strings
    if (!lastSwapMs) {
      for (let c = 0; c < row.length; c++) {
        if (c === colMap.batteryId || c === colMap.make || c === colMap.model || c === colMap.driverName) continue;
        const rawCell = row[c];
        if (rawCell === null || rawCell === undefined) continue;
        const cell = String(rawCell).trim();
        if (cell.length >= 8 && (cell.includes('/') || cell.includes('-') || cell.includes(':'))) {
          const testMs = parseDateToMs(cell);
          if (testMs >= 1577836800000 && testMs <= 2051222400000) {
            lastSwapMs = testMs;
            break;
          }
        }
      }
    }

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
      batteryHistory: lastSwapMs ? { timestamp: lastSwapMs } : undefined,
      last_updated_on: lastUpdatedMs || (lastSwapMs ? lastSwapMs : Date.now()),
      cycles: parseInt(getCol(row, 'chargeCycles', 12), 10) || (row[11] != null ? parseInt(String(row[11]), 10) : 0) || 0,
      charge_cycles: parseInt(getCol(row, 'chargeCycles', 12), 10) || 0,
      total_swaps: parseInt(getCol(row, 'totalSwaps', 11), 10) || 0,
      location: {
        coordinates: [
          parseFloat(getCol(row, 'lng', 14)) || 76.809,
          parseFloat(getCol(row, 'lat', 13)) || 30.677
        ]
      },
      soh: parseSohValue(getCol(row, 'soh', 15)),
      soc: parseSocValue(getCol(row, 'soc', 16)),
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
    // If raw grid is cached, always prioritize fresh parsing with the latest parser logic
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

    const cached = localStorage.getItem(BATTERIES_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure every battery has last_swap_on and batteryHistory properly populated
        const normalized = parsed.map((b: any) => {
          const rawSwap = b.batteryHistory?.timestamp || b.last_swap_on || b.last_swap_date || b.last_swap || b.lastSwapped;
          const swapMs = rawSwap ? parseDateToMs(rawSwap) : undefined;
          return {
            ...b,
            last_swap_on: swapMs || b.last_swap_on || undefined,
            batteryHistory: swapMs ? { timestamp: swapMs } : b.batteryHistory
          };
        });
        return normalized as KazamBattery[];
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
