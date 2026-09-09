
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { 
  ExclamationCircleIcon, 
  CheckCircleIcon, 
  TrashIcon, 
  MagnifyingGlassIcon, 
  MapPinIcon, 
  UserCircleIcon, 
  ShieldCheckIcon, 
  XCircleIcon, 
  ArrowDownTrayIcon, 
  ArrowUpTrayIcon,
  CpuChipIcon,
  ChevronLeftIcon, 
  ChevronRightIcon,
  ClockIcon,
  PhoneIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  PauseCircleIcon,
  SignalIcon,
  SignalSlashIcon,
  BoltIcon,
  Battery50Icon,
  ArrowPathIcon,
  XMarkIcon,
  ArrowUpOnSquareIcon,
  TableCellsIcon
} from '@heroicons/react/24/outline';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, Firestore, writeBatch, getDocs, where, addDoc } from "firebase/firestore";
import { BatteryIssue, KazamDriver, KazamBattery, UserRole } from '@/types';
import CustomSelect from '@/components/CustomSelect';
import { useBatteryData } from '@/hooks/useBatteryData';
import { saveBatteryReport, clearStoredBatteries, parseSocValue, parseSohValue } from '@/lib/batteryReportStorage';
import SortableHeader from '@/components/SortableHeader';
import CopyButton from '@/components/CopyButton';
import PaginationFooter from '@/components/PaginationFooter';
import { PlusIcon, MinusIcon } from '@heroicons/react/24/outline';
import { toPng } from 'html-to-image';
import { usePopup } from '@/components/PopupContext';

interface AlertsPageProps { db: Firestore; isDarkMode: boolean; onBatterySelect?: (battery: KazamBattery) => void; role?: UserRole | string; }

const SkeletonRow: React.FC<{ cols?: number }> = ({ cols = 6 }) => (
  <tr className="animate-pulse border-b border-zinc-50 dark:border-zinc-805/50 last:border-0">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="px-6 py-4">
        {i === 0 ? (
          <div className="h-6 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-lg"></div>
        ) : i === 2 ? (
          <div className="space-y-1">
            <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
            <div className="h-3 w-40 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
          </div>
        ) : i === 3 ? (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800"></div>
            <div className="h-3 w-20 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
          </div>
        ) : (
          <div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
        )}
      </td>
    ))}
  </tr>
);

const normalizeIssueType = (type: string) => {
  if (!type) return 'Other';
  const lower = type.toLowerCase();
  if (lower.includes('uv')) return 'UV Issue';
  if (lower.includes('alert generated')) return 'System Alert';
  if (lower.includes('battery')) return 'Battery Issue';
  if (lower.includes('charger') || lower.includes('station')) return 'Station Issue';
  if (lower.includes('iot')) return 'IoT Issue';
  if (lower.includes('offline')) return 'Offline Alert';
  return type;
};

const cleanDescription = (desc: string) => {
  if (!desc) return '';
  // Remove "alert generated:" prefix
  let cleaned = desc.replace(/alert generated:?\s*/i, '').trim();
  
  // Remove common date/time patterns
  // Pattern for YYYY-MM-DD or DD/MM/YYYY
  cleaned = cleaned.replace(/\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/g, '');
  // Pattern for HH:mm:ss or HH:mm
  cleaned = cleaned.replace(/\d{1,2}:\d{1,2}(:\d{1,2})?/g, '');
  
  return cleaned.replace(/\s+/g, ' ').trim();
};

export const formatDate24 = (d: Date | number | string | null | undefined): string => {
  if (!d) return '--';
  const date = d instanceof Date ? d : new Date(typeof d === 'number' ? (d > 100000000000 ? d : d * 1000) : d);
  if (isNaN(date.getTime())) return '--';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

export const formatTime24 = (d: Date | number | string | null | undefined): string => {
  if (!d) return '--';
  const date = d instanceof Date ? d : new Date(typeof d === 'number' ? (d > 100000000000 ? d : d * 1000) : d);
  if (isNaN(date.getTime())) return '--';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const formatDateTime24 = (d: Date | number | string | null | undefined): string => {
  if (!d) return '--';
  const dateStr = formatDate24(d);
  if (dateStr === '--') return '--';
  const timeStr = formatTime24(d);
  return `${dateStr} ${timeStr}`;
};

// Global cache to persist data across navigations within the session
let cachedIssues: BatteryIssue[] | null = null;
let cachedFetchTime: number | null = null;
let cachedDrivers: KazamDriver[] | null = null;
let cachedAssignedBatteries: KazamBattery[] | null = null;
let cachedStagnantBatteries: KazamBattery[] | null = null;

const DRIVER_REPORT_GRID_CACHE_KEY = "bd_ops_alerts_driver_grid_v1";
const BATTERY_REPORT_GRID_CACHE_KEY = "bd_ops_alerts_battery_grid_v1";

const DRIVER_REPORT_HEADERS = [
  "Name",
  "Driver ID",
  "Phone",
  "Alternate Phone",
  "Email",
  "State",
  "City",
  "Address",
  "License Number",
  "Vehicle Number",
  "Chassis Number",
  "Aadhar Number",
  "Plan Name",
  "Free Swaps",
  "Deposit Amount",
  "Created Date",
  "Onboarded date",
  "Onboarding station ID",
  "Onboarding station name",
  "Total Swaps",
  "Last Swap Date",
  "Battery Return Date",
  "Onboarding Status",
  "Battery Status",
  "Driver Status",
  "Wallet Balance",
  "Assigned Battery 1",
  "Assigned Battery 2",
  "Total Penalty Amount",
  "Pending Penalty Amount",
  "Paid Penalty Amount"
];

const INITIAL_DRIVER_GRID_SEED = Array.from({ length: 15 }, () => Array(31).fill(""));

const BATTERY_REPORT_HEADERS = [
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

const INITIAL_BATTERY_GRID_SEED = Array.from({ length: 15 }, () => Array(21).fill(""));

export const isGridPopulated = (grid?: string[][]): boolean => {
  if (!Array.isArray(grid) || grid.length === 0) return false;
  return grid.some(row => Array.isArray(row) && row.some(cell => cell != null && String(cell).trim() !== ""));
};

export const parseDateToMs = (dateVal?: string | number): number => {
  if (dateVal === null || dateVal === undefined) return 0;
  if (typeof dateVal === 'number') {
    if (isNaN(dateVal) || dateVal <= 0) return 0;
    if (dateVal >= 25569 && dateVal < 100000) {
      return Math.round((dateVal - 25569) * 86400 * 1000);
    }
    return dateVal > 1e11 ? dateVal : dateVal * 1000;
  }
  const str = String(dateVal).trim();
  if (!str) return 0;
  const lower = str.toLowerCase();
  if (["n/a", "na", "--", "-", "none", "null", "undefined", "0", "never", "unknown"].includes(lower)) {
    return 0;
  }

  // Pure numeric string
  if (/^\d+(\.\d+)?$/.test(str)) {
    const num = parseFloat(str);
    if (!isNaN(num) && num > 0) {
      if (num >= 25569 && num < 100000) {
        return Math.round((num - 25569) * 86400 * 1000);
      }
      return num > 1e11 ? num : num * 1000;
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY with optional time & AM/PM
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

  // YYYY-MM-DD or YYYY/MM/DD with optional time & AM/PM
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

  const ts = new Date(str).getTime();
  return isNaN(ts) ? 0 : ts;
};

export const normalizeHeaderStr = (h: any): string => {
  if (h == null) return '';
  return String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
};

export const cleanDriverId = (id?: any): string => {
  if (id == null) return '';
  const s = String(id).trim();
  const lower = s.toLowerCase();
  const invalid = ['', 'n/a', 'na', 'n / a', 'none', 'null', 'undefined', '-', '--', '0', 'unassigned', 'not assigned', 'unknown', 'no driver'];
  if (invalid.includes(lower)) return '';
  return s;
};

// Maps source headers to target headers dynamically
export const mapHeadersToTargetIndices = (sourceHeaders: string[], targetHeaders: string[]): number[] => {
  return sourceHeaders.map((srcHeader) => {
    const norm = normalizeHeaderStr(srcHeader);
    if (!norm) return -1;
    
    // Direct match
    for (let t = 0; t < targetHeaders.length; t++) {
      const targetNorm = normalizeHeaderStr(targetHeaders[t]);
      if (norm === targetNorm) return t;
    }
    
    // Disambiguations
    if (norm.includes('altphone') || norm.includes('alternatenumber') || norm.includes('alternatephone') || norm.includes('altnumber') || norm.includes('emergencycontact')) {
      const idx = targetHeaders.findIndex(h => normalizeHeaderStr(h).includes('alternatephone') || normalizeHeaderStr(h).includes('altphone'));
      if (idx !== -1) return idx;
    }

    if (norm === 'driverid' || norm === 'driver_id' || norm === 'payerid' || norm === 'driveridentification') {
      const idx = targetHeaders.findIndex(h => normalizeHeaderStr(h) === 'driverid');
      if (idx !== -1) return idx;
    }

    if (norm === 'drivername' || norm === 'driver_name') {
      const idx = targetHeaders.findIndex(h => normalizeHeaderStr(h) === 'drivername' || normalizeHeaderStr(h) === 'name');
      if (idx !== -1) return idx;
    }

    if (norm === 'batteryid' || norm === 'battery_id' || norm === 'batid' || norm === 'serialnumber') {
      const idx = targetHeaders.findIndex(h => normalizeHeaderStr(h) === 'batteryid');
      if (idx !== -1) return idx;
    }

    if (norm.includes('battery1') || norm.includes('assignedbattery1') || norm.includes('batteryid1')) {
      const idx = targetHeaders.findIndex(h => normalizeHeaderStr(h).includes('assignedbattery1'));
      if (idx !== -1) return idx;
    }

    if (norm.includes('battery2') || norm.includes('assignedbattery2') || norm.includes('batteryid2')) {
      const idx = targetHeaders.findIndex(h => normalizeHeaderStr(h).includes('assignedbattery2'));
      if (idx !== -1) return idx;
    }

    if (norm.includes('lastswap') || norm.includes('swapdate') || norm.includes('swappedon')) {
      const idx = targetHeaders.findIndex(h => {
        const tn = normalizeHeaderStr(h);
        return tn.includes('lastswap') || tn.includes('swapdate') || tn.includes('swapped');
      });
      if (idx !== -1) return idx;
    }

    if (norm.includes('vehiclenumber') || norm.includes('vehicleno') || (norm.includes('vehicle') && !norm.includes('make') && !norm.includes('model'))) {
      const idx = targetHeaders.findIndex(h => normalizeHeaderStr(h).includes('vehiclenumber'));
      if (idx !== -1) return idx;
    }

    // Substring match
    for (let t = 0; t < targetHeaders.length; t++) {
      const targetNorm = normalizeHeaderStr(targetHeaders[t]);
      if (norm.includes(targetNorm) || targetNorm.includes(norm)) {
        return t;
      }
    }

    return -1;
  });
};

const parsePasteData = (
  text: string,
  gridData: string[][],
  startRow: number,
  startCol: number,
  colCount: number,
  targetHeaders?: string[]
): string[][] => {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return gridData;
  const rawRows = lines.map((l) => l.split(/\t/));

  // Smart check: if pasting from (0,0) and first row has headers
  if (startRow === 0 && startCol === 0 && targetHeaders && targetHeaders.length > 0 && rawRows.length > 1) {
    const firstRowNorms = rawRows[0].map(c => normalizeHeaderStr(c));
    const isHeaderRow = firstRowNorms.some(h => 
      h.includes('driverid') || h.includes('batteryid') || h.includes('station') || 
      (h.includes('name') && firstRowNorms.some(x => x.includes('phone')))
    );

    if (isHeaderRow) {
      const colMapping = mapHeadersToTargetIndices(rawRows[0], targetHeaders);
      const alignedGrid: string[][] = Array.from({ length: Math.max(15, rawRows.length - 1) }, () => Array(colCount).fill(""));
      let targetRow = 0;

      for (let r = 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!row || row.every(c => c == null || String(c).trim() === "")) continue;
        while (alignedGrid.length <= targetRow) {
          alignedGrid.push(Array(colCount).fill(""));
        }
        for (let c = 0; c < row.length; c++) {
          const targetCol = colMapping[c];
          if (targetCol >= 0 && targetCol < colCount) {
            alignedGrid[targetRow][targetCol] = row[c] != null ? String(row[c]).trim() : "";
          }
        }
        targetRow++;
      }
      return alignedGrid;
    }
  }

  // Standard cell placement
  const newData = [...gridData];
  for (let r = 0; r < rawRows.length; r++) {
    const targetRow = startRow + r;
    while (newData.length <= targetRow) {
      newData.push(Array(colCount).fill(""));
    }
    newData[targetRow] = [...newData[targetRow]];

    for (let c = 0; c < rawRows[r].length; c++) {
      const targetCol = startCol + c;
      if (targetCol < colCount) {
        newData[targetRow][targetCol] = rawRows[r][c] != null ? String(rawRows[r][c]).trim() : "";
      }
    }
  }
  return newData;
};

const parsePastedDriverReport = (grid: string[][]): KazamDriver[] => {
  const result: KazamDriver[] = [];
  if (!grid || grid.length === 0) return result;

  // Check if any of first 5 rows is a header row
  let headerRowIdx = -1;
  const colMap: Record<string, number> = {};

  for (let r = 0; r < Math.min(5, grid.length); r++) {
    const rowNorms = grid[r].map(normalizeHeaderStr);
    const hasDriverId = rowNorms.some(n => n.includes('driverid') || n === 'payerid');
    const hasName = rowNorms.some(n => n === 'name' || n === 'drivername');
    if (hasDriverId || (hasName && rowNorms.some(n => n.includes('phone')))) {
      headerRowIdx = r;
      grid[r].forEach((headerText, cIdx) => {
        const norm = normalizeHeaderStr(headerText);
        if (!norm) return;
        if (norm === 'driverid' || norm === 'driver_id' || norm === 'payerid') colMap.driverId = cIdx;
        else if (norm === 'name' || norm === 'drivername') colMap.name = cIdx;
        else if (norm === 'phone' || norm === 'mobilenumber' || norm === 'contact') colMap.phone = cIdx;
        else if (norm.includes('altphone') || norm.includes('alternatephone') || norm.includes('alternatenumber')) colMap.altPhone = cIdx;
        else if (norm === 'email') colMap.email = cIdx;
        else if (norm === 'city' || norm === 'location' || norm === 'hub') colMap.city = cIdx;
        else if (norm.includes('vehiclenumber') || norm.includes('vehicleno') || norm === 'vehicle') colMap.vehicleNumber = cIdx;
        else if (norm.includes('chassis')) colMap.chassisNumber = cIdx;
        else if (norm.includes('onboardeddate') || norm.includes('onboardingdate')) colMap.onboardingDate = cIdx;
        else if (norm.includes('onboardingstationid')) colMap.onboardingStationId = cIdx;
        else if (norm.includes('onboardingstationname')) colMap.onboardingStationName = cIdx;
        else if (norm.includes('totalswaps') || norm === 'swaps') colMap.totalSwaps = cIdx;
        else if (norm.includes('lastswapdate') || norm === 'lastswap') colMap.lastSwapDate = cIdx;
        else if (norm.includes('onboardingstatus')) colMap.onboardingStatus = cIdx;
        else if (norm.includes('batterystatus')) colMap.batteryStatus = cIdx;
        else if (norm.includes('driverstatus')) colMap.driverStatus = cIdx;
        else if (norm.includes('walletbalance') || norm === 'balance') colMap.walletBalance = cIdx;
        else if (norm.includes('assignedbattery1') || norm === 'battery1') colMap.assignedBattery1 = cIdx;
        else if (norm.includes('assignedbattery2') || norm === 'battery2') colMap.assignedBattery2 = cIdx;
        else if (norm.includes('totalpenalty')) colMap.totalPenalty = cIdx;
        else if (norm.includes('pendingpenalty')) colMap.pendingPenalty = cIdx;
        else if (norm.includes('paidpenalty')) colMap.paidPenalty = cIdx;
      });
      break;
    }
  }

  const getCol = (row: any[], key: string, defaultIdx: number): string => {
    if (colMap[key] !== undefined && colMap[key] >= 0 && colMap[key] < row.length) {
      const val = row[colMap[key]];
      return val != null ? String(val).trim() : '';
    }
    const defVal = defaultIdx >= 0 && defaultIdx < row.length ? row[defaultIdx] : undefined;
    return defVal != null ? String(defVal).trim() : '';
  };

  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;

  for (let r = startRow; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length === 0) continue;

    const rawName = getCol(row, 'name', 0);
    const rawDriverId = getCol(row, 'driverId', 1);

    if (rawName === "Name" || rawDriverId === "Driver ID") continue;
    const cleanedDriverId = cleanDriverId(rawDriverId);
    if (!cleanedDriverId && !rawName) continue;

    const lastSwapMs = parseDateToMs(getCol(row, 'lastSwapDate', 20));
    const onboardedMs = parseDateToMs(getCol(row, 'onboardingDate', 16)) || parseDateToMs(row[15]);

    const statusVal = getCol(row, 'batteryStatus', 23).toLowerCase();
    const isExplicitlyAssigned = statusVal.includes("assigned") && !statusVal.includes("not") && !statusVal.includes("unassigned");
    const rawB1 = getCol(row, 'assignedBattery1', 26);
    const rawB2 = getCol(row, 'assignedBattery2', 27);
    const hasBattery1 = Boolean(rawB1 && rawB1 !== '-' && rawB1.toLowerCase() !== 'n/a' && rawB1.toLowerCase() !== 'none' && rawB1.toLowerCase() !== 'null');
    const hasBattery2 = Boolean(rawB2 && rawB2 !== '-' && rawB2.toLowerCase() !== 'n/a' && rawB2.toLowerCase() !== 'none' && rawB2.toLowerCase() !== 'null');
    const isAssigned = isExplicitlyAssigned || hasBattery1 || hasBattery2;

    const driverObj: KazamDriver = {
      driver_id: cleanedDriverId || `D_${Math.floor(Math.random()*100000)}`,
      name: rawName || "Unknown",
      phone: getCol(row, 'phone', 2),
      alt_phone: getCol(row, 'altPhone', 3),
      email: getCol(row, 'email', 4),
      city: getCol(row, 'city', 6),
      onboardingStatus: getCol(row, 'onboardingStatus', 22) || "Complete",
      is_active: getCol(row, 'driverStatus', 24) ? getCol(row, 'driverStatus', 24).toLowerCase().includes("active") : true,
      assigned: isAssigned,
      total_swaps: parseInt(getCol(row, 'totalSwaps', 19)) || 0,
      wallet_balance: parseFloat(getCol(row, 'walletBalance', 25)) || 0,
      onboarded_on: onboardedMs,
      vehicle_info: {
        vehicle_number: getCol(row, 'vehicleNumber', 9) || null,
        chassis_number: getCol(row, 'chassisNumber', 10) || null
      },
      latest_swap: {
        vehicle_number: getCol(row, 'vehicleNumber', 9) || null,
        last_swap_date: lastSwapMs
      },
      onboarding_station: {
        id: getCol(row, 'onboardingStationId', 17),
        name: getCol(row, 'onboardingStationName', 18)
      },
      planData: [{
        plan_name: row[12] != null ? String(row[12]).trim() : "",
        free_swaps: parseInt(row[13]) || 0,
        deposit_amount: parseFloat(row[14]) || 0
      }],
      penalty_info: {
        total_penalty_amount: parseFloat(getCol(row, 'totalPenalty', 28)) || 0,
        pending_penalty_amount: parseFloat(getCol(row, 'pendingPenalty', 29)) || 0,
        paid_penalty_amount: parseFloat(getCol(row, 'paidPenalty', 30)) || 0,
        paid_penalties: 0,
        pending_penalties: 0,
        total_penalties: 0
      }
    };

    (driverObj as any).assignedBattery1 = hasBattery1 ? rawB1 : "";
    (driverObj as any).assignedBattery2 = hasBattery2 ? rawB2 : "";

    result.push(driverObj);
  }
  return result;
};

const parsePastedBatteryReport = (grid: string[][]): KazamBattery[] => {
  const result: KazamBattery[] = [];
  if (!grid || grid.length === 0) return result;

  // Check if any of first 5 rows is a header row
  let headerRowIdx = -1;
  const colMap: Record<string, number> = {};

  for (let r = 0; r < Math.min(5, grid.length); r++) {
    const rowNorms = grid[r].map(normalizeHeaderStr);
    const hasBatteryId = rowNorms.some(n => n.includes('batteryid') || n === 'batid' || n === 'deviceid');
    const hasDriverId = rowNorms.some(n => n.includes('driverid') || n === 'payerid');
    if (hasBatteryId || (hasDriverId && rowNorms.some(n => n.includes('station')))) {
      headerRowIdx = r;
      grid[r].forEach((headerText, cIdx) => {
        const norm = normalizeHeaderStr(headerText);
        if (!norm) return;
        if (norm === 'batteryid' || norm === 'battery_id' || norm === 'batid') colMap.batteryId = cIdx;
        else if (norm === 'solution') colMap.solution = cIdx;
        else if (norm === 'make') colMap.make = cIdx;
        else if (norm === 'model') colMap.model = cIdx;
        else if (norm === 'status' || norm === 'batterystatus') colMap.status = cIdx;
        else if (norm === 'stationid' || norm === 'dealerid') colMap.stationId = cIdx;
        else if (norm === 'driverid' || norm === 'driver_id' || norm === 'payerid') colMap.driverId = cIdx;
        else if (norm === 'stationname' || norm === 'dealername') colMap.stationName = cIdx;
        else if (norm === 'drivername' || norm === 'driver') colMap.driverName = cIdx;
        else if (norm.includes('drivermobile') || norm.includes('driverphone') || norm.includes('mobilenumber')) colMap.driverMobile = cIdx;
        else if (norm.includes('lastswap') || norm === 'lastswapped' || norm.includes('swapdate') || norm.includes('swappedon')) colMap.lastSwap = cIdx;
        else if (norm.includes('totalswaps') || norm === 'total_swaps') colMap.totalSwaps = cIdx;
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
      return val != null ? String(val).trim() : '';
    }
    const defVal = defaultIdx >= 0 && defaultIdx < row.length ? row[defaultIdx] : undefined;
    return defVal != null ? String(defVal).trim() : '';
  };

  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;

  for (let r = startRow; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length === 0) continue;

    const batId = getCol(row, 'batteryId', 0);
    if (batId === "Battery ID" || !batId) continue;

    const statusStr = getCol(row, 'status', 4).toLowerCase();
    let statusCode = 0;
    if (statusStr.includes("assigned")) statusCode = 2;
    else if (statusStr.includes("charging")) statusCode = 4;
    else if (statusStr.includes("error")) statusCode = 3;

    const rawStationId = getCol(row, 'stationId', 5);
    const stationId = rawStationId === 'N/A' ? '' : rawStationId;

    const rawDriverId = getCol(row, 'driverId', 6);
    const driverId = cleanDriverId(rawDriverId);

    const rawStationName = getCol(row, 'stationName', 7);
    const stationName = rawStationName === 'N/A' ? '' : rawStationName;

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

const ExcelGrid: React.FC<{
  headers: string[];
  data: string[][];
  onChange: (newData: string[][]) => void;
  onPasteEvent: (e: React.ClipboardEvent, r: number, c: number) => void;
}> = ({ headers, data, onChange, onPasteEvent }) => {
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const safePage = Math.min(page, totalPages);
  
  const startIndex = (safePage - 1) * pageSize;
  const visibleData = data.slice(startIndex, startIndex + pageSize);

  const handleCellChange = (
    displayRowIdx: number,
    colIndex: number,
    value: string,
  ) => {
    const actualRowIdx = startIndex + displayRowIdx;
    const newData = [...data];
    if (!newData[actualRowIdx]) newData[actualRowIdx] = Array(headers.length).fill("");
    newData[actualRowIdx] = [...newData[actualRowIdx]];
    newData[actualRowIdx][colIndex] = value;
    onChange(newData);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-700 rounded-xl max-h-[450px]">
        <table className="w-full text-left text-xs border-collapse bg-white dark:bg-zinc-900 min-w-[1200px]">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-950 sticky top-0 z-10 shadow-sm">
              <th className="w-10 p-2 border-r border-b border-zinc-200 dark:border-zinc-800 text-center text-zinc-400 font-mono">
                #
              </th>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="p-3 border-r border-b border-zinc-200 dark:border-zinc-800 font-bold uppercase text-zinc-500 dark:text-zinc-400 whitespace-nowrap text-[11px]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleData.map((row, displayIdx) => {
              const actualRowIdx = startIndex + displayIdx;
              return (
                <tr
                  key={actualRowIdx}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                >
                  <td className="p-2 border-r border-b border-zinc-200 dark:border-zinc-800 text-center bg-zinc-50 dark:bg-zinc-950 text-zinc-400 font-mono">
                    {actualRowIdx + 1}
                  </td>
                  {Array.from({ length: headers.length }).map((_, cIdx) => (
                    <td
                      key={cIdx}
                      className="p-0 border-r border-b border-zinc-200 dark:border-zinc-800 min-w-[140px]"
                    >
                      <input
                        value={row[cIdx] || ""}
                        onChange={(e) =>
                          handleCellChange(displayIdx, cIdx, e.target.value)
                        }
                        onPaste={(e) => onPasteEvent(e, actualRowIdx, cIdx)}
                        className="w-full p-2 bg-transparent outline-none font-mono text-xs focus:bg-indigo-50/50 dark:focus:bg-indigo-950/30 focus:ring-1 focus:ring-indigo-500 transition-all text-zinc-800 dark:text-zinc-200"
                        placeholder="--"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-2 py-1 text-xs text-zinc-500">
        <div>
          Showing {startIndex + 1} -{" "}
          {Math.min(startIndex + pageSize, data.length)} of {data.length} rows
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-2.5 py-1 border border-zinc-200 dark:border-zinc-700 rounded-lg disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors font-bold"
          >
            Prev
          </button>
          <span className="font-bold text-zinc-700 dark:text-zinc-300">
            {safePage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-2.5 py-1 border border-zinc-200 dark:border-zinc-700 rounded-lg disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors font-bold"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

const AlertsPage: React.FC<AlertsPageProps> = ({ db, isDarkMode, onBatterySelect, role }) => {
  const { showAlert, showConfirm } = usePopup();
  const { tab: urlTab } = useParams();
  const navigate = useNavigate();
  
  const [isCopyingImage, setIsCopyingImage] = useState(false);
  const [isCopyingText, setIsCopyingText] = useState(false);
  const [copiedImageSuccess, setCopiedImageSuccess] = useState(false);
  const [copiedTextSuccess, setCopiedTextSuccess] = useState(false);
  const [showDriverSelectionModal, setShowDriverSelectionModal] = useState(false);
  const [selectedDriverIdsForExport, setSelectedDriverIdsForExport] = useState<string[]>([]);
  const [pendingExportAction, setPendingExportAction] = useState<'image' | 'text' | null>(null);
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const exportRef = React.useRef<HTMLDivElement>(null);
  
  const viewMode = useMemo(() => (urlTab || 'swap_anomalies') as 'ingestion' | 'swap_anomalies' | 'stagnant', [urlTab]);
  const setViewMode = (newMode: string) => navigate(`/alerts/${newMode}`);

  const [ingestionType, setIngestionType] = useState<'battery' | 'driver'>('battery');

  const { getAllDrivers, getAllBatteries, getAllDealers, loading: batteryLoading } = useBatteryData();
  
  // System Issues State
  const [issues, setIssues] = useState<BatteryIssue[]>(cachedIssues || []);
  const [loading, setLoading] = useState(false);
  const [fetchTime, setFetchTime] = useState<number>(cachedFetchTime || Date.now());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [issueTypeFilter, setIssueTypeFilter] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Swap Anomalies State
  const [drivers, setDrivers] = useState<KazamDriver[]>(cachedDrivers || []);
  const [driversLoading, setDriversLoading] = useState(false);
  const [stagnantDaysThreshold, setStagnantDaysThreshold] = useState(3);
  const [stagnantStockDaysThreshold, setStagnantStockDaysThreshold] = useState(2);
  const [assignedBatteries, setAssignedBatteries] = useState<KazamBattery[]>(cachedAssignedBatteries || []);
  const [assignedBatteriesLoading, setAssignedBatteriesLoading] = useState(false);

  // Station Grouping State
  const [stations, setStations] = useState<any[]>([]);
  const [stationGroups, setStationGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('all');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedStationsForGroup, setSelectedStationsForGroup] = useState<string[]>([]);

  // Stagnant Batteries State
  const [batteries, setBatteries] = useState<KazamBattery[]>(cachedStagnantBatteries || []);
  const [batteriesLoading, setBatteriesLoading] = useState(false);
  const [stagnantFilter, setStagnantFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [stagnantStationFilter, setStagnantStationFilter] = useState('assigned_only'); // Changed default to show assigned batteries
  const [stagnantStatusFilter, setStagnantStatusFilter] = useState<string[]>([]);

  // Report Ingestion Sub-views & Grid State
  const [anomaliesSubView, setAnomaliesSubView] = useState<'alerts' | 'driver_report' | 'battery_report'>('alerts');
  const [stagnantSubView, setStagnantSubView] = useState<'stagnant' | 'battery_report'>('stagnant');

  const [driverGridData, setDriverGridData] = useState<string[][]>(() => {
    try {
      const cached = localStorage.getItem(DRIVER_REPORT_GRID_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (parsed[0]?.[0] === "RAJENDRA PRASAD MEHTA") {
            localStorage.removeItem(DRIVER_REPORT_GRID_CACHE_KEY);
            return INITIAL_DRIVER_GRID_SEED;
          }
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to load cached driver grid", e);
    }
    return INITIAL_DRIVER_GRID_SEED;
  });

  const [batteryGridData, setBatteryGridData] = useState<string[][]>(() => {
    try {
      const cached = localStorage.getItem(BATTERY_REPORT_GRID_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (parsed[0]?.[0] === "BN260700003") {
            localStorage.removeItem(BATTERY_REPORT_GRID_CACHE_KEY);
            return INITIAL_BATTERY_GRID_SEED;
          }
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to load cached battery grid", e);
    }
    return INITIAL_BATTERY_GRID_SEED;
  });

  const [showDriverPasteModal, setShowDriverPasteModal] = useState(false);
  const [showBatteryPasteModal, setShowBatteryPasteModal] = useState(false);
  const [driverPasteText, setDriverPasteText] = useState('');
  const [batteryPasteText, setBatteryPasteText] = useState('');

  // Initial load effect for parsed report grids
  useEffect(() => {
    try {
      const parsedDrivers = parsePastedDriverReport(driverGridData);
      if (parsedDrivers.length > 0) {
        setDrivers(parsedDrivers);
        cachedDrivers = parsedDrivers;
      }

      const parsedBatteries = parsePastedBatteryReport(batteryGridData);
      if (parsedBatteries.length > 0) {
        setAssignedBatteries(parsedBatteries);
        cachedAssignedBatteries = parsedBatteries;
        setBatteries(parsedBatteries);
        cachedStagnantBatteries = parsedBatteries;
      }
    } catch (err) {
      console.error("Error initializing report data", err);
    }
  }, [driverGridData, batteryGridData]);

  const handleDriverGridChange = (newData: string[][]) => {
    setDriverGridData(newData);
    const parsed = parsePastedDriverReport(newData);
    setDrivers(parsed);
    cachedDrivers = parsed;
    try {
      localStorage.setItem(DRIVER_REPORT_GRID_CACHE_KEY, JSON.stringify(newData));
    } catch (e) {
      console.warn("Failed to cache driver grid", e);
    }
  };

  const handleDriverPasteEvent = (e: React.ClipboardEvent, rIdx: number, cIdx: number) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    if (!text) return;
    const newData = parsePasteData(text, driverGridData, rIdx, cIdx, 31, DRIVER_REPORT_HEADERS);
    handleDriverGridChange(newData);
  };

  const handleManualDriverPasteSubmit = () => {
    if (!driverPasteText.trim()) return;
    const newData = parsePasteData(driverPasteText, driverGridData, 0, 0, 31, DRIVER_REPORT_HEADERS);
    handleDriverGridChange(newData);
    setDriverPasteText("");
    setShowDriverPasteModal(false);
    showAlert(`Driver report processed successfully! ${drivers.length} drivers loaded.`, "success");
  };

  const handleDriverFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const reader = new FileReader();

    if (isExcel) {
      reader.onload = (evt) => {
        try {
          const buffer = evt.target?.result;
          if (!buffer) return;
          const workbook = XLSX.read(buffer, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, raw: false, defval: "" });

          if (!rawRows || rawRows.length === 0) return;

          let startRowIdx = 0;
          let colMapping: number[] | null = null;
          if (rawRows.length > 0 && Array.isArray(rawRows[0])) {
            const firstRowNorms = rawRows[0].map(c => normalizeHeaderStr(c));
            if (firstRowNorms.some(h => h.includes('driverid') || h.includes('payerid') || (h.includes('name') && firstRowNorms.some(x => x.includes('phone'))))) {
              startRowIdx = 1;
              colMapping = mapHeadersToTargetIndices(rawRows[0].map(String), DRIVER_REPORT_HEADERS);
            }
          }

          const matrix: string[][] = Array.from({ length: Math.max(15, rawRows.length - startRowIdx) }, () => Array(31).fill(""));
          let targetRow = 0;
          for (let r = startRowIdx; r < rawRows.length; r++) {
            const rowArr = rawRows[r];
            if (!Array.isArray(rowArr) || rowArr.every(c => c == null || String(c).trim() === "")) continue;

            while (matrix.length <= targetRow) {
              matrix.push(Array(31).fill(""));
            }
            matrix[targetRow] = Array(31).fill("");

            if (colMapping) {
              for (let c = 0; c < rowArr.length; c++) {
                const targetCol = colMapping[c];
                if (targetCol >= 0 && targetCol < 31) {
                  const val = rowArr[c];
                  matrix[targetRow][targetCol] = val != null ? String(val).trim() : "";
                }
              }
            } else {
              for (let c = 0; c < 31; c++) {
                const val = rowArr[c];
                matrix[targetRow][c] = val != null ? String(val).trim() : "";
              }
            }
            targetRow++;
          }

          handleDriverGridChange(matrix);
          showAlert(`Successfully loaded drivers from Excel (${file.name})!`, "success");
        } catch (err) {
          console.error("Failed to parse Excel driver file", err);
          showAlert("Failed to parse Excel file. Please ensure it is a valid .xlsx or .xls file.", "error");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        if (text) {
          const newData = parsePasteData(text, Array.from({ length: 15 }, () => Array(31).fill("")), 0, 0, 31, DRIVER_REPORT_HEADERS);
          handleDriverGridChange(newData);
          showAlert(`Successfully loaded drivers from ${file.name}!`, "success");
        }
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  const handleClearDriverGrid = () => {
    const emptyGrid = Array.from({ length: 15 }, () => Array(31).fill(""));
    setDriverGridData(emptyGrid);
    setDrivers([]);
    cachedDrivers = null;
    localStorage.removeItem(DRIVER_REPORT_GRID_CACHE_KEY);
    showAlert("Driver report data cleared from local storage.", "success");
  };

  const handleProcessIngestionData = () => {
    if (ingestionType === 'battery') {
      const parsed = parsePastedBatteryReport(batteryGridData);
      setAssignedBatteries(parsed);
      cachedAssignedBatteries = parsed;
      setBatteries(parsed);
      cachedStagnantBatteries = parsed;
      try {
        localStorage.setItem(BATTERY_REPORT_GRID_CACHE_KEY, JSON.stringify(batteryGridData));
      } catch (e) {
        console.warn("Failed to cache battery grid", e);
      }
      showAlert(`Battery ingestion processed! ${parsed.length} items parsed.`, "success");
    } else {
      const parsed = parsePastedDriverReport(driverGridData);
      setDrivers(parsed);
      cachedDrivers = parsed;
      try {
        localStorage.setItem(DRIVER_REPORT_GRID_CACHE_KEY, JSON.stringify(driverGridData));
      } catch (e) {
        console.warn("Failed to cache driver grid", e);
      }
      showAlert(`Driver ingestion processed! ${parsed.length} items parsed.`, "success");
    }
  };

  const handleBatteryGridChange = (newData: string[][]) => {
    setBatteryGridData(newData);
    const parsed = parsePastedBatteryReport(newData);
    setAssignedBatteries(parsed);
    cachedAssignedBatteries = parsed;
    setBatteries(parsed);
    cachedStagnantBatteries = parsed;
    saveBatteryReport(parsed, newData);
  };

  const handleBatteryPasteEvent = (e: React.ClipboardEvent, rIdx: number, cIdx: number) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    if (!text) return;
    const newData = parsePasteData(text, batteryGridData, rIdx, cIdx, 21, BATTERY_REPORT_HEADERS);
    handleBatteryGridChange(newData);
  };

  const handleManualBatteryPasteSubmit = () => {
    if (!batteryPasteText.trim()) return;
    const newData = parsePasteData(batteryPasteText, batteryGridData, 0, 0, 21, BATTERY_REPORT_HEADERS);
    handleBatteryGridChange(newData);
    setBatteryPasteText("");
    setShowBatteryPasteModal(false);
    showAlert(`Battery report processed successfully! ${batteries.length} batteries loaded.`, "success");
  };

  const handleBatteryFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const reader = new FileReader();

    if (isExcel) {
      reader.onload = (evt) => {
        try {
          const buffer = evt.target?.result;
          if (!buffer) return;
          const workbook = XLSX.read(buffer, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, raw: false, defval: "" });

          if (!rawRows || rawRows.length === 0) return;

          let startRowIdx = 0;
          let colMapping: number[] | null = null;
          if (rawRows.length > 0 && Array.isArray(rawRows[0])) {
            const firstRowNorms = rawRows[0].map(c => normalizeHeaderStr(c));
            if (firstRowNorms.some(h => h.includes('batteryid') || h.includes('batid') || h.includes('deviceid') || h.includes('solution') || h.includes('make'))) {
              startRowIdx = 1;
              colMapping = mapHeadersToTargetIndices(rawRows[0].map(String), BATTERY_REPORT_HEADERS);
            }
          }

          const matrix: string[][] = Array.from({ length: Math.max(15, rawRows.length - startRowIdx) }, () => Array(21).fill(""));
          let targetRow = 0;
          for (let r = startRowIdx; r < rawRows.length; r++) {
            const rowArr = rawRows[r];
            if (!Array.isArray(rowArr) || rowArr.every(c => c == null || String(c).trim() === "")) continue;

            while (matrix.length <= targetRow) {
              matrix.push(Array(21).fill(""));
            }
            matrix[targetRow] = Array(21).fill("");

            if (colMapping) {
              for (let c = 0; c < rowArr.length; c++) {
                const targetCol = colMapping[c];
                if (targetCol >= 0 && targetCol < 21) {
                  const val = rowArr[c];
                  matrix[targetRow][targetCol] = val != null ? String(val).trim() : "";
                }
              }
            } else {
              for (let c = 0; c < 21; c++) {
                const val = rowArr[c];
                matrix[targetRow][c] = val != null ? String(val).trim() : "";
              }
            }
            targetRow++;
          }

          handleBatteryGridChange(matrix);
          showAlert(`Successfully loaded batteries from Excel (${file.name})!`, "success");
        } catch (err) {
          console.error("Failed to parse Excel battery file", err);
          showAlert("Failed to parse Excel file. Please ensure it is a valid .xlsx or .xls file.", "error");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        if (text) {
          const newData = parsePasteData(text, Array.from({ length: 15 }, () => Array(21).fill("")), 0, 0, 21, BATTERY_REPORT_HEADERS);
          handleBatteryGridChange(newData);
          showAlert(`Successfully loaded batteries from ${file.name}!`, "success");
        }
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  const handleClearBatteryGrid = () => {
    const emptyGrid = Array.from({ length: 15 }, () => Array(21).fill(""));
    setBatteryGridData(emptyGrid);
    setAssignedBatteries([]);
    cachedAssignedBatteries = null;
    setBatteries([]);
    cachedStagnantBatteries = null;
    clearStoredBatteries();
    showAlert("Battery report data cleared from local storage.", "success");
  };

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showSettings, setShowSettings] = useState(false);
  const [showBulkResolve, setShowBulkResolve] = useState(false);
  const [bulkRows, setBulkRows] = useState<{
    batteryId: string;
    actionTaken: string;
    date: string;
    issues: BatteryIssue[];
    isChecking: boolean;
  }[]>([{ batteryId: '', actionTaken: '', date: format(new Date(), 'yyyy-MM-dd'), issues: [], isChecking: false }]);
  const [isBulkResolving, setIsBulkResolving] = useState(false);
  const [resolveConfirmation, setResolveConfirmation] = useState<{ id: string; batteryId: string } | null>(null);

  function format(date: Date, fmt: string) {
    // Simple formatter for default date
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const fetchAnomaliesData = useCallback(async (forceApi = false) => {
    const hasUploadedDrivers = isGridPopulated(driverGridData);
    const hasUploadedBatteries = isGridPopulated(batteryGridData);

    if (!forceApi && hasUploadedDrivers && hasUploadedBatteries) {
      const parsedDrivers = parsePastedDriverReport(driverGridData);
      const parsedBatteries = parsePastedBatteryReport(batteryGridData);
      setDrivers(parsedDrivers);
      cachedDrivers = parsedDrivers;
      setAssignedBatteries(parsedBatteries);
      cachedAssignedBatteries = parsedBatteries;
      return;
    }

    setDriversLoading(true);
    setAssignedBatteriesLoading(true);
    try {
      const [driversData, batteriesData] = await Promise.all([
        hasUploadedDrivers && !forceApi ? parsePastedDriverReport(driverGridData) : getAllDrivers(),
        hasUploadedBatteries && !forceApi ? parsePastedBatteryReport(batteryGridData) : getAllBatteries('Battery_Dost', { }, false)
      ]);
      setDrivers(driversData);
      cachedDrivers = driversData;
      setAssignedBatteries(batteriesData);
      cachedAssignedBatteries = batteriesData;
      const now = Date.now();
      setFetchTime(now);
      cachedFetchTime = now;
    } catch (err) {
      console.error("Failed to fetch anomalies data:", err);
    } finally {
      setDriversLoading(false);
      setAssignedBatteriesLoading(false);
    }
  }, [getAllDrivers, getAllBatteries, driverGridData, batteryGridData]);

  const fetchStagnantData = useCallback(async (forceApi = false) => {
    const hasUploadedBatteries = isGridPopulated(batteryGridData);
    if (!forceApi && hasUploadedBatteries) {
      const parsed = parsePastedBatteryReport(batteryGridData);
      setBatteries(parsed);
      cachedStagnantBatteries = parsed;
      return;
    }

    setBatteriesLoading(true);
    try {
      const data = await getAllBatteries('Battery_Dost', { status: { '$ne': 2 } }, true);
      setBatteries(data);
      cachedStagnantBatteries = data;
      const now = Date.now();
      setFetchTime(now);
      cachedFetchTime = now;
    } catch (err) {
      console.error("Failed to fetch stagnant data:", err);
    } finally {
      setBatteriesLoading(false);
    }
  }, [getAllBatteries, batteryGridData]);

  const handleRefreshAll = useCallback(() => {
    if (viewMode === 'swap_anomalies') fetchAnomaliesData(true);
    else if (viewMode === 'stagnant') fetchStagnantData(true);
  }, [viewMode, fetchAnomaliesData, fetchStagnantData]);

  useEffect(() => {
    const hasUploadedDrivers = isGridPopulated(driverGridData);
    const hasUploadedBatteries = isGridPopulated(batteryGridData);

    if (viewMode === 'swap_anomalies') {
      if ((!hasUploadedDrivers || !hasUploadedBatteries) && (!cachedDrivers || !cachedAssignedBatteries)) {
        fetchAnomaliesData();
      }
    } else if (viewMode === 'stagnant') {
      if (!hasUploadedBatteries && !cachedStagnantBatteries) {
        fetchStagnantData();
      }
    }
  }, [viewMode, fetchAnomaliesData, fetchStagnantData, driverGridData, batteryGridData]);

  // Fetch stations for grouping
  useEffect(() => {
    const fetchStations = async () => {
      try {
        const data = await getAllDealers();
        setStations(data);
      } catch (err) {
        console.error("Error fetching stations:", err);
      }
    };
    fetchStations();
  }, [getAllDealers]);

  // Subscribe to station groups
  useEffect(() => {
    const q = query(
      collection(db, "station_groups"), 
      where("type", "==", "inventory_report")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const groups = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setStationGroups(groups);
    }, (err) => {
      console.error("Error subscribing to station groups:", err);
    });
    return () => unsub();
  }, [db]);

  const createGroup = async () => {
    if (!newGroupName.trim() || selectedStationsForGroup.length === 0) {
      await showAlert("Please enter a group name and select stations", "error");
      return;
    }
    try {
      const selectedStations = stations.filter(s => selectedStationsForGroup.includes(s.id));
      await addDoc(collection(db, "station_groups"), {
        name: newGroupName,
        stationIds: selectedStationsForGroup,
        stationNames: selectedStations.map(s => s.name),
        type: 'inventory_report',
        createdAt: new Date().toISOString()
      });
      setNewGroupName('');
      setSelectedStationsForGroup([]);
      await showAlert("Group created successfully!", "success");
    } catch (err) {
      console.error(err);
      await showAlert("Failed to create group", "error");
    }
  };

  const deleteGroup = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await showConfirm("Delete this group?");
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, "station_groups", id));
      if (selectedGroupId === id) setSelectedGroupId('all');
    } catch (err) {
      console.error(err);
      await showAlert("Failed to delete group", "error");
    }
  };

  // --- Handlers ---
  const handleVerify = async (e: React.MouseEvent, id: string) => { 
    e.stopPropagation(); 
    setActionLoading(id); 
    try { 
      await updateDoc(doc(db, "battery_issues", id), { 
        status: 'Open', // Keeping it Open but maybe marking as verified internally if needed
        verifiedAt: new Date().toISOString() 
      }); 
    } catch (err) { 
      await showAlert("Failed to verify issue.", "error"); 
    } finally { 
      setActionLoading(null); 
    } 
  };
  const handleBulkResolve = async () => {
    const rowsWithIssues = bulkRows.filter(r => r.issues.length > 0);
    
    if (rowsWithIssues.length === 0) {
      await showAlert("No open issues found for the provided Battery IDs.", "error");
      return;
    }

    setIsBulkResolving(true);
    try {
      const batch = writeBatch(db);
      let totalResolved = 0;

      for (const row of rowsWithIssues) {
        for (const issue of row.issues) {
          const issueRef = doc(db, "battery_issues", issue.id);
          batch.update(issueRef, {
            status: 'Closed',
            resolvedAt: new Date().toISOString(),
            actionTaken: row.actionTaken || '',
            resolutionDate: row.date || format(new Date(), 'yyyy-MM-dd')
          });
          totalResolved++;
        }
      }

      await batch.commit();
      await showAlert(`Successfully closed ${totalResolved} issues across ${rowsWithIssues.length} batteries.`, "success");
      setShowBulkResolve(false);
      setBulkRows([{ batteryId: '', actionTaken: '', date: format(new Date(), 'yyyy-MM-dd'), issues: [], isChecking: false }]);
    } catch (err) {
      console.error("Bulk resolve failed:", err);
      await showAlert("Failed to close issues in bulk.", "error");
    } finally {
      setIsBulkResolving(false);
    }
  };

  const fetchIssuesForBattery = async (batteryId: string): Promise<BatteryIssue[]> => {
    if (!batteryId.trim()) return [];
    try {
      const q = query(
        collection(db, "battery_issues"),
        where("batteryId", "==", batteryId.trim()),
        where("status", "in", ["Open", "Pending"])
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as BatteryIssue));
    } catch (err) {
      console.error(`Error fetching issues for ${batteryId}:`, err);
      return [];
    }
  };

  const addBulkRow = () => {
    setBulkRows([...bulkRows, { batteryId: '', actionTaken: '', date: format(new Date(), 'yyyy-MM-dd'), issues: [], isChecking: false }]);
  };

  const removeBulkRow = (index: number) => {
    if (bulkRows.length === 1) return;
    setBulkRows(bulkRows.filter((_, i) => i !== index));
  };

  const updateBulkRow = async (index: number, field: string, value: string) => {
    if (field === 'batteryId' && (value.includes('\n') || value.includes(',') || (value.trim().includes(' ') && value.trim().split(/\s+/).length > 1))) {
      const ids = value.split(/[\n,\s]+/).map(id => id.trim()).filter(id => id !== '');
      if (ids.length > 1) {
        setIsBulkResolving(true); // Use this as a global loading state for the modal
        
        const newRows = [...bulkRows];
        const currentRow = newRows[index];
        
        // Process all IDs
        const processedRows = await Promise.all(ids.map(async (id) => {
          const issues = await fetchIssuesForBattery(id);
          return {
            batteryId: id,
            actionTaken: currentRow.actionTaken || '',
            date: currentRow.date || format(new Date(), 'yyyy-MM-dd'),
            issues,
            isChecking: false
          };
        }));

        // Replace current row and insert others
        const updatedRows = [
          ...newRows.slice(0, index),
          ...processedRows,
          ...newRows.slice(index + 1)
        ];
        
        setBulkRows(updatedRows);
        setIsBulkResolving(false);
        return;
      }
    }
    
    const newRows = [...bulkRows];
    (newRows[index] as any)[field] = value;
    
    // If batteryId changed, fetch issues for this single row
    if (field === 'batteryId') {
      newRows[index].isChecking = true;
      setBulkRows([...newRows]);
      
      const issues = await fetchIssuesForBattery(value);
      
      // Update state again with results
      setBulkRows(prev => {
        const updated = [...prev];
        if (updated[index]) {
          updated[index].issues = issues;
          updated[index].isChecking = false;
        }
        return updated;
      });
    } else {
      setBulkRows(newRows);
    }
  };
  const handleReject = async (e: React.MouseEvent, id: string) => { 
    e.stopPropagation(); 
    const confirmed = await showConfirm("Reject this issue as invalid?");
    if (!confirmed) return; 
    setActionLoading(id); 
    try { 
      await deleteDoc(doc(db, "battery_issues", id)); 
    } catch (err) { 
      await showAlert("Failed to reject issue.", "error"); 
    } finally { 
      setActionLoading(null); 
    } 
  };
  const handleResolve = (e: React.MouseEvent, issue: BatteryIssue) => {
    e.stopPropagation();
    setResolveConfirmation({ id: issue.id, batteryId: issue.batteryId });
  };

  const confirmResolve = async () => {
    if (!resolveConfirmation) return;
    const { id } = resolveConfirmation;
    setActionLoading(id);
    setResolveConfirmation(null);
    try {
      await updateDoc(doc(db, "battery_issues", id), {
        status: 'Closed',
        resolvedAt: new Date().toISOString()
      });
    } catch (err) {
      await showAlert("Failed to close issue.", "error");
    } finally {
      setActionLoading(null);
    }
  };
  
  const getStatusColorClass = (status: string) => {
    const s = status.toUpperCase();
    switch (s) {
      case "ERROR":
        return "bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/40 dark:text-red-400 dark:border-red-800";
      case "CHARGING":
        return "bg-green-100 text-green-700 border border-green-200 animate-pulse dark:bg-green-900/30 dark:text-green-400 dark:border-green-800";
      case "LOW SOC":
        return "bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800";
      case "ASSIGNED":
        return "bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800";
      case "AVAILABLE":
        return "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800";
      default:
        return "bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700";
    }
  };

  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedBatteryForHistory, setSelectedBatteryForHistory] = useState<string | null>(null);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortData = <T extends any>(data: T[]): T[] => {
    if (!sortConfig) return data;
    return [...data].sort((a, b) => {
      let aVal = (a as any)[sortConfig.key];
      let bVal = (b as any)[sortConfig.key];
      
      // Handle nested keys like 'latest_swap.last_swap_date'
      if (sortConfig.key.includes('.')) {
        const keys = sortConfig.key.split('.');
        aVal = a;
        bVal = b;
        for (const k of keys) {
          aVal = aVal?.[k];
          bVal = bVal?.[k];
        }
      }

      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const handleShare = async (phone: string, name: string, days: number) => {
    const msg = `Hello ${name}, we noticed your last battery swap was ${days} days ago. Is everything okay with the vehicle? Please visit the nearest station.`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Battery Swap Alert',
          text: msg,
        });
      } catch (err) {
        console.error("Error sharing:", err);
      }
    } else {
      window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
    }
  };

  const handleExportSwapAlerts = () => {
    if (!swapAlertDrivers.length) return;
    
    const headers = ["NAME", "DRIVER ID", "PHONE", "ASSIGNED BATTERY 1", "ASSIGNED BATTERY 2", "LAST SWAP DATE", "IDLE DAYS", "TOTAL SWAPS"];
    const rows = swapAlertDrivers.map(d => {
      const rawDate = d.latest_swap?.last_swap_date || 0;
      const lastSwapMs = rawDate > 100000000000 ? rawDate : rawDate * 1000;
      const lastSwap = rawDate ? new Date(lastSwapMs) : null;
      const dateStr = lastSwap ? formatDateTime24(lastSwap) : '--';
      const daysSince = lastSwap ? Math.floor((fetchTime - lastSwap.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      const b1 = d.batteries?.[0]?.id || (d as any).assignedBattery1 || '--';
      const b2 = d.batteries?.[1]?.id || (d as any).assignedBattery2 || '--';
      
      return [
        `"${(d.name || '').toUpperCase()}"`,
        `"${(d.driver_id || '').toUpperCase()}"`,
        `"${(d.phone || '').toUpperCase()}"`,
        `"${b1}"`,
        `"${b2}"`,
        `"${dateStr.toUpperCase()}"`,
        `"${daysSince}"`,
        `"${d.total_swaps ?? 0}"`
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `SWAP_ALERTS_${formatDate24(new Date())}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyListImageTrigger = () => {
    if (swapAlertDrivers.length === 0) return;
    setSelectedDriverIdsForExport(swapAlertDrivers.map(d => d.driver_id));
    setPendingExportAction('image');
    setShowDriverSelectionModal(true);
  };

  const handleCopyListTextTrigger = () => {
    if (swapAlertDrivers.length === 0) return;
    setSelectedDriverIdsForExport(swapAlertDrivers.map(d => d.driver_id));
    setPendingExportAction('text');
    setShowDriverSelectionModal(true);
  };

  const performCopyListImage = async () => {
    if (!exportRef.current || swapAlertDrivers.length === 0) return;
    setIsCopyingImage(true);
    try {
      // Small timeout to allow the virtual/off-screen table to re-render with the selected filters exactly
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const height = exportRef.current.scrollHeight || 480;
      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: 2.0, // Crisp high-definition rendering (similar to native web resolution)
        width: 960, // Tightly bound width matching export container to completely eliminate empty right-side blank gaps
        height: height,
        style: {
          borderRadius: '0px',
          transform: 'none',
          left: '0',
          top: '0',
          position: 'relative'
        }
      });

      // Fetch base64 dataUrl as a PNG blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();

      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "image/png": blob
          })
        ]);
        setCopiedImageSuccess(true);
        setTimeout(() => setCopiedImageSuccess(false), 3000);
        await showAlert("📋 High-quality image report copied to clipboard successfully!", "success");
      } else {
        throw new Error("ClipboardItem API is not supported in this browser.");
      }
    } catch (err) {
      console.error("Error copy report:", err);
      await showAlert("Failed to copy image report to clipboard.", "error");
    } finally {
      setIsCopyingImage(false);
    }
  };

  const performCopyListText = async () => {
    const exportedDrivers = swapAlertDrivers.filter(d => selectedDriverIdsForExport.includes(d.driver_id));
    if (exportedDrivers.length === 0) return;
    setIsCopyingText(true);
    try {
      const groupName = selectedGroupId !== 'all' ? stationGroups.find(g => g.id === selectedGroupId)?.name || 'Filtered' : 'All Cities';
      let waText = `*🚨 ACTIVE SWAP ALERTS 🚨*\n\n`;
      waText += `📍 *City:* ${groupName}\n`;
      waText += `📅 *Date:* ${formatDateTime24(new Date())}\n`;
      waText += `⚠️ *High-Risk Drivers:* ${exportedDrivers.length}\n`;
      waText += `─────────────────────\n\n`;

      exportedDrivers.forEach((driver, idx) => {
        const rawDate = driver.latest_swap?.last_swap_date || 0;
        const lastSwapMs = rawDate > 100000000000 ? rawDate : rawDate * 1000;
        const lastSwap = rawDate ? new Date(lastSwapMs) : null;
        const daysSince = lastSwap ? Math.floor((fetchTime - lastSwap.getTime()) / (1000 * 60 * 60 * 24)) : 0;
        const b1 = driver.batteries?.[0]?.id || (driver as any).assignedBattery1 || '';
        const b2 = driver.batteries?.[1]?.id || (driver as any).assignedBattery2 || '';
        const assignedBats = [b1, b2].filter(Boolean).join(', ');

        waText += `👤 *${idx + 1}. ${driver.name || '--'}*\n`;
        waText += `🆔 *Driver ID:* ${driver.driver_id || '--'}\n`;
        waText += `📞 *Contact:* ${driver.phone || '--'}${driver.alt_phone ? ` (Alt: ${driver.alt_phone})` : ''}\n`;
        if (assignedBats) waText += `🔋 *Assigned Batteries:* ${assignedBats}\n`;
        if (lastSwap) waText += `🕒 *Last Swap:* ${formatDateTime24(lastSwap)}\n`;
        waText += `⏳ *Idle:* ${daysSince} days\n\n`;
      });

      waText += `─────────────────────`;

      await navigator.clipboard.writeText(waText);
      setCopiedTextSuccess(true);
      setTimeout(() => setCopiedTextSuccess(false), 3000);
      await showAlert("📋 Active Swap Alerts text copied to clipboard successfully!", "success");
    } catch (clipboardErr) {
      console.error("Clipboard write failed:", clipboardErr);
      await showAlert("Failed to copy text. Please try again.", "error");
    } finally {
      setIsCopyingText(false);
    }
  };

  const getPaginatedData = (data: any[]) =>
    data.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // --- Station Options for Stagnant Filter ---
  const stagnantStationOptions = useMemo(() => {
    const stations = Array.from(new Set(batteries.map(b => b.dealer_name).filter(Boolean)));
    return [
        { value: 'assigned_only', label: 'All Assigned Hubs' },
        { value: 'all', label: 'Show All (Incl. Unassigned)' },
        { value: 'unassigned', label: '🚫 Unassigned Only' },
        ...stations.map(s => ({ value: s, label: s }))
    ];
  }, [batteries]);

  // --- Filtering & Sorting ---
  
  // 1. System Issues
  const filteredIssues = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = issues.filter(issue => { 
      const normType = normalizeIssueType(issue.mainDescription || issue.issueType);
      const matchesSearch = issue.batteryId.toLowerCase().includes(q) || 
                           (issue.mainDescription || '').toLowerCase().includes(q) ||
                           (issue.subDescription || '').toLowerCase().includes(q) ||
                           normType.toLowerCase().includes(q);

      if (filterType === 'open' && issue.status !== 'Open' && issue.status !== 'Pending') return false; 
      if (filterType === 'closed' && issue.status !== 'Closed') return false; 
      
      if (issueTypeFilter.length > 0) {
        if (!issueTypeFilter.includes(normType)) return false;
      }
      
      return matchesSearch; 
    });
    return sortData(base);
  }, [issues, searchQuery, filterType, issueTypeFilter, sortConfig]);

  // 2. Swap Anomalies
  const swapAlertDrivers = useMemo(() => {
    if (!drivers.length) return [];
    const now = new Date();
    now.setHours(0,0,0,0);
    const thresholdMs = stagnantDaysThreshold * 24 * 60 * 60 * 1000;

    // Build lookup maps from assignedBatteries (Battery Report)
    const batteryReportByDriverId = new Map<string, KazamBattery[]>();
    const batteryReportByBatId = new Map<string, KazamBattery>();

    assignedBatteries.forEach(b => {
      if (b.id) {
        batteryReportByBatId.set(b.id.trim().toUpperCase(), b);
      }
      const bDriverId = cleanDriverId(b.driver_id);
      if (bDriverId) {
        const key = bDriverId.toLowerCase();
        const existing = batteryReportByDriverId.get(key) || [];
        existing.push(b);
        batteryReportByDriverId.set(key, existing);
      }
    });

    let base = drivers.filter(d => {
      let lastSwapRaw = d.latest_swap?.last_swap_date;
      if (!lastSwapRaw) {
        const dDriverId = cleanDriverId(d.driver_id);
        if (dDriverId) {
          const matchingBats = batteryReportByDriverId.get(dDriverId.toLowerCase()) || [];
          for (const b of matchingBats) {
            if (b.last_swap_on) {
              lastSwapRaw = b.last_swap_on;
              break;
            }
          }
        }
        if (!lastSwapRaw) {
          const rawB1 = (d as any).assignedBattery1?.trim()?.toUpperCase();
          const rawB2 = (d as any).assignedBattery2?.trim()?.toUpperCase();
          const b1 = rawB1 ? batteryReportByBatId.get(rawB1) : null;
          const b2 = rawB2 ? batteryReportByBatId.get(rawB2) : null;
          if (b1?.last_swap_on) lastSwapRaw = b1.last_swap_on;
          else if (b2?.last_swap_on) lastSwapRaw = b2.last_swap_on;
        }
      }
      if (!lastSwapRaw) return false;
      
      const lastSwapMs = lastSwapRaw > 100000000000 ? lastSwapRaw : lastSwapRaw * 1000;
      const lastSwapDate = new Date(lastSwapMs);
      lastSwapDate.setHours(0,0,0,0);

      const diff = now.getTime() - lastSwapDate.getTime();
      if (diff < thresholdMs) return false;

      if (searchQuery) {
         const q = searchQuery.trim().toLowerCase();
         return (d.name || '').toLowerCase().includes(q) || (d.driver_id || '').toLowerCase().includes(q) || (d.phone || '').includes(q);
      }
      return true;
    }).map(d => {
      const dDriverId = cleanDriverId(d.driver_id);
      const driverBatteries: (KazamBattery & { latestIssue?: any; isDriverIdVerified?: boolean })[] = [];
      const seenBatteryIds = new Set<string>();

      let isDriverIdVerified = false;
      let hasExcludedMismatchedBatteries = false;
      const mismatchDetails: string[] = [];

      // 1. Strict Driver ID matching from Battery Report (Both reports must match)
      if (dDriverId) {
        const matchingBats = batteryReportByDriverId.get(dDriverId.toLowerCase()) || [];
        matchingBats.forEach(b => {
          if (!b.id) return;
          const bIdUpper = b.id.trim().toUpperCase();
          if (!seenBatteryIds.has(bIdUpper)) {
            seenBatteryIds.add(bIdUpper);
            const batIssues = issues.filter(i => i.batteryId === b.id && i.status !== 'Closed')
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            driverBatteries.push({
              ...b,
              driver_id: d.driver_id,
              isDriverIdVerified: true,
              latestIssue: batIssues[0]
            } as any);
            isDriverIdVerified = true;
          }
        });
      }

      // 2. Also check Driver Report batteries (assignedBattery1, assignedBattery2)
      // and verify that the Battery Report's driver_id matches this driver
      const rawB1 = (d as any).assignedBattery1?.trim();
      const rawB2 = (d as any).assignedBattery2?.trim();

      const processAssignedId = (bId?: string) => {
        if (!bId || bId === '-' || bId.toLowerCase() === 'n/a' || bId.toLowerCase() === 'none' || bId.toLowerCase() === 'null') return;
        const upper = bId.toUpperCase();
        if (seenBatteryIds.has(upper)) return;

        const found = batteryReportByBatId.get(upper);
        if (found) {
          const batDriverId = cleanDriverId(found.driver_id);

          // STRICT CROSS-VERIFICATION: Does the Battery Report's driver_id match this driver?
          if (batDriverId && dDriverId && batDriverId.toLowerCase() !== dDriverId.toLowerCase()) {
            // MISMATCH: Battery Report states this battery belongs to a DIFFERENT driver ID.
            // DO NOT ATTACH THIS BATTERY TO THIS DRIVER! Exclude it to prevent showing wrong person's ID.
            hasExcludedMismatchedBatteries = true;
            mismatchDetails.push(`Battery ${upper} is registered to Driver ID '${batDriverId}' in Battery Report, not '${dDriverId}'`);
            return;
          }

          seenBatteryIds.add(upper);
          const batIssues = issues.filter(i => i.batteryId === found.id && i.status !== 'Closed')
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          
          const verified = Boolean(batDriverId && dDriverId && batDriverId.toLowerCase() === dDriverId.toLowerCase());
          if (verified) isDriverIdVerified = true;

          driverBatteries.push({
            ...found,
            driver_id: d.driver_id,
            isDriverIdVerified: verified,
            latestIssue: batIssues[0]
          } as any);
        } else {
          // Battery is in Driver Report only (unverified in Battery Report)
          seenBatteryIds.add(upper);
          driverBatteries.push({
            _id: bId,
            id: bId,
            make: 'Vecmocon',
            model: 'Vec_connected_bat',
            status: 2,
            dealer_id: '',
            driver_id: d.driver_id,
            dealer_name: '',
            soc: 0,
            soh: 100,
            voltage: 0,
            temperature: 0,
            network: false,
            odometer: 0,
            last_swap_on: d.latest_swap?.last_swap_date,
            last_updated_on: undefined,
            location: { coordinates: [0, 0] },
            isDriverIdVerified: false
          } as any);
        }
      };

      processAssignedId(rawB1);
      processAssignedId(rawB2);

      return {
        ...d,
        batteries: driverBatteries,
        isDriverIdVerified,
        hasExcludedMismatchedBatteries,
        mismatchDetails
      };
    }).filter(d => {
      // ONLY SHOW DRIVERS THAT HAVE BATTERIES ASSIGNED!
      // Exclude any drivers who do not have any batteries assigned
      return Boolean(d.batteries && d.batteries.length > 0);
    });

    // Filter by Selected Station Group
    if (selectedGroupId !== 'all') {
      const group = stationGroups.find(g => g.id === selectedGroupId);
      if (group) {
        const ids = group.stationIds || [];
        const names = group.stationNames || [];
        base = base.filter(d => {
          return d.batteries && d.batteries.some((b: any) => 
            ids.includes(b.dealer_id) || 
            (b.dealer_id && ids.includes(b.id)) ||
            names.includes(b.dealer_name)
          );
        });
      }
    }

    if (!sortConfig) {
      return base.sort((a, b) => {
        const rawA = a.latest_swap?.last_swap_date || 0;
        const rawB = b.latest_swap?.last_swap_date || 0;
        const timeA = rawA > 100000000000 ? rawA : rawA * 1000;
        const timeB = rawB > 100000000000 ? rawB : rawB * 1000;
        return timeA - timeB;
      });
    }
    return sortData(base);
  }, [drivers, assignedBatteries, searchQuery, sortConfig, stagnantDaysThreshold, selectedGroupId, stationGroups]);

  const getBatteryStatus = (bat: KazamBattery) => {
      if (bat.status === 3) return 'Error';
      const isCharging = bat.charge_state === 1 || (bat.mosfet && bat.mosfet.charging === 1);
      if (isCharging) return 'Charging';
      if (bat.soc < 20 || bat.status === 4) return 'Low SoC';
      if (!bat.dealer_id || bat.dealer_id.trim() === "") return 'Inactive';
      return 'Available';
  };

  // 3. Stagnant Stock
  const stagnantBatteries = useMemo(() => {
    if (!batteries.length) return [];
    const today = new Date(fetchTime);
    today.setHours(0,0,0,0); 

    const base = batteries.filter(bat => {
        // Must be unassigned from a driver
        if (bat.driver_id || bat.driverData) return false;

        // Station Filter Logic
        if (stagnantStationFilter === 'assigned_only') {
            if (!bat.dealer_id || bat.dealer_id.trim() === "") return false;
        } else if (stagnantStationFilter === 'unassigned') {
            if (bat.dealer_id && bat.dealer_id.trim() !== "") return false;
        } else if (stagnantStationFilter !== 'all') {
            // Specific station filter
            if (bat.dealer_name !== stagnantStationFilter) return false;
        }

        // Search Filter
        if (searchQuery) {
            const q = searchQuery.trim().toLowerCase();
            const matches = bat.id.toLowerCase().includes(q) || 
                            (bat.iot_id || '').toLowerCase().includes(q) ||
                            (bat.dealer_name || '').toLowerCase().includes(q);
            if (!matches) return false;
        }

        // Calculate Date Diff
        let swapTs = bat.batteryHistory?.timestamp || bat.last_swap_on || 0;
        const swapTimeMs = swapTs > 100000000000 ? swapTs : swapTs * 1000;
        const swapDate = new Date(swapTimeMs);
        swapDate.setHours(0,0,0,0);

        const diffTime = today.getTime() - swapDate.getTime();
        const diffDays = diffTime / (1000 * 3600 * 24);

        if (diffDays < stagnantStockDaysThreshold) return false;

        // Online/Offline Status for filter (not render)
        let updateTs = bat.last_updated_on;
        let updateMs = 0;
        if (typeof updateTs === 'string') updateMs = new Date(updateTs).getTime();
        else updateMs = updateTs > 100000000000 ? updateTs : updateTs * 1000;
        
        const isOnline = (fetchTime - updateMs) < 5 * 60 * 1000;

        if (stagnantFilter === 'online' && !isOnline) return false;
        if (stagnantFilter === 'offline' && isOnline) return false;

        // Status Filter
        if (stagnantStatusFilter.length > 0) {
            if (!stagnantStatusFilter.includes(getBatteryStatus(bat))) return false;
        }

        return true;
    }).map(bat => {
        // Enrich with latest issue
        const batIssues = issues.filter(i => i.batteryId === bat.id && i.status !== 'Closed')
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return { ...bat, latestIssue: batIssues[0] };
    });

    if (!sortConfig) {
      return base.sort((a, b) => {
        // Oldest swap date first (Ascending)
        const tsA = a.batteryHistory?.timestamp || a.last_swap_on || 0;
        const tsB = b.batteryHistory?.timestamp || b.last_swap_on || 0;
        return tsA - tsB; 
      });
    }
    return sortData(base);
  }, [batteries, searchQuery, stagnantFilter, stagnantStationFilter, stagnantStatusFilter, sortConfig, stagnantStockDaysThreshold]);

  useEffect(() => setCurrentPage(1), [searchQuery, filterType, viewMode, stagnantFilter, stagnantStationFilter, stagnantStatusFilter, stagnantDaysThreshold, stagnantStockDaysThreshold]);
  
  let currentDataList: any[] = [];
  if (viewMode === 'swap_anomalies') currentDataList = swapAlertDrivers;
  else if (viewMode === 'stagnant') currentDataList = stagnantBatteries;

  const totalPages = Math.ceil(currentDataList.length / itemsPerPage);
  const paginatedData = currentDataList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const formatTimestamp = (ts: string | number | undefined) => {
      if (!ts) return '--';
      return formatDateTime24(ts);
  };

  const renderPagination = (data: any[]) => (
    <PaginationFooter
      currentPage={currentPage}
      totalPages={Math.ceil(data.length / itemsPerPage)}
      itemsPerPage={itemsPerPage}
      onPageChange={setCurrentPage}
      onItemsPerPageChange={(val) => {
        setItemsPerPage(val);
        setCurrentPage(1);
      }}
      dataLength={data.length}
    />
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
         <div><h2 className="text-3xl font-bold font-heading text-zinc-900 dark:text-white mb-2">Alerts & Issues</h2><p className="text-zinc-500 dark:text-zinc-400 font-semibold">Monitor, verify, and resolve operational faults.</p></div>
         <div className="flex gap-2">
            <button 
              onClick={handleRefreshAll}
              disabled={loading || driversLoading || assignedBatteriesLoading || batteriesLoading}
              className="p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all shadow-sm disabled:opacity-50"
              title="Refresh List"
            >
              <ArrowPathIcon className={`w-6 h-6 ${(loading || driversLoading || assignedBatteriesLoading || batteriesLoading) ? 'animate-spin' : ''}`} />
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all shadow-sm"
              title="Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.127c-.332.183-.582.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>
            <button 
              onClick={() => {
                if (viewMode === 'swap_anomalies') handleExportSwapAlerts();
              }} 
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 font-bold text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all shadow-sm"
            >
              <ArrowDownTrayIcon className="w-5 h-5" /> Export
            </button>
         </div>
       </div>

       <div className="space-y-8">
         <div className="relative group max-w-xl">
           <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
           <input 
             type="text" 
             placeholder={
               viewMode === 'ingestion' ? "Search grid data..." :
               viewMode === 'stagnant' ? "Search Battery ID or IoT ID..." : 
               "Search Driver Name or ID..."
             } 
             value={searchQuery} 
             onChange={(e) => setSearchQuery(e.target.value)} 
             className="w-full pl-12 pr-4 py-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-indigo-500/10 dark:focus:ring-indigo-500/5 dark:text-zinc-100 font-bold transition-all shadow-sm" 
           />
         </div>
                <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-1 overflow-x-auto scrollbar-hide whitespace-nowrap">
           {[
             { id: 'ingestion', label: 'Ingestion', icon: TableCellsIcon, color: 'indigo' },
             { id: 'swap_anomalies', label: 'Swap Alerts', icon: ClockIcon, color: 'red' },
             { id: 'stagnant', label: 'Stagnant Stock', icon: PauseCircleIcon, color: 'zinc' },
           ].map((tab) => (
             <button
               key={tab.id}
               onClick={() => setViewMode(tab.id as any)}
               className={`flex items-center gap-2 px-6 py-4 rounded-t-2xl text-xs font-bold transition-all border-b-2 flex-shrink-0 ${
                 viewMode === tab.id 
                   ? `border-${tab.color}-500 text-${tab.color}-600 bg-${tab.color}-50 dark:bg-${tab.color}-900/10 dark:text-${tab.color}-400` 
                   : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
               }`}
             >
               <tab.icon className="w-4 h-4" /> {tab.label}
             </button>
           ))}
         </div>
       </div>

       <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col">
          {viewMode === 'ingestion' && (
            <div className="p-6 space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-50/80 dark:bg-zinc-950/40 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-100 dark:bg-indigo-950/50 rounded-xl text-indigo-600 dark:text-indigo-400">
                    <TableCellsIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-zinc-900 dark:text-white flex items-center gap-2">
                      Raw Ingestion
                      {ingestionType === 'battery' ? (
                        isGridPopulated(batteryGridData) ? (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/40">
                            Saved in Local Storage
                          </span>
                        ) : null
                      ) : (
                        isGridPopulated(driverGridData) ? (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/40">
                            Saved in Local Storage
                          </span>
                        ) : null
                      )}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {ingestionType === 'battery' 
                        ? 'Battery report data is saved locally until you upload a new one or clear it.' 
                        : 'Driver report data is saved locally until you upload a new one or clear it.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="bg-zinc-200/70 dark:bg-zinc-800/80 p-1 rounded-xl flex items-center gap-1 border border-zinc-200 dark:border-zinc-700/60 shadow-inner">
                    <button
                      type="button"
                      onClick={() => setIngestionType('battery')}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        ingestionType === 'battery'
                          ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                          : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      <BoltIcon className="w-4 h-4 text-emerald-500" />
                      Battery
                    </button>

                    <button
                      type="button"
                      onClick={() => setIngestionType('driver')}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        ingestionType === 'driver'
                          ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                          : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      <UserCircleIcon className="w-4 h-4 text-indigo-500" />
                      Driver
                    </button>

                    <div className="w-[1px] h-4 bg-zinc-300 dark:bg-zinc-700 mx-0.5" />

                    <button
                      type="button"
                      onClick={() => ingestionType === 'battery' ? setShowBatteryPasteModal(true) : setShowDriverPasteModal(true)}
                      title="Paste Data"
                      className="p-1.5 bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center"
                    >
                      <ArrowUpOnSquareIcon className="w-4 h-4" />
                    </button>

                    <label 
                      title="Upload File"
                      className="px-2.5 sm:px-3 py-1.5 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg text-xs font-bold cursor-pointer transition-all shadow-sm flex items-center gap-1.5"
                    >
                      <ArrowUpTrayIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span className="hidden sm:inline">Upload</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv,.tsv,.txt"
                        onChange={ingestionType === 'battery' ? handleBatteryFileUpload : handleDriverFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="bg-zinc-200/70 dark:bg-zinc-800/80 p-1 rounded-xl flex items-center gap-1 border border-zinc-200 dark:border-zinc-700/60 shadow-inner">
                    <button
                      type="button"
                      onClick={handleProcessIngestionData}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                    >
                      <CpuChipIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">Process</span>
                    </button>

                    <button
                      type="button"
                      onClick={ingestionType === 'battery' ? handleClearBatteryGrid : handleClearDriverGrid}
                      className="px-3.5 py-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <TrashIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">Clear</span>
                    </button>
                  </div>
                </div>
              </div>

              {ingestionType === 'battery' ? (
                <ExcelGrid
                  headers={BATTERY_REPORT_HEADERS}
                  data={batteryGridData}
                  onChange={handleBatteryGridChange}
                  onPasteEvent={handleBatteryPasteEvent}
                />
              ) : (
                <ExcelGrid
                  headers={DRIVER_REPORT_HEADERS}
                  data={driverGridData}
                  onChange={handleDriverGridChange}
                  onPasteEvent={handleDriverPasteEvent}
                />
              )}
            </div>
          )}

          {viewMode === 'swap_anomalies' && (
            <>
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 bg-red-50/10 dark:bg-red-950/10">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                        <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 shrink-0">
                          <ClockIcon className="w-5 h-5 text-red-500" /> Swap Alerts ({swapAlertDrivers.length})
                        </h3>
                      </div>
                  
                  {/* City Filter & Dual Copy Buttons */}
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="w-56">
                      <CustomSelect 
                        options={[{ value: 'all', label: 'All Cities' }, ...stationGroups.map(g => ({ value: g.id, label: g.name }))]}
                        value={selectedGroupId}
                        onChange={setSelectedGroupId}
                        placeholder="Filter by City"
                        className="!bg-white dark:!bg-zinc-900 !border-zinc-200 dark:!border-zinc-805 shadow-sm"
                        footer={
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowGroupModal(true);
                            }}
                            className="w-full py-2.5 text-center text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-t border-zinc-100 dark:border-zinc-805 flex items-center justify-center gap-1.5"
                          >
                            <PlusIcon className="w-3.5 h-3.5" />
                            Create/Manage Cities
                          </button>
                        }
                      />
                    </div>
                    <button
                      onClick={handleCopyListImageTrigger}
                      disabled={isCopyingImage || swapAlertDrivers.length === 0}
                      className={`px-3 sm:px-4 py-3 border rounded-2xl flex items-center justify-center gap-2 text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap h-[46px] ${
                        copiedImageSuccess
                          ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-850 text-emerald-600 dark:text-emerald-400'
                          : 'bg-white hover:bg-zinc-50 dark:bg-zinc-850 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700'
                      }`}
                      title="Copy Image"
                    >
                      {isCopyingImage ? (
                        <>
                          <ArrowPathIcon className="w-4 h-4 animate-spin" />
                          <span className="hidden sm:inline animate-pulse">Generating...</span>
                        </>
                      ) : copiedImageSuccess ? (
                        <>
                          <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span className="hidden sm:inline font-extrabold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <ArrowUpOnSquareIcon className="w-4 h-4 text-emerald-500" />
                          <span className="hidden sm:inline">Copy Image</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleCopyListTextTrigger}
                      disabled={isCopyingText || swapAlertDrivers.length === 0}
                      className={`px-3 sm:px-4 py-3 border rounded-2xl flex items-center justify-center gap-2 text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap h-[46px] ${
                        copiedTextSuccess
                          ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-850 text-emerald-600 dark:text-emerald-400'
                          : 'bg-white hover:bg-zinc-50 dark:bg-zinc-850 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700'
                      }`}
                      title="Copy Text"
                    >
                      {isCopyingText ? (
                        <>
                          <ArrowPathIcon className="w-4 h-4 animate-spin" />
                          <span className="hidden sm:inline">Copying...</span>
                        </>
                      ) : copiedTextSuccess ? (
                        <>
                          <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span className="hidden sm:inline font-extrabold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <ChatBubbleOvalLeftEllipsisIcon className="w-4 h-4 text-indigo-500" />
                          <span className="hidden sm:inline">Copy Text</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
              <div className="overflow-auto scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
                <table className="w-full text-left min-w-[1200px] border-collapse">
                  <thead className="bg-zinc-50/95 dark:bg-zinc-900/95 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10 shadow-sm backdrop-blur-sm">
                    <tr>
                      <SortableHeader label="Driver Details" sortKey="name" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                      <SortableHeader label="Contact" sortKey="phone" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                      <SortableHeader label="Alternate No" sortKey="alt_phone" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                      <SortableHeader label="Vehicle" sortKey="vehicle_info.vehicle_number" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Battery 1</th>
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Battery 2</th>
                      <SortableHeader label="Last Swap" sortKey="latest_swap.last_swap_date" currentSort={sortConfig} onSort={handleSort} className="whitespace-nowrap" />
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Idle Duration</th>
                      <SortableHeader label="Total Swaps" sortKey="total_swaps" currentSort={sortConfig} onSort={handleSort} className="text-right whitespace-nowrap" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70 bg-white dark:bg-zinc-900">
                    {driversLoading || assignedBatteriesLoading ? (
                      Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={9} />)
                    ) : swapAlertDrivers.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-10 font-bold text-zinc-400">No delayed swaps detected ({stagnantDaysThreshold}+ days).</td></tr>
                    ) : (
                      getPaginatedData(swapAlertDrivers).map(driver => {
                        const rawDate = driver.latest_swap?.last_swap_date || 
                          driver.batteries?.[0]?.last_swap_on || 
                          driver.batteries?.[1]?.last_swap_on || 0;
                        const lastSwapMs = rawDate > 100000000000 ? rawDate : rawDate * 1000;
                        const lastSwap = rawDate ? new Date(lastSwapMs) : null;
                        const daysSince = lastSwap ? Math.floor((fetchTime - lastSwap.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                        
                        const renderBatteryCell = (bat?: KazamBattery) => {
                          if (!bat) return <span className="text-zinc-300 dark:text-zinc-700 text-[10px] font-bold uppercase">Not Assigned</span>;
                          
                          let updateTs = bat.last_updated_on;
                          let updateMs = 0;
                          if (typeof updateTs === 'string') updateMs = new Date(updateTs).getTime();
                          else updateMs = updateTs > 100000000000 ? updateTs : updateTs * 1000;
                          const isOnline = (fetchTime - updateMs) < 5 * 60 * 1000;

                          return (
                            <div className="flex flex-col gap-1 py-1">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <span className="text-xs font-bold font-mono text-zinc-900 dark:text-white shrink-0">
                                  {bat.id}
                                </span>
                                <CopyButton text={bat.id} />
                                <div className="flex items-center gap-1 text-zinc-700 dark:text-zinc-300 text-[10px] font-bold shrink-0">
                                  <BoltIcon className={`w-3 h-3 ${bat.soc < 20 ? 'text-red-500' : 'text-emerald-500'}`} />
                                  {bat.soc}%
                                </div>
                                <button 
                                  onClick={() => bat.location?.coordinates && window.open(`https://www.google.com/maps?q=${bat.location.coordinates[1]},${bat.location.coordinates[0]}`, '_blank')}
                                  className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors text-indigo-500 shrink-0"
                                  title="View Location"
                                >
                                  <MapPinIcon className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="flex flex-col gap-0.5 pl-1">
                                <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 whitespace-nowrap truncate max-w-[150px]">
                                  {bat.iot_id || '--'}
                                </div>
                                {(bat as any).latestIssue && (
                                  <div 
                                    className="flex items-center gap-1 text-[9px] font-bold text-red-500 uppercase cursor-pointer hover:text-red-600 transition-colors"
                                    onClick={() => {
                                      setSelectedBatteryForHistory(bat.id);
                                      setIsHistoryModalOpen(true);
                                    }}
                                  >
                                    <ExclamationCircleIcon className="w-2.5 h-2.5" />
                                    {normalizeIssueType((bat as any).latestIssue.issueType)}
                                    {((bat as any).latestIssue.occurrenceCount || 1) > 1 && (
                                      <span className="ml-1 px-1 rounded-full bg-red-100 dark:bg-red-900/30 text-[8px]">
                                        {((bat as any).latestIssue.occurrenceCount || 1)}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        };

                        return (
                          <tr key={driver.driver_id} className="group hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-colors duration-200">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3 whitespace-nowrap">
                                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 font-bold text-sm shrink-0">
                                  {driver.name ? driver.name.charAt(0) : '?'}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-bold text-sm text-zinc-900 dark:text-white">{driver.name}</p>
                                    <CopyButton 
                                      text={`Driver ID: ${driver.driver_id}\nName: ${driver.name}\nPhone: ${driver.phone}${driver.alt_phone ? ` (Alt: ${driver.alt_phone})` : ''}\nVehicle: ${driver.vehicle_info?.vehicle_number || driver.latest_swap?.vehicle_number || '--'}${driver.vehicle_info?.chassis_number ? `\nChassis No: ${driver.vehicle_info.chassis_number}` : ''}${driver.vehicle_info?.make ? `\nMake: ${driver.vehicle_info.make}` : ''}${driver.vehicle_info?.model ? `\nModel: ${driver.vehicle_info.model}` : ''}\n\nBattery 1: ${driver.batteries?.[0]?.id || '--'}${driver.batteries?.[0]?.iot_id ? ` | ${driver.batteries[0].iot_id}` : ''}\nBattery 2: ${driver.batteries?.[1]?.id || '--'}${driver.batteries?.[1]?.iot_id ? ` | ${driver.batteries[1].iot_id}` : ''}\n\nmap link B1: ${driver.batteries?.[0]?.location?.coordinates ? `https://www.google.com/maps?q=${driver.batteries[0].location.coordinates[1]},${driver.batteries[0].location.coordinates[0]}` : ''}\nmap link B2: ${driver.batteries?.[1]?.location?.coordinates ? `https://www.google.com/maps?q=${driver.batteries[1].location.coordinates[1]},${driver.batteries[1].location.coordinates[0]}` : ''}`} 
                                    />
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <p className="text-[10px] font-bold text-zinc-500 font-mono">{driver.driver_id}</p>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300 flex items-center gap-2 whitespace-nowrap">
                                <PhoneIcon className="w-3.5 h-3.5 shrink-0" /> 
                                {driver.phone || '--'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300 flex items-center gap-2 whitespace-nowrap">
                                <PhoneIcon className="w-3.5 h-3.5 shrink-0 text-zinc-400/70" /> 
                                {driver.alt_phone || '--'}
                              </span>
                            </td>
                            <td className="px-6 py-4"><span className="text-xs font-bold text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{driver.vehicle_info?.vehicle_number || driver.latest_swap?.vehicle_number || '--'}</span></td>
                            <td className="px-6 py-4">{renderBatteryCell(driver.batteries?.[0])}</td>
                            <td className="px-6 py-4">{renderBatteryCell(driver.batteries?.[1])}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-xs font-bold text-zinc-900 dark:text-white font-mono">
                                {lastSwap ? formatDateTime24(lastSwap) : '--'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap"><div className="flex items-center gap-2"><ClockIcon className="w-4 h-4 text-red-500 shrink-0" /><span className="text-sm font-bold text-red-600 dark:text-red-400">{daysSince} Days</span></div></td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-sm font-black text-zinc-800 dark:text-zinc-200 font-mono">
                                {driver.total_swaps ?? 0}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {renderPagination(swapAlertDrivers)}
            </>
          )}

          {viewMode === 'stagnant' && (
            <>
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 space-y-4">
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full lg:w-auto">
                        <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 shrink-0">
                          <PauseCircleIcon className="w-5 h-5 text-zinc-500" /> Stagnant Stock ({stagnantBatteries.length})
                        </h3>
                      </div>
                  
                  <div className="flex flex-col lg:flex-row items-center gap-3 w-full lg:w-auto">
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                      <div className="w-full sm:w-48">
                          <CustomSelect 
                              options={stagnantStationOptions} 
                              value={stagnantStationFilter} 
                              onChange={setStagnantStationFilter as any}
                              className="!bg-white dark:!bg-zinc-900 !border-zinc-200 dark:!border-zinc-800 !py-2.5 !rounded-xl !shadow-sm !text-[10px]"
                          />
                      </div>
                      <div className="w-full sm:w-48">
                          <CustomSelect 
                              multiple
                              options={[
                                  { value: 'Available', label: 'Available' },
                                  { value: 'Charging', label: 'Charging' },
                                  { value: 'Low SoC', label: 'Low SoC' },
                                  { value: 'Error', label: 'Error' },
                                  { value: 'Inactive', label: 'Inactive (No Hub)' }
                              ]} 
                              value={stagnantStatusFilter} 
                              onChange={(val) => setStagnantStatusFilter(val as string[])}
                              className="!bg-white dark:!bg-zinc-900 !border-zinc-200 dark:!border-zinc-800 !py-2.5 !rounded-xl !shadow-sm !text-[10px]"
                          />
                      </div>
                    </div>

                    <div className="flex bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm items-center w-full sm:w-auto overflow-x-auto scrollbar-hide">
                        <button onClick={() => setStagnantFilter('all')} className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all whitespace-nowrap ${stagnantFilter === 'all' ? 'bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'}`}>All</button>
                        <button onClick={() => setStagnantFilter('online')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all whitespace-nowrap ${stagnantFilter === 'online' ? 'bg-emerald-500 text-white shadow-sm' : 'text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400'}`}><SignalIcon className="w-3 h-3" /> Online</button>
                        <button onClick={() => setStagnantFilter('offline')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all whitespace-nowrap ${stagnantFilter === 'offline' ? 'bg-red-500 text-white shadow-sm' : 'text-zinc-500 hover:text-red-600 dark:hover:text-red-400'}`}><SignalSlashIcon className="w-3 h-3" /> Offline</button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="overflow-auto scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
                <table className="w-full text-left min-w-[1000px] border-collapse">
                  <thead className="bg-zinc-50/95 dark:bg-zinc-900/95 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10 shadow-sm backdrop-blur-sm">
                    <tr>
                      <SortableHeader label="Battery ID" sortKey="id" currentSort={sortConfig} onSort={handleSort} className="w-36 whitespace-nowrap" />
                      <SortableHeader label="IoT ID" sortKey="iot_id" currentSort={sortConfig} onSort={handleSort} className="w-64 whitespace-nowrap" />
                      <SortableHeader label="Last Swap Date" sortKey="last_swap_on" currentSort={sortConfig} onSort={handleSort} className="w-48 whitespace-nowrap" />
                      <SortableHeader label="Status" sortKey="status" currentSort={sortConfig} onSort={handleSort} className="w-36 whitespace-nowrap" />
                      <th className="w-64 px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Issue Raised</th>
                      <SortableHeader label="Last Update" sortKey="last_updated_on" currentSort={sortConfig} onSort={handleSort} className="w-56 whitespace-nowrap" />
                      <SortableHeader label="Station" sortKey="dealer_name" currentSort={sortConfig} onSort={handleSort} className="w-56 whitespace-nowrap" />
                      <SortableHeader label="SoC" sortKey="soc" currentSort={sortConfig} onSort={handleSort} className="w-24 text-right whitespace-nowrap" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70 bg-white dark:bg-zinc-900">
                    {batteriesLoading ? (
                      Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={8} />)
                    ) : stagnantBatteries.length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-10 font-bold text-zinc-400">No stagnant assets found matching filters.</td></tr>
                    ) : (
                      getPaginatedData(stagnantBatteries).map(bat => {
                        const swapTs = bat.batteryHistory?.timestamp || bat.last_swap_on;
                        const displayDate = swapTs ? formatDateTime24(swapTs) : '--';
                        
                        // Calculate Connectivity for current row
                        let updateTs = bat.last_updated_on;
                        let updateMs = 0;
                        if (typeof updateTs === 'string') updateMs = new Date(updateTs).getTime();
                        else if (typeof updateTs === 'number') updateMs = updateTs > 100000000000 ? updateTs : updateTs * 1000;
                        const hasLastUpdated = Boolean(updateMs && updateMs > 0);
                        const isOnline = hasLastUpdated && (fetchTime - updateMs) < 5 * 60 * 1000;

                        return (
                          <tr key={bat.id} className="group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors duration-200">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1 whitespace-nowrap">
                                <span className="text-xs font-bold font-mono text-zinc-900 dark:text-white shrink-0">
                                  {bat.id}
                                </span>
                                <CopyButton text={bat.id} />
                              </div>
                            </td>
                            <td className="px-6 py-4"><span className="text-xs font-bold text-zinc-500 whitespace-nowrap">{bat.iot_id || '--'}</span></td>
                            <td className="px-6 py-4"><div className="flex items-center gap-2 whitespace-nowrap"><ClockIcon className="w-4 h-4 text-zinc-400 shrink-0" /><span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 font-mono">{displayDate}</span></div></td>
                            <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-[10px] font-bold uppercase whitespace-nowrap ${getBatteryStatus(bat) === 'Error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : getBatteryStatus(bat) === 'Charging' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>{getBatteryStatus(bat)}</span></td>
                             <td className="px-6 py-4">
                               {(bat as any).latestIssue ? (
                                 <div 
                                   className="flex flex-col gap-0.5 cursor-pointer group/issue"
                                   onClick={() => {
                                     setSelectedBatteryForHistory(bat.id);
                                     setIsHistoryModalOpen(true);
                                   }}
                                 >
                                   <div className="flex items-center gap-2">
                                     <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase group-hover/issue:text-red-700 transition-colors">
                                       {(bat as any).latestIssue.mainDescription || normalizeIssueType((bat as any).latestIssue.issueType)}
                                     </span>
                                     {((bat as any).latestIssue.occurrenceCount || 1) > 1 && (
                                       <span className="px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[8px] font-bold">
                                         {((bat as any).latestIssue.occurrenceCount || 1)}
                                       </span>
                                     )}
                                   </div>
                                   <span className="text-[10px] text-zinc-500 font-medium whitespace-nowrap" title={(bat as any).latestIssue.subDescription || cleanDescription((bat as any).latestIssue.issueType)}>
                                     {(bat as any).latestIssue.subDescription || cleanDescription((bat as any).latestIssue.issueType)}
                                   </span>
                                 </div>
                               ) : (
                                 <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">No Issues</span>
                               )}
                             </td>
                            <td className="px-6 py-4">
                              {bat.last_updated_on ? (
                                <span className={`px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap font-mono ${isOnline ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                                  {formatTimestamp(bat.last_updated_on)}
                                </span>
                              ) : (
                                <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 font-mono">--</span>
                              )}
                            </td>
                            <td className="px-6 py-4"><span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{bat.dealer_name || '🚫 Unassigned'}</span></td>
                            <td className="px-6 py-4 text-right"><div className="flex items-center justify-end gap-2 whitespace-nowrap"><BoltIcon className={`w-3.5 h-3.5 shrink-0 ${bat.soc < 20 ? 'text-red-500' : 'text-emerald-500'}`} /><span className={`text-sm font-bold ${bat.soc < 20 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{bat.soc}%</span></div></td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {renderPagination(stagnantBatteries)}
            </>
          )}
       </div>

      {/* Quick Paste Modal for Driver Report */}
      {showDriverPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-base text-zinc-900 dark:text-white flex items-center gap-2">
                <UserCircleIcon className="w-5 h-5 text-indigo-500" /> Quick Paste Driver Report Data
              </h3>
              <button
                type="button"
                onClick={() => setShowDriverPasteModal(false)}
                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Copy rows from Excel or TSV and paste below. The data will populate the Driver Report grid and update First Swap Alerts.
            </p>
            <textarea
              rows={8}
              value={driverPasteText}
              onChange={(e) => setDriverPasteText(e.target.value)}
              placeholder={"Name\tDriver ID\tPhone\tAlternate Phone\tEmail\tState\tCity\tAddress\tLicense Number\tVehicle Number\tChassis Number\tAadhar Number\tPlan Name\tFree Swaps\tDeposit Amount\tCreated Date\tOnboarded date\tOnboarding station ID\tOnboarding station name\tTotal Swaps\tLast Swap Date\tBattery Return Date\tOnboarding Status\tBattery Status\tDriver Status\tWallet Balance\tAssigned Battery 1\tAssigned Battery 2\tTotal Penalty Amount\tPending Penalty Amount\tPaid Penalty Amount\nRAJENDRA PRASAD MEHTA\tD836312\t7033981126\t6207852224\t\tHARYANA\tGurgaon\tHOUSE NO 18\t\tHR55AS7478\tM1YDECB12823K0770\t577585561268\t2000 GGN\t0\t2000\t02/08/2026 03:39:10 PM\t02/08/2026 04:31:50 PM\tDe784256\tDUNDAHERA\t1\t02/08/2026 04:31:50 PM\t\tComplete\tAssigned\tActive\t0\tBI260300410\tBI260500845\t0\t0\t0"}
              className="w-full p-3 font-mono text-xs border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDriverPasteModal(false)}
                className="px-4 py-2 text-xs font-bold border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleManualDriverPasteSubmit}
                className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-colors"
              >
                Parse & Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Paste Modal for Battery Report */}
      {showBatteryPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="font-bold text-base text-zinc-900 dark:text-white flex items-center gap-2">
                <BoltIcon className="w-5 h-5 text-emerald-500" /> Quick Paste Battery Report Data
              </h3>
              <button
                type="button"
                onClick={() => setShowBatteryPasteModal(false)}
                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Copy rows from Excel or TSV and paste below. The data will populate the Battery Report grid and update First Swap Alerts & Stagnant Stock.
            </p>
            <textarea
              rows={8}
              value={batteryPasteText}
              onChange={(e) => setBatteryPasteText(e.target.value)}
              placeholder={"Battery ID\tSolution\tMake\tModel\tStatus\tStation ID\tDriver ID\tStation Name\tDriver Name\tDriver Mobile Number\tLast Swapped\tTotal Swaps\tCharge Cycles\tLatitude\tLongitude\tSOH\tSOC\tBattery Voltage\tBattery Temperature\tBMS_ID\tIOT_ID\nBN260700003\tswapping\tVecmocon\tVec_connected_bat\tAssigned\tDe425627\tD483134\tRaipur khurd\tKULWINDER SINGH\t7889263926\t01/08/2026 03:17:16 PM\t5\t3\t30.67770958\t76.80950165\t100\t68\t53.08000183\t47\t03ea0233112e01bf00000000\t000005869742085931068"}
              className="w-full p-3 font-mono text-xs border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowBatteryPasteModal(false)}
                className="px-4 py-2 text-xs font-bold border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleManualBatteryPasteSubmit}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-colors"
              >
                Parse & Save
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Bulk Resolve Modal */}
        {isHistoryModalOpen && selectedBatteryForHistory && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-950/20">
                <div>
                  <h3 className="text-xl font-bold font-heading text-zinc-900 dark:text-white flex items-center gap-2">
                    <ClockIcon className="w-6 h-6 text-indigo-500" />
                    Issue History
                  </h3>
                  <p className="text-sm font-bold text-zinc-500">
                    Asset: {selectedBatteryForHistory}
                  </p>
                </div>
                <button
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
                >
                  <XMarkIcon className="w-6 h-6 text-zinc-400" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-8">
                <div className="space-y-6">
                  {issues
                    .filter((issue) => issue.batteryId === selectedBatteryForHistory)
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((issue, idx) => (
                      <div 
                        key={issue.id} 
                        className="relative pl-8 border-l-2 border-zinc-100 dark:border-zinc-800 pb-6 last:pb-0"
                      >
                        <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-indigo-500 border-4 border-white dark:border-zinc-900 shadow-sm" />
                        <div className="bg-zinc-50 dark:bg-zinc-950 p-5 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                          <div className="flex justify-between items-start mb-3">
                            <span className="px-3 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-[10px] font-bold uppercase">
                              {issue.mainDescription || normalizeIssueType(issue.issueType)}
                            </span>
                            <span className="text-[10px] font-bold text-zinc-400">
                              {new Date(issue.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">
                            {issue.subDescription || cleanDescription(issue.issueType) || "No sub-description provided."}
                          </p>
                          <div className="flex items-center gap-4 text-[10px] font-bold text-zinc-500">
                            <span className="flex items-center gap-1">
                              <UserCircleIcon className="w-3 h-3" />
                              {issue.raisedByName}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPinIcon className="w-3 h-3" />
                              {issue.currentLocationContext}
                            </span>
                            {issue.occurrenceCount >= 1 && (
                              <span className="flex items-center gap-1 text-red-500">
                                <ArrowPathIcon className="w-3 h-3" />
                                {issue.occurrenceCount} Occurrences
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  {issues.filter((issue) => issue.batteryId === selectedBatteryForHistory).length === 0 && (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircleIcon className="w-8 h-8 text-emerald-500" />
                      </div>
                      <p className="text-zinc-500 font-bold">No issues found for this asset.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Resolve Modal */}
        {showBulkResolve && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-950/20">
                <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <CheckCircleIcon className="w-5 h-5 text-emerald-500" /> Bulk Resolve Issues
                </h3>
                <button onClick={() => setShowBulkResolve(false)} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                  <XCircleIcon className="w-6 h-6 text-zinc-400" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1 scrollbar-hide">
                <div className="mb-4 text-xs text-zinc-500 font-medium">
                  Enter Battery IDs to resolve their pending/verified issues. You can specify the action taken and the resolution date.
                  <span className="block mt-1 text-indigo-500 font-bold">Tip: You can paste a list of Battery IDs separated by newlines or spaces to create multiple rows automatically.</span>
                </div>
                
                <div className="space-y-3">
                  <div className="grid grid-cols-12 gap-4 px-2 mb-2">
                    <div className="col-span-4 text-[10px] font-black uppercase text-zinc-400 tracking-widest">Battery ID</div>
                    <div className="col-span-4 text-[10px] font-black uppercase text-zinc-400 tracking-widest">Action Taken</div>
                    <div className="col-span-3 text-[10px] font-black uppercase text-zinc-400 tracking-widest">Date</div>
                    <div className="col-span-1"></div>
                  </div>
                  
                  {bulkRows.map((row, index) => (
                    <div key={index} className="grid grid-cols-12 gap-4 items-center animate-in slide-in-from-left-2 duration-200">
                      <div className="col-span-4 relative">
                        <input 
                          type="text"
                          placeholder="e.g. BAT001"
                          value={row.batteryId}
                          onChange={(e) => updateBulkRow(index, 'batteryId', e.target.value)}
                          className={`w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-zinc-100 ${
                            row.isChecking ? 'border-indigo-300 dark:border-indigo-800' : 
                            row.batteryId && row.issues.length > 0 ? 'border-emerald-300 dark:border-emerald-800' :
                            row.batteryId && !row.isChecking ? 'border-zinc-200 dark:border-zinc-800' :
                            'border-zinc-200 dark:border-zinc-800'
                          }`}
                        />
                        {row.isChecking && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        )}
                        {row.batteryId && !row.isChecking && (
                          <div className="absolute -bottom-4 left-2 flex items-center gap-1">
                            {row.issues.length > 0 ? (
                              <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter flex items-center gap-0.5">
                                <CheckCircleIcon className="w-2.5 h-2.5" /> {row.issues.length} Issues Found
                              </span>
                            ) : (
                              <span className="text-[9px] font-black text-zinc-400 uppercase tracking-tighter flex items-center gap-0.5">
                                <XCircleIcon className="w-2.5 h-2.5" /> No Issues
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="col-span-4">
                        <input 
                          type="text"
                          placeholder="e.g. Replaced MCB"
                          value={row.actionTaken}
                          onChange={(e) => updateBulkRow(index, 'actionTaken', e.target.value)}
                          className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-zinc-100"
                        />
                      </div>
                      <div className="col-span-3">
                        <input 
                          type="date"
                          value={row.date}
                          onChange={(e) => updateBulkRow(index, 'date', e.target.value)}
                          className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-zinc-100"
                        />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <button 
                          onClick={() => removeBulkRow(index)}
                          className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
                          disabled={bulkRows.length === 1}
                        >
                          <MinusIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-4 flex items-center justify-between">
                  <button 
                    onClick={addBulkRow}
                    className="flex items-center gap-2 px-4 py-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl text-xs font-bold transition-all"
                  >
                    <PlusIcon className="w-4 h-4" /> Add Row
                  </button>
                  
                  <button 
                    onClick={() => setBulkRows([{ batteryId: '', actionTaken: '', date: format(new Date(), 'yyyy-MM-dd'), issues: [], isChecking: false }])}
                    className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-xs font-bold transition-all"
                  >
                    <TrashIcon className="w-4 h-4" /> Clear All
                  </button>
                </div>
              </div>
              
              <div className="p-6 bg-zinc-50/50 dark:bg-zinc-950/20 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
                <button 
                  onClick={() => setShowBulkResolve(false)}
                  className="px-6 py-2.5 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleBulkResolve}
                  disabled={isBulkResolving}
                  className="px-8 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 dark:shadow-none flex items-center gap-2 disabled:opacity-50"
                >
                  {isBulkResolving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Resolving...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="w-4 h-4" /> Resolve All
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Resolve Confirmation Modal */}
        {resolveConfirmation && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] w-full max-w-md flex flex-col shadow-2xl animate-in fade-in zoom-in-95 border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="p-8 text-center">
                <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircleIcon className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-2xl font-bold font-heading text-zinc-900 dark:text-white mb-2">Resolve Issue?</h3>
                <p className="text-zinc-500 dark:text-zinc-400 font-medium mb-8">
                  Are you sure you want to mark the issue for battery <span className="font-bold text-zinc-900 dark:text-zinc-200">{resolveConfirmation.batteryId}</span> as resolved?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setResolveConfirmation(null)}
                    className="flex-1 px-6 py-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmResolve}
                    className="flex-1 px-6 py-4 rounded-2xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 dark:shadow-none"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

       {/* Settings Modal */}
       {showSettings && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-950/20">
               <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-indigo-500">
                   <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.49l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.127c-.332.183-.582.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
                   <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                 </svg>
                 Threshold Settings
               </h3>
               <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                 <XCircleIcon className="w-6 h-6 text-zinc-400" />
               </button>
             </div>
             <div className="p-8 space-y-8">
               <div className="space-y-4">
                 <div className="flex justify-between items-center">
                   <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider font-heading block">Swap Alerts Threshold</label>
                   <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-xs font-bold">{stagnantDaysThreshold} Days</span>
                 </div>
                 <input 
                   type="range" 
                   min="1" 
                   max="30" 
                   value={stagnantDaysThreshold} 
                   onChange={(e) => setStagnantDaysThreshold(parseInt(e.target.value))}
                   className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-500"
                 />
                 <p className="text-[10px] text-zinc-400 font-medium">Flag drivers who haven't swapped in more than {stagnantDaysThreshold} days.</p>
               </div>

               <div className="h-px bg-zinc-100 dark:bg-zinc-800"></div>

               <div className="space-y-4">
                 <div className="flex justify-between items-center">
                   <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider font-heading block">Stagnant Stock Threshold</label>
                   <span className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg text-xs font-bold">{stagnantStockDaysThreshold} Days</span>
                 </div>
                 <input 
                   type="range" 
                   min="1" 
                   max="30" 
                   value={stagnantStockDaysThreshold} 
                   onChange={(e) => setStagnantStockDaysThreshold(parseInt(e.target.value))}
                   className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-500"
                 />
                 <p className="text-[10px] text-zinc-400 font-medium">Flag batteries sitting at stations for more than {stagnantStockDaysThreshold} days.</p>
               </div>
             </div>
             <div className="p-6 bg-zinc-50/50 dark:bg-zinc-950/20 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
               <button 
                 onClick={() => setShowSettings(false)}
                 className="px-6 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-bold hover:opacity-90 transition-all shadow-sm"
               >
                 Done
               </button>
             </div>
           </div>
         </div>
       )}

        {/* Station Group Management Modal */}
        {showGroupModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-[2.5rem] p-8 shadow-2xl border border-zinc-100 dark:border-zinc-800 animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 tracking-widest block uppercase mb-1">
                    City administration
                  </span>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Cities</h3>
                </div>
                <button 
                  onClick={() => {
                    setShowGroupModal(false);
                    setNewGroupName('');
                    setSelectedStationsForGroup([]);
                  }} 
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all cursor-pointer"
                >
                  <XMarkIcon className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                {/* Create City Form */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Create New City</h4>
                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider font-heading">City Name</label>
                    <input 
                      type="text"
                      placeholder="e.g. Chandigarh, Mohali"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 text-zinc-900 dark:text-zinc-100 shadow-sm transition-all animate-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider font-heading">Select Stations</label>
                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 max-h-[220px] overflow-y-auto space-y-2 bg-zinc-50/50 dark:bg-zinc-950/20 scrollbar-thin">
                      {stations.length === 0 ? (
                        <p className="text-xs text-zinc-400 italic text-center py-4">No stations found</p>
                      ) : (
                        stations.map(station => (
                          <label key={station.id} className="flex items-center gap-3 p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl cursor-pointer transition-colors">
                            <input 
                              type="checkbox" 
                              checked={selectedStationsForGroup.includes(station.id)}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedStationsForGroup([...selectedStationsForGroup, station.id]);
                                else setSelectedStationsForGroup(selectedStationsForGroup.filter(id => id !== station.id));
                              }}
                              className="w-4 h-4 rounded-lg text-indigo-600 focus:ring-indigo-500 accent-indigo-600 border-zinc-300"
                            />
                            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200 select-none whitespace-nowrap overflow-hidden text-ellipsis block max-w-[200px]" title={station.name}>
                              {station.name}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>

                  <button 
                    onClick={createGroup}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-xs transition-all shadow-md shadow-indigo-100 dark:shadow-none hover:shadow-lg hover:shadow-indigo-200/50 cursor-pointer text-center"
                  >
                    Create City
                  </button>
                </div>

                {/* Existing Cities List */}
                <div className="space-y-4 flex flex-col">
                  <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Existing Cities</h4>
                  <div className="space-y-3 overflow-y-auto max-h-[360px] pr-2 flex-1 scrollbar-thin">
                    {stationGroups.length === 0 ? (
                      <div className="p-8 text-center text-zinc-400 text-xs italic bg-zinc-50 dark:bg-zinc-950/20 border border-zinc-200 dark:border-zinc-800 rounded-3xl">
                        No cities created yet.
                      </div>
                    ) : (
                      stationGroups.map(group => (
                        <div key={group.id} className="p-4 bg-zinc-50 dark:bg-zinc-950/20 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-center group/item animate-none">
                          <div className="min-w-0 pr-3">
                            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 block truncate" title={group.name}>{group.name}</span>
                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                              {(group.stationIds || []).length} Stations
                            </span>
                          </div>
                          <button 
                            onClick={(e) => deleteGroup(group.id, e)}
                            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-all cursor-pointer shrink-0"
                            title="Delete City"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Active Swap Alerts Driver Selection Modal */}
        {showDriverSelectionModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-xl rounded-[2.5rem] p-8 shadow-2xl border border-zinc-100 dark:border-zinc-800 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
              
              {/* Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 tracking-widest block uppercase mb-1">
                    Export Customization
                  </span>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
                    Select Drivers to Include
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Uncheck any drivers you want to exclude or ignore in this report.
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setShowDriverSelectionModal(false);
                    setModalSearchQuery('');
                  }}
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all cursor-pointer"
                >
                  <XMarkIcon className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              {/* Utility / Search & Bulk Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                {/* Search */}
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <MagnifyingGlassIcon className="h-4 w-4 text-zinc-400" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search by name, ID or contact..."
                    value={modalSearchQuery}
                    onChange={(e) => setModalSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 text-zinc-900 dark:text-zinc-100 shadow-sm transition-all"
                  />
                </div>
                
                {/* Bulk Select buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedDriverIdsForExport(swapAlertDrivers.map(d => d.driver_id))}
                    className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-700 dark:text-zinc-300 rounded-xl text-[10.5px] font-black tracking-wider uppercase transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDriverIdsForExport([])}
                    className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-700 dark:text-zinc-300 rounded-xl text-[10.5px] font-black tracking-wider uppercase transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Driver List with Checkboxes */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 overflow-y-auto flex-1 bg-zinc-50/50 dark:bg-zinc-950/20 scrollbar-thin space-y-2 min-h-[180px]">
                {(() => {
                  const filteredList = swapAlertDrivers.filter(driver => {
                    const q = modalSearchQuery.toLowerCase().trim();
                    if (!q) return true;
                    return (driver.name || '').toLowerCase().includes(q) || 
                           (driver.driver_id || '').toLowerCase().includes(q) || 
                           (driver.phone || '').includes(q);
                  });

                  if (filteredList.length === 0) {
                    return (
                      <p className="text-xs text-zinc-400 italic text-center py-8">
                        No active drivers match your search
                      </p>
                    );
                  }

                  return filteredList.map(driver => {
                    const isChecked = selectedDriverIdsForExport.includes(driver.driver_id);
                    return (
                      <label 
                        key={driver.driver_id} 
                        className={`flex items-center justify-between p-3 rounded-xl cursor-pointer border transition-all ${
                          isChecked 
                            ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200/60 dark:border-indigo-900/40' 
                            : 'bg-white dark:bg-zinc-900 border-zinc-150 dark:border-zinc-800/80 hover:bg-zinc-50 dark:hover:bg-zinc-850'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDriverIdsForExport([...selectedDriverIdsForExport, driver.driver_id]);
                              } else {
                                setSelectedDriverIdsForExport(selectedDriverIdsForExport.filter(id => id !== driver.driver_id));
                              }
                            }}
                            className="w-4 h-4 rounded-lg text-indigo-600 focus:ring-indigo-500 accent-indigo-600 border-zinc-300 dark:border-zinc-700"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-200 block truncate uppercase">
                              {driver.name || 'Unnamed Driver'}
                            </span>
                            <span className="text-[10px] font-semibold text-zinc-400 block tracking-tight">
                              ID: {driver.driver_id} &bull; Contact: {driver.phone || '--'}{driver.alt_phone ? ` (Alt: ${driver.alt_phone})` : ''}
                              {driver.batteries && driver.batteries.length > 0 && (
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-1.5">
                                  &bull; Batteries: {driver.batteries.map((b: any) => b.id).filter(Boolean).join(', ')}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                        {/* Selected counter helper / status badge */}
                        <div className="shrink-0 pl-2">
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg ${
                            isChecked 
                              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' 
                              : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'
                          }`}>
                            {isChecked ? 'Active' : 'Ignored'}
                          </span>
                        </div>
                      </label>
                    );
                  });
                })()}
              </div>

              {/* Status indicator and action buttons */}
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                  Selected <strong className="text-zinc-900 dark:text-white font-extrabold">{selectedDriverIdsForExport.length}</strong> of <strong className="text-zinc-900 dark:text-white font-extrabold">{swapAlertDrivers.length}</strong> drivers
                </span>

                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  <button 
                    type="button"
                    onClick={() => {
                      setShowDriverSelectionModal(false);
                      setModalSearchQuery('');
                    }}
                    className="w-full sm:w-auto px-5 py-3 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-2xl font-bold text-xs hover:bg-zinc-50 dark:hover:bg-zinc-805 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button"
                    disabled={selectedDriverIdsForExport.length === 0}
                    onClick={() => {
                      setShowDriverSelectionModal(false);
                      setModalSearchQuery('');
                      if (pendingExportAction === 'image') {
                        performCopyListImage();
                      } else if (pendingExportAction === 'text') {
                        performCopyListText();
                      }
                    }}
                    className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl font-bold text-xs transition-all shadow-md shadow-indigo-100 dark:shadow-none hover:shadow-lg hover:shadow-indigo-200/50 cursor-pointer"
                  >
                    {pendingExportAction === 'image' ? 'Generate & Copy Image' : 'Generate & Copy Text'}
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Off-screen export container for copying the swap alerts list as an image */}
        <div className="fixed left-[-9999px] top-[-9999px] z-[-50] pointer-events-none select-none overflow-visible">
          <div 
            ref={exportRef} 
            className="p-8 bg-white text-zinc-900 w-[960px] flex flex-col gap-4"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            {/* Elegant Minimal Header mimicking Swap Sessions Report */}
            <div className="flex justify-between items-end border-b border-zinc-150 pb-4 mb-2">
              <div className="border-l-[4px] border-indigo-600 pl-4 py-0.5">
                <span 
                  className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1"
                >
                  Active Swap Alerts
                </span>
                <h2 
                  className="text-xl font-bold text-zinc-900 m-0 leading-none"
                >
                  {selectedGroupId !== 'all' ? stationGroups.find(g => g.id === selectedGroupId)?.name || 'Filtered' : 'All Cities'}
                </h2>
              </div>
              <div className="text-right flex flex-col items-end gap-1">
                <span className="text-[11px] font-bold text-zinc-900 leading-none">
                  {(() => {
                    const d = new Date();
                    const day = d.getDate();
                    const month = d.toLocaleDateString(undefined, { month: 'long' });
                    const year = d.getFullYear();
                    let suffix = 'th';
                    if (day === 1 || day === 21 || day === 31) suffix = 'st';
                    else if (day === 2 || day === 22) suffix = 'nd';
                    else if (day === 3 || day === 23) suffix = 'rd';
                    return `${day}${suffix} ${month} ${year}`;
                  })()}
                </span>
                <span className="text-[10px] font-semibold text-zinc-400 leading-none font-mono">
                  {formatTime24(new Date())}
                </span>
              </div>
            </div>

            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#fafafa] border-b border-zinc-200 text-[10px] uppercase tracking-wider text-zinc-400">
                  <th className="px-3 py-3.5 font-bold whitespace-nowrap">Driver Name</th>
                  <th className="px-3 py-3.5 font-bold text-center whitespace-nowrap">Driver ID</th>
                  <th className="px-3 py-3.5 font-bold whitespace-nowrap">Contact</th>
                  <th className="px-3 py-3.5 font-bold whitespace-nowrap">Alternate No</th>
                  <th className="px-3 py-3.5 font-bold whitespace-nowrap">Assigned Batteries</th>
                  <th className="px-3 py-3.5 font-bold whitespace-nowrap">Last Swap Date</th>
                  <th className="px-3 py-3.5 font-bold whitespace-nowrap">Last Swap Time</th>
                  <th className="px-3 py-3.5 text-center font-bold whitespace-nowrap">Idle Duration</th>
                  <th className="px-3 py-3.5 text-right font-bold whitespace-nowrap">Total Swaps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-[12px]">
                {swapAlertDrivers.filter(driver => selectedDriverIdsForExport.includes(driver.driver_id)).map(driver => {
                  const rawDate = driver.latest_swap?.last_swap_date || 0;
                  const lastSwapMs = rawDate > 100000000000 ? rawDate : rawDate * 1000;
                  const lastSwap = rawDate ? new Date(lastSwapMs) : null;
                  const daysSince = lastSwap ? Math.floor((fetchTime - lastSwap.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                  const assignedBats = driver.batteries?.map((b: any) => b.id).filter(Boolean).join(', ') || (driver as any).assignedBattery1 || '--';
                  
                  return (
                    <tr key={driver.driver_id} className="hover:bg-zinc-50/50">
                      <td className="px-3 py-3.5 font-bold text-zinc-900 uppercase tracking-tight whitespace-nowrap">
                        {driver.name || '--'}
                      </td>
                      <td className="px-3 py-3.5 text-center whitespace-nowrap text-zinc-400 font-semibold">
                        {driver.driver_id || '--'}
                      </td>
                      <td className="px-3 py-3.5 text-zinc-400 font-semibold whitespace-nowrap">
                        {driver.phone || '--'}
                      </td>
                      <td className="px-3 py-3.5 text-zinc-400 font-semibold whitespace-nowrap">
                        {driver.alt_phone || '--'}
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap text-zinc-900 font-semibold text-[11px]">
                        {assignedBats}
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap text-zinc-900 font-bold font-mono">
                        {lastSwap ? formatDate24(lastSwap) : '--'}
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap text-zinc-500 font-semibold font-mono">
                        {lastSwap ? formatTime24(lastSwap) : '--'}
                      </td>
                      <td className="px-3 py-3.5 text-center whitespace-nowrap text-[#f43f5e] font-bold">
                        {daysSince} Days
                      </td>
                      <td className="px-3 py-3.5 text-right whitespace-nowrap text-[#6366f1] font-bold">
                        {driver.total_swaps ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
     </div>
  );
};

export default AlertsPage;
