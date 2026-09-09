import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  MegaphoneIcon,
  ArrowPathIcon,
  WalletIcon,
  PhoneIcon,
  CalendarIcon,
  CalculatorIcon,
  CheckBadgeIcon,
  ExclamationTriangleIcon,
  BoltIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  TrashIcon,
  PlusIcon,
  TableCellsIcon,
  DocumentDuplicateIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  UserGroupIcon,
  ClipboardDocumentListIcon,
  MagnifyingGlassIcon,
  WrenchScrewdriverIcon,
  XMarkIcon,
  BuildingStorefrontIcon,
  BuildingOfficeIcon,
  PauseCircleIcon,
  TruckIcon,
  ArrowRightOnRectangleIcon,
  TicketIcon,
  ArchiveBoxArrowDownIcon,
  ArrowUpOnSquareIcon,
  ClipboardDocumentIcon,
  ReceiptPercentIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  AdjustmentsHorizontalIcon,
  ClockIcon,
  Battery50Icon,
  SignalIcon,
  CloudArrowUpIcon,
  ArrowDownTrayIcon,
  NoSymbolIcon,
  UserCircleIcon,
  MapPinIcon,
  CurrencyRupeeIcon,
  BellAlertIcon,
  ChatBubbleLeftRightIcon,
  PencilSquareIcon,
  PaperAirplaneIcon,
  ShareIcon,
} from "@heroicons/react/24/outline";
import { KazamBattery, BatteryIssue, KazamDriver, ISSUE_TYPES, UserRole, Station, StationGroup } from "../types";
import {
  db,
  auth,
  collection,
  doc,
  setDoc,
  onSnapshot,
  deleteDoc,
  addDoc,
  query,
  where,
  updateDoc,
  getDocs,
  getDoc,
  orderBy,
  writeBatch,
  getAuth,
  Firestore,
} from "@/lib/firebase";
import CustomSelect from "@/components/CustomSelect";
import { useBatteryData } from "@/hooks/useBatteryData";
import { getStoredBatteries, subscribeToBatteryReport, saveBatteryReport } from "@/lib/batteryReportStorage";
import SortableHeader from "@/components/SortableHeader";
import CopyButton from "@/components/CopyButton";
import PaginationFooter from "@/components/PaginationFooter";
import MapModal from "@/components/MapModal";

const CACHE_KEY = "bd_ops_batteries_cache_v3";
const INGESTION_CACHE_KEY = "bd_ops_ingestion_grid_v3";
const INGESTION_HEADERS = [
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

const INITIAL_GRID_SEED = [
  ["BI260500721", "swapping", "Vecmocon", "Vec_connected_bat", "Assigned", "De381192", "D394947", "Jharsa Sector 39", "AKASH PRASAD", "7275832758", "10/07/2026 06:31:33 PM", "69", "33", "28.43478966", "77.03842926", "100", "94", "53.08000183", "43", "03ea23291125825300000000", "000005869833085133951"],
  ["BI260300685", "swapping", "Vecmocon", "Vec_connected_bat", "Assigned", "De381192", "D534199", "Jharsa Sector 39", "KADAM 5", "9259486052", "09/07/2026 06:19:40 PM", "49", "24", "28.43152237", "77.0803299", "100", "43", "52.88", "42", "03ea23291125825300000001", "000005869833085133952"],
  ...Array.from({ length: 13 }, () => Array(21).fill(""))
];

const ALERTS_INGESTION_CACHE_KEY = "bd_ops_alerts_ingestion_grid_v3";
const UPLOADED_ALERTS_CACHE_KEY = "bd_ops_uploaded_alerts_list_v3";
const ALERTS_HEADERS = [
  "Device ID",
  "Serial Number",
  "Rule Name",
  "Start Time",
  "Breach Value",
  "End Breach Value"
];
const INITIAL_ALERTS_GRID_SEED = Array.from({ length: 15 }, () => Array(6).fill(""));

const parsePastedAlerts = (grid: string[][]): RawAlert[] => {
  const alerts: RawAlert[] = [];
  grid.forEach((row) => {
    const deviceId = row[0]?.trim();
    const serialNumber = row[1]?.trim();
    if (!deviceId && !serialNumber) return; // Skip empty rows

    alerts.push({
      deviceId: deviceId || "",
      serialNumber: serialNumber || "",
      ruleName: row[2]?.trim() || "Unknown Alert",
      startTime: row[3]?.trim() || "",
      breachValue: row[4]?.trim() || "",
      endBreachValue: row[5]?.trim() || "",
    });
  });
  return alerts;
};

const isValidDriverId = (id?: string, name?: string): boolean => {
  if (!id) return false;
  const cleanId = id.trim().toLowerCase();
  const invalidValues = [
    "", "n/a", "na", "n / a", "--", "-", "none", "null", "undefined", "unknown",
    "not assigned", "unassigned", "0", "no driver"
  ];
  if (invalidValues.includes(cleanId)) return false;

  if (name) {
    const cleanName = name.trim().toLowerCase();
    if (invalidValues.includes(cleanName) && (cleanId === "n/a" || cleanId === "na" || cleanId === "unknown")) {
      return false;
    }
  }
  return true;
};

const parsePastedBatteries = (grid: string[][]): KazamBattery[] => {
  const list: KazamBattery[] = [];
  grid.forEach((row) => {
    const batteryId = row[0]?.trim();
    if (!batteryId) return; // Skip empty rows

    const solution = row[1]?.trim() || "swapping";
    const make = row[2]?.trim() || "Unknown";
    const model = row[3]?.trim() || "Unknown";
    const statusStr = row[4]?.trim() || "Available";
    const stationId = row[5]?.trim() || "";
    const driverId = row[6]?.trim() || "";
    const stationName = row[7]?.trim() || "";
    const driverName = row[8]?.trim() || "";
    const driverMobile = row[9]?.trim() || "";
    const lastSwapped = row[10]?.trim() || "";
    const totalSwaps = parseInt(row[11]?.trim() || "0", 10) || 0;
    const chargeCycles = parseInt(row[12]?.trim() || "0", 10) || 0;
    const lat = parseFloat(row[13]?.trim() || "0") || 0;
    const lng = parseFloat(row[14]?.trim() || "0") || 0;
    const soh = parseFloat(row[15]?.trim() || "100") || 100;
    const soc = parseFloat(row[16]?.trim() || "100") || 100;
    const voltage = parseFloat(row[17]?.trim() || "0") || 0;
    const temp = parseFloat(row[18]?.trim() || "0") || 0;
    const bmsId = row[19]?.trim() || "";
    const iotId = row[20]?.trim() || "";

    // Map status string to status code: Available (0), Assigned (2), Error (3)
    let statusNum = 0;
    if (statusStr.toLowerCase() === "assigned") statusNum = 2;
    else if (statusStr.toLowerCase() === "error") statusNum = 3;
    else if (statusStr.toLowerCase() === "charging") statusNum = 4;

    const validDriver = isValidDriverId(driverId, driverName);
    const cleanDriverId = validDriver ? driverId : undefined;
    const cleanDriverName = validDriver ? (driverName || "Unknown") : undefined;
    const cleanDriverPhone = validDriver ? (driverMobile || "--") : undefined;

    list.push({
      _id: batteryId,
      id: batteryId,
      iot_id: iotId,
      bms_id: bmsId,
      make: make,
      model: model,
      status: statusNum,
      soc: soc,
      soh: soh,
      cycles: chargeCycles,
      charge_cycles: chargeCycles,
      voltage: voltage,
      temperature: temp,
      network: true,
      odometer: totalSwaps * 15,
      dealer_name: stationName,
      dealer_id: stationId,
      driver_id: cleanDriverId,
      driverData: cleanDriverId ? {
        id: cleanDriverId,
        name: cleanDriverName!,
        phone: cleanDriverPhone!
      } : undefined,
      location: {
        coordinates: [lng, lat]
      },
      last_updated_on: Date.now(),
      mosfet: {
        charging: statusNum === 4 ? 1 : 0,
        discharging: statusNum === 2 ? 1 : 0
      }
    });
  });
  return list;
};
const INACTIVE_IMPORT_HEADERS = ["Battery ID", "Location/Remark"];
const WATCHLIST_HEADERS = ["Battery ID", "Marked Date", "Notes/Action"];
const WALLET_REASONS = [
  "Attendance reward",
  "Penalty correction or reversal",
  "Service failure compensation",
  "Festive or seasonal bonus",
  "Top-up bonus",
  "Referral reward",
  "Performance incentive",
  "Dispute resolution",
  "Goodwill credit",
];
const DISPATCH_HEADERS = [
  "Battery ID",
  "IoT ID",
  "Manufacturer",
  "Issue Description",
  "Dispatch Date",
];
const RECEIVE_HEADERS = [
  "Battery ID",
  "Return Date",
  "Service Comments",
  "Remarks",
];

const sanitizeData = (data: any): any => {
  const seen = new WeakSet();
  const recursiveSanitize = (val: any): any => {
    if (val === null || typeof val !== "object") return val;
    if (seen.has(val)) return "[Circular]";
    if (val instanceof Date) return val.toISOString();
    if (typeof val.toDate === "function") return val.toDate().toISOString();
    const constructorName = val.constructor?.name || "";
    if (constructorName.length <= 3 && constructorName.match(/[A-Z].?\d?/))
      return undefined;
    seen.add(val);
    if (Array.isArray(val))
      return val.map(recursiveSanitize).filter((i) => i !== undefined);
    const result: any = {};
    for (const key in val) {
      if (Object.prototype.hasOwnProperty.call(val, key)) {
        if (
          key.startsWith("_") ||
          key === "firestore" ||
          key === "app" ||
          key === "auth"
        )
          continue;
        const sanitizedVal = recursiveSanitize(val[key]);
        if (sanitizedVal !== undefined) result[key] = sanitizedVal;
      }
    }
    return result;
  };
  return recursiveSanitize(data);
};

const safeStringify = (obj: any) => JSON.stringify(sanitizeData(obj));

interface RawAlert {
  deviceId: string;
  serialNumber: string;
  ruleName: string;
  startTime: string;
  breachValue: string;
  endBreachValue: string;
}
interface DriverBatteryMap {
  driverId: string;
  driverName: string;
  phone: string;
  bat1_id: string;
  bat1_iot: string;
  bat1_soc: number;
  bat1_discharging: boolean;
  bat1_last_updated: any;
  bat1_mosfet?: { charging: number; discharging: number };
  bat2_id: string;
  bat2_iot: string;
  bat2_soc: number;
  bat2_discharging: boolean;
  bat2_last_updated: any;
  bat2_mosfet?: { charging: number; discharging: number };
  isRepairedFailure: boolean;
  stationId?: string;
  stationName?: string;
  allStationIds?: string[];
  allStationNames?: string[];
}
interface MappedAlert extends DriverBatteryMap {
  status: string;
  alertBatteryId: string;
}
interface OperatorAlertItem {
  batteryId: string;
  iotId: string;
  ruleName: string;
  endBreachValue: string;
  stationName: string;
  status: string;
  soc: number;
  isCharging: boolean;
  last_updated_on: any;
  mosfet?: { charging: number; discharging: number };
  location?: any;
}
interface RepairedBattery {
  id: string;
  markedAt: string;
  notes?: string;
}
interface PlantRecord {
  id?: string;
  batteryId: string;
  iotId: string;
  manufacturer: string;
  issueDescription: string;
  dispatchDate: string;
  status: "Not Returned" | "Returned";
  returnDate?: string;
  serviceComments?: string;
  remarks?: string;
  createdAt: string;
}
interface AlertDriversPageProps {
  isDarkMode: boolean;
  db: Firestore;
  onBatterySelect?: (battery: KazamBattery) => void;
  role?: UserRole | string;
}

const parsePasteData = (
  text: string,
  currentData: string[][],
  startRow: number,
  startCol: number,
  totalCols: number,
) => {
  const rows = text.split(/\r\n|\n|\r/);
  if (rows.length === 0 || (rows.length === 1 && rows[0] === ""))
    return currentData;
  const newRowCount = Math.max(currentData.length, startRow + rows.length);
  const newData = Array.from({ length: newRowCount }, (_, i) =>
    currentData[i] ? [...currentData[i]] : Array(totalCols).fill(""),
  );
  rows.forEach((rowStr, rIdx) => {
    const currentRow = startRow + rIdx;
    let cells: string[] = [];
    if (rowStr.includes("\t")) {
      cells = rowStr.split("\t");
    } else if (
      rowStr.includes(",") &&
      totalCols > 1 &&
      !rowStr.startsWith('"')
    ) {
      cells = [rowStr];
    } else {
      cells = [rowStr];
    }
    cells.forEach((cellData, cIdx) => {
      const currentCol = startCol + cIdx;
      if (currentCol < totalCols) {
        newData[currentRow][currentCol] = cellData
          .trim()
          .replace(/^"|"$/g, "")
          .replace(/""/g, '"');
      }
    });
  });
  return newData;
};

const formatBreachValue = (val: string, rule: string) => {
  if (!val) return "--";
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  const formatted = num.toFixed(2);
  const ruleLower = (rule || "").toLowerCase();
  if (
    ruleLower.includes("min voltage") ||
    ruleLower.includes("min cell voltage")
  ) {
    return `${formatted} mV`;
  }
  if (ruleLower.includes("psm") || ruleLower.includes("deep discharge")) {
    return `${formatted} V`;
  }
  return formatted;
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
      <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-700 rounded-xl max-h-[400px]">
        <table className="w-full text-left text-xs border-collapse bg-white dark:bg-zinc-900 min-w-[800px]">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-950 sticky top-0 z-10 shadow-sm">
              <th className="w-10 p-2 border-r border-b border-zinc-200 dark:border-zinc-800 text-center text-zinc-400 font-mono">
                #
              </th>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="p-3 border-r border-b border-zinc-200 dark:border-zinc-800 font-bold uppercase text-zinc-500 dark:text-zinc-400 whitespace-nowrap"
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
                      className="p-0 border-r border-b border-zinc-200 dark:border-zinc-800 min-w-[150px]"
                    >
                      <input
                        id={`cell-${actualRowIdx}-${cIdx}`}
                        value={row[cIdx] || ""}
                        onChange={(e) =>
                          handleCellChange(displayIdx, cIdx, e.target.value)
                        }
                        onPaste={(e) => onPasteEvent(e, actualRowIdx, cIdx)}
                        className="w-full h-full px-3 py-2.5 bg-transparent outline-none focus:bg-indigo-50 dark:focus:bg-indigo-900/20 font-medium text-zinc-700 dark:text-zinc-200"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.length > pageSize && (
        <div className="flex items-center justify-between text-xs text-zinc-500 px-1 py-1">
          <span>
            Showing {startIndex + 1}-{Math.min(startIndex + pageSize, data.length)} of {data.length} rows
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded font-bold disabled:opacity-40"
            >
              Prev
            </button>
            <span className="font-semibold">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded font-bold disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const exportToCSV = (data: any[], filename: string, headers: string[]) => {
  if (!data || !data.length) return;
  const upperHeaders = headers.map((h) => h.toUpperCase());
  const csvContent = [
    upperHeaders.join(","),
    ...data.map((row) =>
      headers
        .map((fieldName) => {
          let val = row[fieldName] || "";
          if (
            typeof val === "string" &&
            (val.includes(",") || val.includes("\n"))
          ) {
            val = `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(","),
    ),
  ].join("\n");
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename.toUpperCase()}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const AlertDriversPage: React.FC<AlertDriversPageProps> = ({
  isDarkMode,
  db,
  onBatterySelect,
  role,
}) => {
  const { getAllBatteries, updateBatteryStatus, getAllDealers } = useBatteryData();
  const [allBatteries, setAllBatteries] = useState<KazamBattery[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [stationGroups, setStationGroups] = useState<StationGroup[]>([]);
  const [selectedFleetCityGroup, setSelectedFleetCityGroup] = useState<string>("all");
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedStationsForGroup, setSelectedStationsForGroup] = useState<string[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const auth = { currentUser: { email: "operator@batterydost.com", displayName: "Operator User" } };
  const { tab: urlTab } = useParams();
  const navigate = useNavigate();
  const activeTab = useMemo(() => (urlTab || "ingestion") as
    | "ingestion"
    | "actionable"
    | "operator"
    | "station_issues"
    | "fleet"
    | "swap_alerts", [urlTab]);

  const setActiveTab = (newTab: string) => navigate(`/alert-drivers/${newTab}`);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>(null);
  const [ingestionType, setIngestionType] = useState<"battery" | "alerts">("battery");
  const [inputMode, setInputMode] = useState<"paste" | "upload">("paste");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [gridData, setGridData] = useState<string[][]>(() => {
    try {
      const saved = localStorage.getItem(INGESTION_CACHE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0 && parsed[0].length === 21) {
          return parsed;
        }
      }
    } catch (e) {}
    return INITIAL_GRID_SEED;
  });

  const [alertsGridData, setAlertsGridData] = useState<string[][]>(() => {
    try {
      const saved = localStorage.getItem(ALERTS_INGESTION_CACHE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0 && parsed[0].length === 6) {
          return parsed;
        }
      }
    } catch (e) {}
    return INITIAL_ALERTS_GRID_SEED;
  });

  const [uploadedAlerts, setUploadedAlerts] = useState<RawAlert[]>(() => {
    try {
      const saved = localStorage.getItem(UPLOADED_ALERTS_CACHE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {}
    return [];
  });
  const [isManualPasteOpen, setIsManualPasteOpen] = useState(false);
  const [manualPasteText, setManualPasteText] = useState("");
  const [toast, setToast] = useState<{ show: boolean; message: string }>({
    show: false,
    message: "",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [stationIssueViewMode, setStationIssueViewMode] = useState<
    "raised" | "errors"
  >("raised");
  const [tabStationFilter, setTabStationFilter] = useState("all");
  const [tabStatusFilter, setTabStatusFilter] = useState("all");
  const [actionableRuleFilter, setActionableRuleFilter] = useState<string[]>([]);

  useEffect(() => {
    setSortConfig(null);
    setCurrentPage(1);
    setFleetShowOnlyWithIssues(false);
    setFleetShowCriticalOnly(false);
    setFleetShowSingleBatteryOnly(false);
    setFleetMosfetChargingFilter('all');
    setFleetMosfetDischargingFilter('all');
    setActionableRuleFilter([]);
    setOperatorRuleFilter([]);
    setOperatorStationFilter([]);
    if (activeTab !== "ingestion") {
      fetchBatteries();
    }
  }, [activeTab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(INGESTION_CACHE_KEY, JSON.stringify(gridData));
      } catch (e) {
        console.warn("Failed to cache grid data", e);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [gridData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(ALERTS_INGESTION_CACHE_KEY, JSON.stringify(alertsGridData));
      } catch (e) {
        console.warn("Failed to cache alerts grid data", e);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [alertsGridData]);

  useEffect(() => {
    try {
      localStorage.setItem(UPLOADED_ALERTS_CACHE_KEY, JSON.stringify(uploadedAlerts));
    } catch (e) {
      console.warn("Failed to cache uploaded alerts list", e);
    }
  }, [uploadedAlerts]);

  const [mappedDrivers, setMappedDrivers] = useState<MappedAlert[]>([]);
  const [operatorAlertsList, setOperatorAlertsList] = useState<
    OperatorAlertItem[]
  >([]);
  const [fullFleetList, setFullFleetList] = useState<DriverBatteryMap[]>([]);
  const [fleetShowOnlyWithIssues, setFleetShowOnlyWithIssues] = useState(false);
  const [fleetShowCriticalOnly, setFleetShowCriticalOnly] = useState(false);
  const [fleetShowSingleBatteryOnly, setFleetShowSingleBatteryOnly] = useState(false);
  const [fleetMosfetChargingFilter, setFleetMosfetChargingFilter] = useState<'all' | 'on' | 'off'>('all');
  const [fleetMosfetDischargingFilter, setFleetMosfetDischargingFilter] = useState<'all' | 'on' | 'off'>('all');
  const [operatorRuleFilter, setOperatorRuleFilter] = useState<string[]>([]);
  const [operatorStationFilter, setOperatorStationFilter] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stationIssues, setStationIssues] = useState<BatteryIssue[]>([]);
  const [mapProps, setMapProps] = useState<{
    isOpen: boolean;
    coordinates?: [number, number];
    title: string;
    subtitle?: string;
  }>({
    isOpen: false,
    title: "",
  });
  const [exportWithOccurrence, setExportWithOccurrence] = useState(false);
  const [activeIssuesMap, setActiveIssuesMap] = useState<
    Record<string, BatteryIssue>
  >({});
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [selectedBatteryIdForIssue, setSelectedBatteryIdForIssue] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [mainIssueDescription, setMainIssueDescription] = useState<string>(ISSUE_TYPES[0]);
  const [subIssueDescription, setSubIssueDescription] = useState("");
  const [markAsError, setMarkAsError] = useState(false);
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);
  const [socAtOccurrence, setSocAtOccurrence] = useState<number>(100);
  const [manualRemovalFactor, setManualRemovalFactor] = useState<string>("100%");
  const [raiseIssueSocThreshold, setRaiseIssueSocThreshold] = useState<number>(35);

  // Proactive Swap Alerts State
  const [globalSwapSocThreshold, setGlobalSwapSocThreshold] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("bd_ops_issue_swap_threshold");
      if (saved) return Number(saved) || 35;
    } catch (e) {}
    return 35;
  });
  const [batteryThresholdOverrides, setBatteryThresholdOverrides] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem("bd_ops_battery_soc_threshold_overrides");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });
  const [notifiedLogs, setNotifiedLogs] = useState<Record<string, {
    timestamp: string;
    driverId: string;
    driverName: string;
    batteryId: string;
    channel: "whatsapp" | "call" | "manual" | "share";
  }>>(() => {
    try {
      const saved = localStorage.getItem("bd_ops_driver_notified_log");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });

  const [fleetShowBreachedOnly, setFleetShowBreachedOnly] = useState(false);
  const [swapAlertsFilterStatus, setSwapAlertsFilterStatus] = useState<"all" | "pending" | "notified">("all");
  const [selectedSwapAlertCityGroup, setSelectedSwapAlertCityGroup] = useState<string>("all");

  // Modals for Driver Notification & Threshold setting
  const [isNotifyModalOpen, setIsNotifyModalOpen] = useState(false);
  const [notificationDriver, setNotificationDriver] = useState<DriverBatteryMap | null>(null);
  const [notificationBreach, setNotificationBreach] = useState<{
    batteryId: string;
    iotId: string;
    currentSoc: number;
    socThreshold: number;
    issueDescription: string;
    stationName: string;
  } | null>(null);
  const [notificationMessageText, setNotificationMessageText] = useState("");

  const [isSetThresholdModalOpen, setIsSetThresholdModalOpen] = useState(false);
  const [targetBatteryForThreshold, setTargetBatteryForThreshold] = useState<{
    batteryId: string;
    currentThreshold: number;
    currentSoc: number;
    issueType: string;
  } | null>(null);
  const [customThresholdInput, setCustomThresholdInput] = useState<number>(35);

  const getRemovalRecommendation = useCallback((
    issueType: string,
    isOnline: boolean,
    socVal: number
  ) => {
    if (!isOnline) {
      return {
        percent: null,
        message: "Battery is Offline. Operator must decide removal manually.",
        isAuto: false
      };
    }

    const normalizedType = String(issueType).trim().toLowerCase();
    
    const issues100 = [
      'buzzer beeping',
      'buzzer is beeping',
      'iot offline',
      'e5 error',
      'e3 error',
      'ce error',
      'fota',
      'uv + ov'
    ];

    if (issues100.includes(normalizedType)) {
      return {
        percent: 100,
        message: "100% Critical Issue - Recommended to remove from network instantly.",
        isAuto: true
      };
    }

    const UV_issues = [
      'uv issue',
      'uv issue observed again'
    ];

    if (UV_issues.includes(normalizedType)) {
      const soc = typeof socVal === "number" ? socVal : 0;
      if (soc > 50) {
        return {
          percent: 100,
          message: `100% Removal recommended - SoC at occurrence is ${soc}% (> 50%).`,
          isAuto: true
        };
      } else if (soc >= 25 && soc <= 50) {
        return {
          percent: 80,
          message: `80% Removal recommended - SoC at occurrence is ${soc}% (25% to 50%).`,
          isAuto: true
        };
      } else if (soc >= 15 && soc < 25) {
        return {
          percent: 50,
          message: `50% Removal recommended - SoC at occurrence is ${soc}% (15% to 25%).`,
          isAuto: true
        };
      } else {
        return {
          percent: 20,
          message: `20% Removal recommended - SoC at occurrence is ${soc}% (< 15%).`,
          isAuto: true
        };
      }
    }

    return {
      percent: null,
      message: "Standard issue type. Removal check is optional.",
      isAuto: false
    };
  }, []);

  // History Modal State
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedBatteryForHistory, setSelectedBatteryForHistory] = useState<string | null>(null);
  const [allOpenIssues, setAllOpenIssues] = useState<BatteryIssue[]>([]);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [plantGridData, setPlantGridData] = useState<string[][]>(
    Array.from({ length: 10 }, () => Array(5).fill("")),
  );
  const [plantRegister, setPlantRegister] = useState<PlantRecord[]>([]);
  const [isPlantProcessing, setIsPlantProcessing] = useState(false);
  const [plantSearch, setPlantSearch] = useState("");
  const [plantFilterStatus, setPlantFilterStatus] = useState<
    "All" | "Returned" | "Not Returned"
  >("All");
  const [repairedList, setRepairedList] = useState<RepairedBattery[]>([]);
  const [isWatchlistModalOpen, setIsWatchlistModalOpen] = useState(false);
  const [watchlistGridData, setWatchlistGridData] = useState<string[][]>(
    Array.from({ length: 10 }, () => Array(3).fill("")),
  );
  const [isWatchlistProcessing, setIsWatchlistProcessing] = useState(false);
  const [watchlistSearchQuery, setWatchlistSearchQuery] = useState("");
  const [showFleetFilters, setShowFleetFilters] = useState(false);
  const fleetFiltersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      if (fleetFiltersRef.current && !fleetFiltersRef.current.contains(event.target as Node)) {
        setShowFleetFilters(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  const [isInactiveImportOpen, setIsInactiveImportOpen] = useState(false);
  const [inactiveImportGrid, setInactiveImportGrid] = useState<string[][]>(
    Array.from({ length: 10 }, () => Array(2).fill("")),
  );
  const [isInactiveImporting, setIsInactiveImporting] = useState(false);

  // Recharge Modal State
  const [isRechargeModalOpen, setIsRechargeModalOpen] = useState(false);
  const [rechargeDriverId, setRechargeDriverId] = useState("");
  const [rechargeDriverName, setRechargeDriverName] = useState("");

  // Penalty Modal State
  const [isPenaltyModalOpen, setIsPenaltyModalOpen] = useState(false);
  const [penaltyDriverId, setPenaltyDriverId] = useState("");
  const [penaltyData, setPenaltyData] = useState<any>(null);
  const [isLoadingPenalties, setIsLoadingPenalties] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [driverStatusLoading, setDriverStatusLoading] = useState(false);
  const [currentDriverActive, setCurrentDriverActive] = useState<boolean | null>(null);

  // Swap History Modal State
  const [isSwapHistoryModalOpen, setIsSwapHistoryModalOpen] = useState(false);
  const [swapHistoryDriverId, setSwapHistoryDriverId] = useState("");
  const [swapHistoryDriverName, setSwapHistoryDriverName] = useState("");
  const [swapHistoryData, setSwapHistoryData] = useState<any[]>([]);
  const [isLoadingSwapHistory, setIsLoadingSwapHistory] = useState(false);
  const [selectedStationCalcSession, setSelectedStationCalcSession] = useState<any | null>(null);

  // States for Calculator Combined Wallet Action Modal
  const [isCalcWalletModalOpen, setIsCalcWalletModalOpen] = useState(false);
  const [calcInitialAmount, setCalcInitialAmount] = useState("");

  // Wallet History Modal State
  const [isWalletHistoryModalOpen, setIsWalletHistoryModalOpen] = useState(false);
  const [walletHistoryDriverId, setWalletHistoryDriverId] = useState("");
  const [walletHistoryData, setWalletHistoryData] = useState<any[]>([]);
  const [isLoadingWalletHistory, setIsLoadingWalletHistory] = useState(false);

  const { 
    getDriverLeaveAndPenaltyDetails, 
    walletUpdate,
    getDriverSwappingSessions,
    getDriverWalletHistory,
    updateDriver
  } = useBatteryData();

  useEffect(() => {
    const stationsMap = new Map<string, Station>();
    allBatteries.forEach(b => {
      if (b.dealer_id && b.dealer_name) {
        stationsMap.set(b.dealer_id, {
          _id: b.dealer_id,
          id: b.dealer_id,
          dealer_id: b.dealer_id,
          name: b.dealer_name,
          location: b.location?.coordinates ? [b.location.coordinates[1], b.location.coordinates[0]] : [28.43, 77.03],
          active: true,
          total_battries: 1,
          battery_status: { available: 0, charging: 0, assigned: 0, lowsoc: 0, error: 0, all: 1 },
          total_swaps: b.odometer ? Math.floor(b.odometer / 15) : 0,
          total_revenue: 0,
          cash_revenue: 0,
          wallet_revenue: 0,
          last_active: Date.now()
        });
      }
    });
    setStations(Array.from(stationsMap.values()));
  }, [allBatteries]);

  useEffect(() => {
    const q = query(
      collection(db, "station_groups"), 
      where("type", "==", "fleet_city")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const groups = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as StationGroup));
      setStationGroups(groups);
    });
    return () => unsub();
  }, []);

  const createGroup = async () => {
    if (!newGroupName.trim() || selectedStationsForGroup.length === 0) {
      alert("Please enter a group name and select stations");
      return;
    }
    try {
      const selectedStations = stations.filter(s => selectedStationsForGroup.includes(s.id));
      await addDoc(collection(db, "station_groups"), {
        name: newGroupName.trim(),
        stationIds: selectedStationsForGroup,
        stationNames: selectedStations.map(s => s.name),
        type: 'fleet_city',
        createdAt: new Date().toISOString()
      });
      setNewGroupName('');
      setSelectedStationsForGroup([]);
      setShowGroupModal(false);
      showToast("City Group created!");
    } catch (err) {
      console.error(err);
      showToast("Failed to create group");
    }
  };

  const deleteGroup = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this city group?")) return;
    try {
      await deleteDoc(doc(db, "station_groups", id));
      if (selectedFleetCityGroup === id) setSelectedFleetCityGroup('all');
      showToast("Group deleted.");
    } catch (err) {
      console.error(err);
    }
  };

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (
      sortConfig &&
      sortConfig.key === key &&
      sortConfig.direction === "asc"
    ) {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };
  const sortData = <T extends any>(data: T[]): T[] => {
    if (!sortConfig) return data;
    return [...data].sort((a, b) => {
      const getNestedValue = (obj: any, path: string) => {
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
  };

  const fetchBatteries = async (): Promise<KazamBattery[] | null> => {
    if (loadingData) return null;
    setLoadingData(true);
    try {
      const data = getStoredBatteries();
      setAllBatteries(data);
      generateFullFleetList(data, repairedList);
      processAlerts(data);
      return data;
    } catch (err) {
      console.error("Failed to fetch batteries", err);
    } finally {
      setLoadingData(false);
    }
    return null;
  };

  const generateFullFleetList = (
    batteries: KazamBattery[],
    repairs: RepairedBattery[],
  ) => {
    if (!batteries.length) {
      setFullFleetList([]);
      return;
    }
    const driverMap: Record<string, KazamBattery[]> = {};
    batteries.forEach((b) => {
      if (b.driver_id && isValidDriverId(b.driver_id, b.driverData?.name)) {
        if (!driverMap[b.driver_id]) driverMap[b.driver_id] = [];
        driverMap[b.driver_id].push(b);
      }
    });
    const fleet: DriverBatteryMap[] = [];
    Object.keys(driverMap).forEach((driverId) => {
      const driverBatteries = driverMap[driverId];
      driverBatteries.sort((a, b) => a.id.localeCompare(b.id));
      const bat1 = driverBatteries[0];
      const bat2 = driverBatteries[1];
      if (bat1) {
        const driverName = bat1.driverData?.name || "Unknown";
        if (!isValidDriverId(driverId, driverName)) return;

        const isRepairedFailure = driverBatteries.some((b) =>
          repairs.some((r) => r.id === b.id),
        );
        fleet.push({
          driverId: driverId,
          driverName: driverName,
          phone: bat1.driverData?.phone || "--",
          bat1_id: bat1.id,
          bat1_iot: bat1.iot_id || "--",
          bat1_soc: bat1.soc ?? 0,
          bat1_discharging: bat1.mosfet?.discharging === 1,
          bat1_last_updated: bat1.last_updated_on,
          bat1_mosfet: bat1.mosfet,
          bat2_id: bat2?.id || "",
          bat2_iot: bat2?.iot_id || "",
          bat2_soc: bat2 ? (bat2.soc ?? 0) : 0,
          bat2_discharging: bat2?.mosfet?.discharging === 1,
          bat2_last_updated: bat2?.last_updated_on || "",
          bat2_mosfet: bat2?.mosfet,
          isRepairedFailure,
          stationId: bat1.dealer_id || "",
          stationName: bat1.dealer_name || "Unknown",
          allStationIds: driverBatteries.map(b => b.dealer_id || "").filter(Boolean),
          allStationNames: driverBatteries.map(b => b.dealer_name || "").filter(Boolean),
        });
      }
    });
    setFullFleetList(fleet);
  };

  useEffect(() => {
    const loadInitialData = () => {
      const data = getStoredBatteries();
      setAllBatteries(data);
      generateFullFleetList(data, repairedList);
      processAlerts(data);
    };
    loadInitialData();

    const unsubscribe = subscribeToBatteryReport(() => {
      loadInitialData();
    });
    return () => unsubscribe();
  }, [repairedList]);

  useEffect(() => {
    const unsubIssues = onSnapshot(
      collection(db, "battery_issues"),
      (snapshot) => {
        const issues: BatteryIssue[] = [];
        const map: Record<string, BatteryIssue> = {};
        snapshot.docs.forEach((d) => {
          const raw = d.data();
          const status = (raw.status || "").toLowerCase();
          if (status === "resolved" || status === "closed") return;
          const data: BatteryIssue = {
            id: d.id,
            batteryId: raw.batteryId,
            stationId: raw.stationId,
            mainDescription: raw.mainDescription || raw.issueType || 'Other',
            subDescription: raw.subDescription || raw.description || '',
            issueType: raw.issueType || raw.mainDescription || 'Other',
            raisedBy: raw.raisedBy,
            raisedByName: raw.raisedByName,
            raisedByRole: raw.raisedByRole,
            createdAt: raw.createdAt,
            status: "Open",
            occurrenceCount: raw.occurrenceCount || 1,
            occurrenceDates: raw.occurrenceDates || [raw.createdAt],
            lastOccurrenceAt: raw.lastOccurrenceAt || raw.createdAt,
            currentLocationContext: raw.currentLocationContext || 'Station',
            verifiedBy: raw.verifiedBy,
            verifiedAt: raw.verifiedAt,
            resolvedAt: raw.resolvedAt,
            resolvedBy: raw.resolvedBy,
            removalFactor: raw.removalFactor,
            removalRecommendation: raw.removalRecommendation,
            isOnlineAtRaise: raw.isOnlineAtRaise,
            swapAlertSocThreshold: raw.swapAlertSocThreshold !== undefined && raw.swapAlertSocThreshold !== null ? Number(raw.swapAlertSocThreshold) : undefined,
          };
          issues.push(data);
          if (map[data.batteryId]) {
            map[data.batteryId].occurrenceCount += data.occurrenceCount;
          } else {
            map[data.batteryId] = { ...data };
          }
        });
        setAllOpenIssues(issues);
        setStationIssues(issues);
        setActiveIssuesMap(map);
      },
    );
    // Load plant register from localStorage instead of Firestore database
    const loadPlantRegister = () => {
      const saved = localStorage.getItem('battery_plant_dispatch_register');
      if (saved) {
        try {
          const list = JSON.parse(saved) as PlantRecord[];
          list.sort((a, b) => (b.dispatchDate || '').localeCompare(a.dispatchDate || ''));
          setPlantRegister(list);
        } catch (e) {
          setPlantRegister([]);
        }
      } else {
        setPlantRegister([]);
      }
    };

    loadPlantRegister();

    const handleStorageEvent = () => {
      loadPlantRegister();
    };

    window.addEventListener('storage', handleStorageEvent);

    return () => {
      unsubIssues();
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [db]);

  useEffect(() => {
    if (allBatteries.length > 0)
      generateFullFleetList(allBatteries, repairedList);
  }, [repairedList]);

  const showToast = (message: string) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 4000);
  };
  const handlePasteEvent = (
    e: React.ClipboardEvent,
    rIdx: number,
    cIdx: number,
    targetSetState: any,
    targetData: any,
    cols: number,
  ) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    if (!text) return;
    const newData = parsePasteData(text, targetData, rIdx, cIdx, cols);
    targetSetState(newData);
    showToast("Data pasted successfully!");
  };
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        if (!rawJson || rawJson.length === 0) {
          showToast("The uploaded file is empty.");
          return;
        }

        // Convert 2D array to strings, skip header row if they matched the headers exactly
        let startRow = 0;
        const firstRowStr = rawJson[0].map(c => String(c || "").trim().toLowerCase());
        
        // Check if the first row is a header row
        const isHeaderBattery = firstRowStr.includes("battery id") || firstRowStr.includes("battery_id") || firstRowStr.includes("solution");
        const isHeaderAlerts = firstRowStr.includes("device id") || firstRowStr.includes("device_id") || firstRowStr.includes("serial number") || firstRowStr.includes("rule name");
        
        if (isHeaderBattery || isHeaderAlerts) {
          startRow = 1;
        }

        const expectedCols = ingestionType === "battery" ? 21 : 6;
        const parsedRows: string[][] = [];

        for (let i = startRow; i < rawJson.length; i++) {
          const rawRow = rawJson[i];
          // Skip completely empty rows
          if (!rawRow || rawRow.every(cell => cell === null || cell === undefined || String(cell).trim() === "")) {
            continue;
          }
          const formattedRow = Array.from({ length: expectedCols }).map((_, colIdx) => {
            const cellVal = rawRow[colIdx];
            return cellVal !== undefined && cellVal !== null ? String(cellVal).trim() : "";
          });
          parsedRows.push(formattedRow);
        }

        if (parsedRows.length === 0) {
          showToast("No valid rows found in the uploaded file.");
          return;
        }

        // Pad with empty rows to make it look nice in the grid if small
        const targetGrid = [...parsedRows];
        const minRows = 15;
        if (targetGrid.length < minRows) {
          const emptyCount = minRows - targetGrid.length;
          for (let i = 0; i < emptyCount; i++) {
            targetGrid.push(Array(expectedCols).fill(""));
          }
        }

        if (ingestionType === "battery") {
          setGridData(targetGrid);
          showToast(`Successfully parsed ${parsedRows.length} batteries! Data loaded into grid.`);
        } else {
          setAlertsGridData(targetGrid);
          showToast(`Successfully parsed ${parsedRows.length} alerts! Data loaded into grid.`);
        }
      } catch (err) {
        console.error("Error parsing file", err);
        showToast("Error parsing file. Please make sure it is a valid Excel or CSV file.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleIngestionPasteButton = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        if (ingestionType === "battery") {
          const newData = parsePasteData(text, gridData, 0, 0, 21);
          setGridData(newData);
        } else {
          const newData = parsePasteData(text, alertsGridData, 0, 0, 6);
          setAlertsGridData(newData);
        }
        showToast("Clipboard data pasted!");
      } else {
        throw new Error("Empty");
      }
    } catch (err) {
      showToast("Opening manual input...");
      setIsManualPasteOpen(true);
    }
  };
  const handleManualPasteSubmit = () => {
    if (!manualPasteText.trim()) return;
    if (ingestionType === "battery") {
      const newData = parsePasteData(manualPasteText, gridData, 0, 0, 21);
      setGridData(newData);
    } else {
      const newData = parsePasteData(manualPasteText, alertsGridData, 0, 0, 6);
      setAlertsGridData(newData);
    }
    setManualPasteText("");
    setIsManualPasteOpen(false);
    showToast("Data imported manually!");
  };
  const clearGrid = () => {
    if (ingestionType === "battery") {
      const empty = Array.from({ length: 15 }, () => Array(21).fill(""));
      setGridData(empty);
      localStorage.removeItem(INGESTION_CACHE_KEY);
      showToast("Cleared battery grid.");
    } else {
      const empty = Array.from({ length: 15 }, () => Array(6).fill(""));
      setAlertsGridData(empty);
      localStorage.removeItem(ALERTS_INGESTION_CACHE_KEY);
      showToast("Cleared custom alerts grid.");
    }
  };

  const formatDisplayDate = (ts: any) => {
    if (!ts) return "--";
    const ms =
      typeof ts === "number"
        ? ts > 100000000000
          ? ts
          : ts * 1000
        : new Date(ts).getTime();
    if (isNaN(ms) || ms === 0) return "--";
    return new Date(ms).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };
  const formatDisplayTime = (ts: any) => {
    if (!ts) return "--";
    const ms =
      typeof ts === "number"
        ? ts > 100000000000
          ? ts
          : ts * 1000
        : new Date(ts).getTime();
    if (isNaN(ms) || ms === 0) return "--";
    return new Date(ms).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getDetailedStatus = (bat?: any, ticket?: BatteryIssue) => {
    if (!bat)
      return ticket?.currentLocationContext === "With Driver"
        ? "ASSIGNED"
        : "UNKNOWN";
    if (bat.status === 3) return "ERROR";
    if (
      bat.driver_id ||
      (bat.driverData && (bat.driverData.name || bat.driverData.id)) ||
      ticket?.currentLocationContext === "With Driver"
    )
      return "ASSIGNED";
    const isCharging =
      bat.charge_state === 1 || (bat.mosfet && bat.mosfet.charging === 1);
    if (isCharging) return "CHARGING";
    if (bat.soc < 20 || bat.status === 4) return "LOW SOC";
    return "AVAILABLE";
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

  const handleExportStationIssues = () => {
    let exportList = [];
    let headers = [
      "battery id",
      "iot id",
      "status",
      "station name",
      "issue description",
      "sub description",
      "recurring fault",
      "issue raise date",
      "issue raise time",
      "last swap date",
      "last update date",
    ];

    if (exportWithOccurrence) {
      // Export latest issue per battery with occurrence count from the current view
      exportList = sortedStationIssues.map((item) => {
        return {
          "battery id": item.id,
          "iot id": item.iot_id || "--",
          status: getDetailedStatus(item, item.ticket),
          "station name": item.dealer_name || "Hub",
          "issue description": item.ticket?.mainDescription || item.ticket?.issueType || "--",
          "sub description": item.ticket?.subDescription || "--",
          "recurring fault": repairedList.some(r => r.id === item.id) ? "Yes" : "No",
          "occurrence": item.occurrenceCount || 0,
          "latest issue date": formatDisplayDate(item.ticket?.createdAt),
          "latest issue time": formatDisplayTime(item.ticket?.createdAt),
          "last swap date": formatDisplayDate(item.lastSwapDate),
          "last update date": formatDisplayDate(item.last_updated_on),
        };
      });
      
      exportToCSV(exportList, "latest_station_issues_summary", [
        "battery id",
        "iot id",
        "status",
        "station name",
        "issue description",
        "sub description",
        "recurring fault",
        "occurrence",
        "latest issue date",
        "latest issue time",
        "last swap date",
        "last update date",
      ]);
    } else {
      // Current behavior: export all tickets (only Open ones)
      exportList = [...stationIssues]
        .filter((t) => t.status === "Open")
        .sort((a, b) => {
          if (a.batteryId !== b.batteryId) return a.batteryId.localeCompare(b.batteryId);
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })
        .map((ticket) => {
          const liveBat = allBatteries.find((b) => b.id === ticket.batteryId);
          return {
            "battery id": ticket.batteryId,
            "iot id": liveBat?.iot_id || "--",
            status: getDetailedStatus(liveBat, ticket),
            "station name": liveBat?.dealer_name || "Hub",
            "issue description": ticket.mainDescription || ticket.issueType || "--",
            "sub description": ticket.subDescription || "--",
            "recurring fault": repairedList.some(r => r.id === ticket.batteryId) ? "Yes" : "No",
            "issue raise date": formatDisplayDate(ticket.createdAt),
            "issue raise time": formatDisplayTime(ticket.createdAt),
            "last swap date": formatDisplayDate(liveBat?.batteryHistory?.timestamp || liveBat?.last_swap_on || 0),
            "last update date": formatDisplayDate(liveBat?.last_updated_on),
          };
        });

      exportToCSV(exportList, "station_issues_export", headers);
    }
  };

  const handleExportInactiveStock = () => {
    const data = sortedInactiveBatteries.map((item) => {
      const liveBat = allBatteries.find((b) => b.id === item.id);
      return {
        "battery id": item.id,
        "iot id": item.iot_id || "--",
        "current location": item.currentLocation || "Unknown",
        status: getDetailedStatus(liveBat || item, item.ticket),
        "active issue": item.ticket?.subDescription || item.ticket?.mainDescription || "--",
        "last update": formatDisplayDate(item.last_updated_on),
      };
    });
    exportToCSV(data, "inactive_stock_export", [
      "battery id",
      "iot id",
      "current location",
      "status",
      "active issue",
      "last update",
    ]);
  };

  const handleExportPlantRegister = () => {
    const data = sortedPlantRegister.map((item) => ({
      "battery id": item.batteryId,
      issue: item.issueDescription,
      "dispatch date": item.dispatchDate,
      "service comments": item.serviceComments || "--",
      "return date": item.returnDate || "--",
      status: item.status,
      remark: item.remarks || "--",
    }));
    exportToCSV(data, "plant_register_export", [
      "battery id",
      "issue",
      "dispatch date",
      "service comments",
      "return date",
      "status",
      "remark",
    ]);
  };

  const handleExportWatchlist = () => {
    const data = sortedWatchlist.map((item) => {
      const liveBat = allBatteries.find((b) => b.id === item.id);
      return {
        "battery id": item.id,
        "iot id": liveBat?.iot_id || "--",
        "marked date": item.markedAt,
        "notes/action": item.notes || "--",
      };
    });
    exportToCSV(data, "watchlist_export", [
      "battery id",
      "iot id",
      "marked date",
      "notes/action",
    ]);
  };

  const handleBulkMarkError = async () => {
    const eligibleBatteriesAtStation = sortedStationIssues.filter((bat) => {
      const detailed = getDetailedStatus(bat, bat.ticket);
      return detailed !== "ASSIGNED" && detailed !== "ERROR";
    });
    if (eligibleBatteriesAtStation.length === 0) {
      showToast("No eligible batteries found at station to mark as Error.");
      return;
    }
    if (
      !window.confirm(
        `Mark ${eligibleBatteriesAtStation.length} batteries at station as 'ERROR' (Status 3)?`,
      )
    )
      return;
    setIsProcessing(true);
    let successCount = 0;
    for (const bat of eligibleBatteriesAtStation) {
      try {
        const json = await updateBatteryStatus(bat.id, 3);
        if (json.success || json.status === "success") successCount++;
      } catch (err) {
        console.error(`Failed to mark ${bat.id}`, err);
      }
    }
    await fetchBatteries();
    setIsProcessing(false);
    showToast(`Successfully marked ${successCount} batteries as Error.`);
  };

  const processAlerts = (freshBats?: KazamBattery[], freshAlerts?: RawAlert[]) => {
    const batsToUse = freshBats || allBatteries;
    const alertsToUse = freshAlerts !== undefined ? freshAlerts : uploadedAlerts;
    const driverResults: MappedAlert[] = [];
    const operatorAlertsListTemp: OperatorAlertItem[] = [];

    // Group batteries by driver
    const driverMap: Record<string, KazamBattery[]> = {};
    batsToUse.forEach((b) => {
      if (b.driver_id && isValidDriverId(b.driver_id, b.driverData?.name)) {
        if (!driverMap[b.driver_id]) driverMap[b.driver_id] = [];
        driverMap[b.driver_id].push(b);
      }
    });

    const processedDrivers = new Set<string>();
    const seenAlertKeys = new Set<string>();

    const alertsToProcess: {
      batteryId: string;
      iotId: string;
      ruleName: string;
      endBreachValue: string;
      battery: KazamBattery;
    }[] = [];

    // 1. Process genuine uploaded/ingested alerts matching batteries (if any)
    if (alertsToUse && alertsToUse.length > 0) {
      alertsToUse.forEach((alert) => {
        const targetBat = batsToUse.find(
          (b) =>
            (b.iot_id && b.iot_id.trim() === alert.deviceId?.trim()) ||
            (b.id && b.id.trim() === alert.serialNumber?.trim()) ||
            ((b as any).manufacturer_sr_no && (b as any).manufacturer_sr_no.trim() === alert.serialNumber?.trim())
        );
        if (targetBat) {
          const key = `${targetBat.id}_${alert.ruleName}`;
          if (!seenAlertKeys.has(key)) {
            seenAlertKeys.add(key);
            alertsToProcess.push({
              batteryId: targetBat.id,
              iotId: targetBat.iot_id || "--",
              ruleName: alert.ruleName,
              endBreachValue: alert.endBreachValue || alert.breachValue || "Breach",
              battery: targetBat
            });
          }
        }
      });

      // Operator Alerts tab receives ONLY genuine ingested alerts
      alertsToProcess.forEach(({ batteryId, iotId, ruleName, endBreachValue, battery: b }) => {
        let stationDisplay = b.dealer_name || (b.driverData ? "With Driver" : "Not Assigned");

        operatorAlertsListTemp.push({
          batteryId: b.id,
          iotId: b.iot_id || "--",
          ruleName: ruleName,
          endBreachValue: endBreachValue,
          stationName: stationDisplay,
          status: getDetailedStatus(b),
          soc: b.soc,
          isCharging: b.mosfet?.charging === 1,
          last_updated_on: b.last_updated_on,
          mosfet: b.mosfet,
          location: b.location,
        });

        // Add to Actionable Driver Alerts if a driver is assigned
        if (b.driver_id && isValidDriverId(b.driver_id, b.driverData?.name)) {
          const ruleKey = `${b.driver_id}_${ruleName}`;
          if (!processedDrivers.has(ruleKey)) {
            processedDrivers.add(ruleKey);
            const driverBatteries = driverMap[b.driver_id] || [b];
            driverBatteries.sort((x, y) => x.id.localeCompare(y.id));
            const bat1 = driverBatteries[0];
            const bat2 = driverBatteries[1];
            const isRepairedFailure = driverBatteries.some((x) =>
              repairedList.some((r) => r.id === x.id),
            );

            driverResults.push({
              driverId: b.driver_id,
              driverName: b.driverData?.name || "Unknown",
              phone: b.driverData?.phone || "--",
              bat1_id: bat1?.id || "--",
              bat1_iot: bat1?.iot_id || "--",
              bat1_soc: bat1?.soc ?? 0,
              bat1_discharging: bat1?.mosfet?.discharging === 1,
              bat1_last_updated: bat1?.last_updated_on,
              bat1_mosfet: bat1?.mosfet,
              bat2_id: bat2?.id || "",
              bat2_iot: bat2?.iot_id || "",
              bat2_soc: bat2 ? (bat2.soc ?? 0) : 0,
              bat2_discharging: bat2?.mosfet?.discharging === 1,
              bat2_last_updated: bat2?.last_updated_on,
              bat2_mosfet: bat2?.mosfet,
              status: ruleName,
              isRepairedFailure: isRepairedFailure,
              alertBatteryId: b.id,
            });
          }
        }
      });
    }

    // 2. Process batteries in the fleet with active issues (tickets raised) where current SoC breaches set SoC limit
    // Breached batteries are passed into Actionable Alerts (mappedDrivers) for driver action
    batsToUse.forEach((b) => {
      const issue = activeIssuesMap[b.id];
      if (issue) {
        const threshold = batteryThresholdOverrides[b.id] 
          ?? issue.swapAlertSocThreshold 
          ?? globalSwapSocThreshold;
        if (typeof b.soc === "number" && b.soc <= threshold) {
          const ruleName = `Swap Alert (SoC ≤ ${threshold}%)`;
          if (b.driver_id && isValidDriverId(b.driver_id, b.driverData?.name)) {
            const ruleKey = `${b.driver_id}_${ruleName}`;
            if (!processedDrivers.has(ruleKey)) {
              processedDrivers.add(ruleKey);
              const driverBatteries = driverMap[b.driver_id] || [b];
              driverBatteries.sort((x, y) => x.id.localeCompare(y.id));
              const bat1 = driverBatteries[0];
              const bat2 = driverBatteries[1];
              const isRepairedFailure = driverBatteries.some((x) =>
                repairedList.some((r) => r.id === x.id),
              );

              driverResults.push({
                driverId: b.driver_id,
                driverName: b.driverData?.name || "Unknown",
                phone: b.driverData?.phone || "--",
                bat1_id: bat1?.id || "--",
                bat1_iot: bat1?.iot_id || "--",
                bat1_soc: bat1?.soc ?? 0,
                bat1_discharging: bat1?.mosfet?.discharging === 1,
                bat1_last_updated: bat1?.last_updated_on,
                bat1_mosfet: bat1?.mosfet,
                bat2_id: bat2?.id || "",
                bat2_iot: bat2?.iot_id || "",
                bat2_soc: bat2 ? (bat2.soc ?? 0) : 0,
                bat2_discharging: bat2?.mosfet?.discharging === 1,
                bat2_last_updated: bat2?.last_updated_on,
                bat2_mosfet: bat2?.mosfet,
                status: ruleName,
                isRepairedFailure: isRepairedFailure,
                alertBatteryId: b.id,
              });
            }
          }
        }
      }
    });

    setMappedDrivers(driverResults);
    setOperatorAlertsList(operatorAlertsListTemp);
  };

  // Re-process alerts automatically when batteries, tickets, or SoC limits change
  useEffect(() => {
    if (allBatteries.length > 0) {
      processAlerts(allBatteries, uploadedAlerts);
    }
  }, [allBatteries, uploadedAlerts, activeIssuesMap, batteryThresholdOverrides, globalSwapSocThreshold]);

  const handleIngestionProcess = async () => {
    if (ingestionType === "battery") {
      if (!gridData.some((row) => row.some((cell) => cell.trim() !== ""))) {
        showToast("Please paste or upload battery data first.");
        return;
      }
      setIsProcessing(true);
      try {
        const parsedBats = parsePastedBatteries(gridData);
        
        // Cache parsed batteries
        localStorage.setItem(CACHE_KEY, JSON.stringify(parsedBats));
        setAllBatteries(parsedBats);
        
        // Update fleet
        generateFullFleetList(parsedBats, repairedList);
        
        // Process rules-based alerts
        processAlerts(parsedBats);
        
        setActiveTab("actionable");
        showToast("Successfully processed and saved ingested battery rows.");
      } catch (err) {
        console.error(err);
        showToast("Error processing ingested battery rows.");
      } finally {
        setIsProcessing(false);
      }
    } else {
      // Ingesting custom Alerts Data
      if (!alertsGridData.some((row) => row.some((cell) => cell.trim() !== ""))) {
        showToast("Please paste or upload alerts data first.");
        return;
      }
      setIsProcessing(true);
      try {
        const parsedAlerts = parsePastedAlerts(alertsGridData);
        
        // Save to state and cache
        setUploadedAlerts(parsedAlerts);
        localStorage.setItem(UPLOADED_ALERTS_CACHE_KEY, JSON.stringify(parsedAlerts));
        
        // Process alerts immediately using existing batteries and the newly parsed alerts list!
        processAlerts(allBatteries, parsedAlerts);
        
        setActiveTab("actionable");
        showToast(`Successfully processed ${parsedAlerts.length} custom alerts.`);
      } catch (err) {
        console.error(err);
        showToast("Error processing ingested alerts rows.");
      } finally {
        setIsProcessing(false);
      }
    }
  };
  const handleShare = async (item: DriverBatteryMap) => {
    let msg = `⚠️ *Alert*\n\n👤  ${item.driverName}\n🆔  ${item.driverId}\n\n🔋  ${item.bat1_id} — ${item.bat1_soc}%`;
    if (item.bat2_id) msg += `\n🔋  ${item.bat2_id} — ${item.bat2_soc}%`;
    msg += `\n\n📞  ${item.phone}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Battery Alert',
          text: msg,
        });
      } catch (err) {
        console.error("Error sharing:", err);
      }
    } else {
      // Fallback to WhatsApp
      window.open(
        `https://wa.me/${item.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(msg)}`,
        "_blank",
      );
    }
  };
  const openRaiseIssueModal = (batteryId: string) => {
    setSelectedBatteryIdForIssue(batteryId);
    setIssueDescription("");
    setMainIssueDescription("Select Issue");
    setSubIssueDescription("");
    setMarkAsError(false);

    const bat = allBatteries.find(b => b.id === batteryId);
    if (bat) {
      setSocAtOccurrence(typeof bat.soc === 'number' ? bat.soc : 100);
    } else {
      setSocAtOccurrence(100);
    }
    setManualRemovalFactor("100%");
    const existingThreshold = batteryThresholdOverrides[batteryId] 
      || activeIssuesMap[batteryId]?.swapAlertSocThreshold 
      || globalSwapSocThreshold 
      || 35;
    setRaiseIssueSocThreshold(existingThreshold);

    setIsIssueModalOpen(true);
  };

  const handleRaiseIssue = async () => {
    if (!mainIssueDescription || mainIssueDescription === "Select Issue" || !selectedBatteryIdForIssue) return;
    
    setIsSubmittingIssue(true);
    const user = auth.currentUser;
    const battery = allBatteries.find(
      (b) => b.id === selectedBatteryIdForIssue,
    );
    const isOnlineVal = battery ? isOnline(battery) : false;

    const recResult = getRemovalRecommendation(mainIssueDescription, isOnlineVal, socAtOccurrence);
    const removalFactor = isOnlineVal 
      ? recResult.percent 
      : (manualRemovalFactor === "Keep (0%)" ? 0 : parseInt(manualRemovalFactor));
    const removalRecommendation = isOnlineVal 
      ? (recResult.percent !== null ? `${recResult.percent}%` : "N/A") 
      : manualRemovalFactor;

    try {
      await addDoc(collection(db, "battery_issues"), {
        batteryId: selectedBatteryIdForIssue,
        mainDescription: mainIssueDescription,
        subDescription: subIssueDescription || issueDescription,
        issueType: mainIssueDescription,
        description: subIssueDescription || issueDescription,
        status: "Pending",
        raisedBy: user?.email || "Unknown",
        raisedByName: user?.displayName || "Unknown",
        raisedByRole: role || "OPERATOR",
        createdAt: new Date().toISOString(),
        occurrenceCount: 1,
        occurrenceDates: [new Date().toISOString()],
        lastOccurrenceAt: new Date().toISOString(),
        currentLocationContext: battery?.driver_id
          ? "With Driver"
          : (battery?.dealer_name || "Not Assigned"),
        stationId: battery?.dealer_id || "Unknown",
        removalFactor: removalFactor !== undefined ? removalFactor : null,
        removalRecommendation: removalRecommendation || null,
        isOnlineAtRaise: isOnlineVal,
        socAtOccurrence: isOnlineVal ? socAtOccurrence : null,
        swapAlertSocThreshold: raiseIssueSocThreshold,
      });

      // Save custom threshold locally as well
      const updatedOverrides = { ...batteryThresholdOverrides, [selectedBatteryIdForIssue]: raiseIssueSocThreshold };
      setBatteryThresholdOverrides(updatedOverrides);
      localStorage.setItem("bd_ops_battery_soc_threshold_overrides", JSON.stringify(updatedOverrides));

      if (markAsError) {
        await updateBatteryStatus(selectedBatteryIdForIssue, 3);
        fetchBatteries();
      }
      setIsIssueModalOpen(false);
      showToast("Issue raised successfully with Swap Alert threshold.");
    } catch (err) {
      showToast("Failed to raise issue.");
    } finally {
      setIsSubmittingIssue(false);
    }
  };

  const updateGlobalSwapSocThreshold = (val: number) => {
    const safeVal = Math.min(90, Math.max(5, val));
    setGlobalSwapSocThreshold(safeVal);
    localStorage.setItem("bd_ops_issue_swap_threshold", String(safeVal));
    showToast(`Default safe swap SoC limit updated to ${safeVal}%`);
  };

  const setBatterySocThreshold = async (batteryId: string, threshold: number) => {
    const safeVal = Math.min(90, Math.max(5, threshold));
    const updated = { ...batteryThresholdOverrides, [batteryId]: safeVal };
    setBatteryThresholdOverrides(updated);
    localStorage.setItem("bd_ops_battery_soc_threshold_overrides", JSON.stringify(updated));

    const issue = activeIssuesMap[batteryId];
    if (issue && issue.id) {
      try {
        await updateDoc(doc(db, "battery_issues", issue.id), {
          swapAlertSocThreshold: safeVal,
        });
      } catch (e) {
        console.warn("Could not update issue in firestore", e);
      }
    }
    const targetBat = allBatteries.find((b) => b.id === batteryId);
    if (targetBat && typeof targetBat.soc === "number" && targetBat.soc <= safeVal) {
      showToast(`Set limit to ≤${safeVal}%. Current SoC is ${targetBat.soc}% — Swap Alert breached and passed to Alerts!`);
    } else {
      showToast(`Custom Safe Swap limit for ${batteryId} set to ≤${safeVal}%`);
    }
  };

  const resetBatterySocThreshold = (batteryId: string) => {
    const updated = { ...batteryThresholdOverrides };
    delete updated[batteryId];
    setBatteryThresholdOverrides(updated);
    localStorage.setItem("bd_ops_battery_soc_threshold_overrides", JSON.stringify(updated));
    showToast(`Reset ${batteryId} to global default (${globalSwapSocThreshold}%)`);
  };

  const markDriverAsNotified = (
    driverId: string,
    driverName: string,
    batteryId: string,
    channel: "whatsapp" | "call" | "manual" | "share",
  ) => {
    const newLog = {
      timestamp: new Date().toISOString(),
      driverId,
      driverName,
      batteryId,
      channel,
    };
    const updated = {
      ...notifiedLogs,
      [`${driverId}_${batteryId}`]: newLog,
      [batteryId]: newLog,
    };
    setNotifiedLogs(updated);
    localStorage.setItem("bd_ops_driver_notified_log", JSON.stringify(updated));
    showToast(`Recorded notification for ${driverName} (${batteryId})`);
  };

  const generateSwapNotificationMessage = (
    driverName: string,
    batteryId: string,
    soc: number,
    threshold: number,
    issueName: string,
    stationName: string,
  ) => {
    const cleanStation = stationName && stationName !== "--" ? stationName : "your nearest Battery Dost Station";
    return `⚠️ *URGENT BATTERY SWAP ALERT — BATTERY DOST*

Namaste ${driverName || "Driver"},

Your assigned battery *${batteryId}* has an active issue (*${issueName || "Operational Check"}*) and has reached *${soc}% SoC*, which has breached the safe swap limit (*${threshold}%*).

📍 *Action Required:*
Please visit *${cleanStation}* immediately to swap this battery before an unexpected shutdown or vehicle stoppage occurs!

Station: ${cleanStation}
Helpline / Ops: Battery Dost
Stay safe & keep moving!`;
  };

  const openNotifyDriverModal = (
    driver: DriverBatteryMap,
    breach: {
      batteryId: string;
      iotId: string;
      currentSoc: number;
      socThreshold: number;
      issueDescription: string;
      stationName?: string;
    },
  ) => {
    setNotificationDriver(driver);
    setNotificationBreach({
      batteryId: breach.batteryId,
      iotId: breach.iotId,
      currentSoc: breach.currentSoc,
      socThreshold: breach.socThreshold,
      issueDescription: breach.issueDescription,
      stationName: breach.stationName || driver.stationName || "Hub",
    });
    setNotificationMessageText(
      generateSwapNotificationMessage(
        driver.driverName,
        breach.batteryId,
        breach.currentSoc,
        breach.socThreshold,
        breach.issueDescription,
        breach.stationName || driver.stationName || "Hub",
      ),
    );
    setIsNotifyModalOpen(true);
  };

  const sendWhatsAppNotification = (
    phone: string,
    text: string,
    driverId: string,
    driverName: string,
    batteryId: string,
  ) => {
    let cleanPhone = phone.replace(/[^0-9]/g, "");
    if (cleanPhone.length === 10) {
      cleanPhone = `91${cleanPhone}`;
    }
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
    markDriverAsNotified(driverId, driverName, batteryId, "whatsapp");
  };

  const callDriver = (
    phone: string,
    driverId: string,
    driverName: string,
    batteryId: string,
  ) => {
    markDriverAsNotified(driverId, driverName, batteryId, "call");
    window.location.href = `tel:${phone}`;
  };

  const copyNotificationMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Message copied to clipboard!");
    } catch (e) {
      showToast("Unable to copy to clipboard.");
    }
  };

  const openSetThresholdModal = (
    batteryId: string,
    currentThreshold: number,
    currentSoc: number,
    issueType: string,
  ) => {
    setTargetBatteryForThreshold({
      batteryId,
      currentThreshold,
      currentSoc,
      issueType,
    });
    setCustomThresholdInput(currentThreshold);
    setIsSetThresholdModalOpen(true);
  };

  const fetchPenaltyData = async (driverId: string) => {
    setIsLoadingPenalties(true);
    setPenaltyData(null);
    setCalendarDate(new Date());
    setExpandedMonths({});
    setDriverStatusLoading(true);
    setCurrentDriverActive(null);
    try {
      const json = await getDriverLeaveAndPenaltyDetails(driverId);
      if (json && json.details) {
        setPenaltyData(json);
      }

      // Fetch active status from firestore
      const driverRef = doc(db, "drivers", driverId);
      const driverSnap = await getDoc(driverRef);
      if (driverSnap.exists()) {
        const driverDocData = driverSnap.data();
        setCurrentDriverActive(driverDocData.is_active !== false); // defaults to true
      } else {
        setCurrentDriverActive(true);
      }
    } catch (err) {
      console.error("Failed to fetch penalties or driver status", err);
      showToast("Failed to fetch penalty data.");
    } finally {
      setIsLoadingPenalties(false);
      setDriverStatusLoading(false);
    }
  };

  const toggleDriverActiveStatus = async (driverId: string) => {
    if (currentDriverActive === null) return;
    setDriverStatusLoading(true);
    const newStatus = !currentDriverActive;
    try {
      // 1. Update in Firestore collection (using setDoc with merge for robust safety)
      const driverRef = doc(db, "drivers", driverId);
      await setDoc(driverRef, { is_active: newStatus }, { merge: true });

      // 2. Sync with Kazam server (wrapped in a nested try-catch so network/API warnings do not block the active/inactive state change)
      try {
        await updateDriver({
          driver_id: driverId,
          is_active: newStatus
        });
      } catch (srvErr) {
        console.warn("Kazam server status sync warning:", srvErr);
      }

      setCurrentDriverActive(newStatus);
      showToast(`Driver status successfully updated to ${newStatus ? "Active" : "Inactive"}`);
    } catch (error) {
      console.error("Failed to toggle driver active status", error);
      showToast("Failed to update driver status.");
    } finally {
      setDriverStatusLoading(false);
    }
  };

  const fetchSwapHistory = async (driverId: string) => {
    setIsLoadingSwapHistory(true);
    setSwapHistoryData([]);
    try {
      const res = (await getDriverSwappingSessions(driverId)) as any;
      if (res && res.success && res.data) {
        setSwapHistoryData(res.data.result || res.data || []);
      } else if (res && Array.isArray(res)) {
        setSwapHistoryData(res);
      } else if (res && res.data?.result) {
        setSwapHistoryData(res.data.result);
      } else {
        setSwapHistoryData([]);
      }
    } catch (err) {
      console.error("Failed to fetch swap history:", err);
      showToast("Error retrieving swap session history.");
    } finally {
      setIsLoadingSwapHistory(false);
    }
  };

  const fetchWalletHistory = async (driverId: string) => {
    setIsLoadingWalletHistory(true);
    setWalletHistoryData([]);
    try {
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(toDate.getDate() - 7);
      
      const res = (await getDriverWalletHistory(driverId, fromDate.toISOString(), toDate.toISOString())) as any;
      if (res && res.data && Array.isArray(res.data.entries)) {
        setWalletHistoryData(res.data.entries);
      } else if (res && res.success && res.data && Array.isArray(res.data.entries)) {
        setWalletHistoryData(res.data.entries);
      } else if (res && Array.isArray(res.walletHistory)) {
        setWalletHistoryData(res.walletHistory);
      } else if (res && Array.isArray(res)) {
        setWalletHistoryData(res);
      } else if (res && res.walletHistory) {
        setWalletHistoryData(res.walletHistory);
      } else {
        setWalletHistoryData([]);
      }
    } catch (err) {
      console.error("Failed to fetch wallet history:", err);
      showToast("Error retrieving wallet topup history.");
    } finally {
      setIsLoadingWalletHistory(false);
    }
  };



  const toggleMonth = (monthStr: string) => {
    setExpandedMonths(prev => ({
      ...prev,
      [monthStr]: !prev[monthStr]
    }));
  };

  const allMonths = useMemo(() => {
    if (!penaltyData || !penaltyData.start_date) return [];
    
    const months: string[] = [];
    const today = new Date();
    const currentMonthDate = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const apiStart = new Date(penaltyData.start_date);
    const startDate = new Date(apiStart.getFullYear(), apiStart.getMonth(), 1);
    
    const limitDate = new Date(currentMonthDate);
    limitDate.setMonth(currentMonthDate.getMonth() - 5);
    
    const effectiveStart = startDate > limitDate ? startDate : limitDate;
    
    let ptr = new Date(currentMonthDate);
    
    let loops = 0;
    while (ptr >= effectiveStart && loops < 12) {
        const year = ptr.getFullYear();
        const month = String(ptr.getMonth() + 1).padStart(2, '0');
        months.push(`${year}-${month}`);
        
        ptr.setMonth(ptr.getMonth() - 1);
        loops++;
    }
    
    return months;
  }, [penaltyData]);

  const groupedPenaltyDetails = useMemo(() => {
    if (!penaltyData?.details) return {};
    const groups: Record<string, { date: string; detail: any }[]> = {};

    Object.entries(penaltyData.details).forEach(([date, detail]) => {
        const d = detail as any;
        if (d.status === 'Penalty') {
            const month = date.slice(0, 7);
            if (!groups[month]) groups[month] = [];
            groups[month].push({ date, detail: d });
        }
    });

    Object.keys(groups).forEach(month => {
        groups[month].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });

    return groups;
  }, [penaltyData]);

  const renderCalendar = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const startDayOfWeek = (firstDay.getDay() + 6) % 7; 
    const daysInMonth = lastDay.getDate();

    const today = new Date();
    today.setHours(0,0,0,0);

    const days = [];

    for (let i = 1; i <= daysInMonth; i++) {
      const currentDate = new Date(year, month, i);
      currentDate.setHours(0,0,0,0);
      
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const dayDetail = penaltyData?.details?.[dateKey];

      let status: 'idle' | 'swap' | 'leave' | 'onboarded' | 'assigned' | 'penalty' | 'future' | 'return' | 'no-battery' | 'pending' = 'idle';
      let amount = 0;

      if (currentDate > today) {
        status = 'future';
      } else if (dayDetail) {
        if (dayDetail.status === 'Swapped') status = 'swap';
        else if (dayDetail.status === 'Leave') status = 'leave';
        else if (dayDetail.status === 'Penalty') {
           status = 'penalty';
           amount = dayDetail.amount || 0;
        }
        else if (dayDetail.status === 'Assignment Day') {
           status = 'assigned';
        }
        else if (dayDetail.status === 'Return Day') status = 'return';
        else if (dayDetail.status === 'No Battery') status = 'no-battery';
        else if (dayDetail.status === 'Pending Calculation') status = 'pending';
      }

      days.push({
        date: i,
        status,
        amount
      });
    }

    const paddingDivs = Array.from({ length: startDayOfWeek }).map((_, i) => <div key={`pad-${i}`} />);
    const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    return (
      <div className="bg-white dark:bg-zinc-900 rounded-[1.5rem] border border-zinc-100 dark:border-zinc-800 p-4 h-fit">
        <div className="flex items-center justify-between mb-4 px-1">
           <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))} className="p-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg transition-colors"><ChevronLeftIcon className="w-4 h-4 text-zinc-500" /></button>
           <span className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wide">
              {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
           </span>
           <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))} className="p-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg transition-colors"><ChevronRightIcon className="w-4 h-4 text-zinc-500" /></button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((d, i) => (
            <div key={i} className="text-center text-[10px] font-bold text-zinc-400 py-1">{d}</div>
          ))}
          {paddingDivs}
          {days.map(d => (
            <div 
              key={d.date} 
              className={`
                aspect-square rounded-lg flex flex-col items-center justify-center transition-all relative border 
                ${d.status === 'future' || d.status === 'idle' ? 'border-transparent text-zinc-300 dark:text-zinc-700 bg-zinc-50 dark:bg-zinc-900/50' : ''}
                ${d.status === 'swap' ? 'border-transparent bg-emerald-500 text-white shadow-sm shadow-emerald-200 dark:shadow-none' : ''}
                ${d.status === 'leave' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800' : ''}
                ${d.status === 'penalty' ? 'border-transparent bg-rose-500 text-white shadow-sm shadow-rose-200 dark:shadow-none' : ''}
                ${d.status === 'onboarded' ? 'border-transparent bg-indigo-500 text-white' : ''}
                ${d.status === 'assigned' ? 'border-transparent bg-lime-500 text-white' : ''}
                ${d.status === 'return' ? 'bg-purple-500 text-white shadow-sm shadow-purple-200 dark:shadow-none border-transparent' : ''}
                ${d.status === 'no-battery' ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-400 border-dashed border-zinc-300 dark:border-zinc-700' : ''}
                ${d.status === 'pending' ? 'bg-gray-200 dark:bg-zinc-800 text-gray-500 border-transparent' : ''}
              `}
            >
              <span className="text-xs font-bold leading-none">{d.date}</span>
              {d.amount > 0 && d.status === 'penalty' && (
                 <span className="text-[7px] font-bold mt-0.5 opacity-90 leading-none">₹{d.amount}</span>
              )}
            </div>
          ))}
        </div>
        
        <div className="mt-4 pt-3 border-t border-zinc-50 dark:border-zinc-800 grid grid-cols-2 gap-y-2 gap-x-1">
           <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div><span className="text-[9px] font-bold text-zinc-500 uppercase">Swap</span></div>
           <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-400"></div><span className="text-[9px] font-bold text-zinc-500 uppercase">Leave</span></div>
           <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500"></div><span className="text-[9px] font-bold text-zinc-500 uppercase">Penalty</span></div>
           
           <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-lime-500"></div><span className="text-[9px] font-bold text-zinc-500 uppercase">Assign</span></div>
           <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-500"></div><span className="text-[9px] font-bold text-zinc-500 uppercase">Onboard</span></div>
           
           <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-purple-500"></div><span className="text-[9px] font-bold text-zinc-500 uppercase">Returned</span></div>
           <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full border border-dashed border-zinc-400 bg-zinc-100"></div><span className="text-[9px] font-bold text-zinc-500 uppercase">No Battery</span></div>
        </div>
      </div>
    );
  };

  const renderPenaltyList = () => {
    return (
      <div className="space-y-4">
        {allMonths.map(monthStr => {
          const dailyItems = groupedPenaltyDetails[monthStr] || [];
          const isExpanded = expandedMonths[monthStr];
          
          const totalPenalty = dailyItems.reduce((acc, curr) => acc + (curr.detail.amount || 0), 0);
          const totalPaid = dailyItems.reduce((acc, curr) => 
            acc + (curr.detail.is_paid ? (curr.detail.amount || 0) : 0), 0
          );
  
          const paidItemsCount = dailyItems.filter(i => i.detail.is_paid).length;
          const [y, m] = monthStr.split('-');
          const monthName = new Date(parseInt(y), parseInt(m)-1).toLocaleString('default', { month: 'long', year: 'numeric' });
  
          return (
            <div key={monthStr} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden shadow-sm">
              <button 
                onClick={() => toggleMonth(monthStr)}
                className="w-full flex items-center justify-between p-4 bg-zinc-50/50 dark:bg-zinc-950/30 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg transition-transform duration-300 ${isExpanded ? 'rotate-180 bg-zinc-200 dark:bg-zinc-800' : 'bg-white dark:bg-zinc-800 shadow-sm'}`}>
                    <ChevronDownIcon className="w-4 h-4 text-zinc-500" />
                  </div>
                  <div className="text-left">
                    <span className="block text-sm font-bold text-zinc-900 dark:text-white">{monthName}</span>
                    {dailyItems.length > 0 ? (
                      <span className="text-[10px] font-bold text-zinc-400 uppercase">{dailyItems.length} Incidents ({paidItemsCount} Paid)</span>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-500 uppercase">Clean Record</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  {totalPenalty > 0 ? (
                    <div className="flex flex-col items-end">
                      <div className="text-xs font-bold text-rose-600 dark:text-rose-400">Total: ₹{totalPenalty}</div>
                      <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-500">Paid: ₹{totalPaid}</div>
                    </div>
                  ) : (
                    <div className="text-xs font-bold text-zinc-400">₹0.00</div>
                  )}
                </div>
              </button>
              
              <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                  <div className="p-4 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800">
                    {dailyItems.length > 0 ? (
                      <div className="max-h-60 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                        {dailyItems.map((item, idx) => {
                          const { date, detail } = item;
                          const isPaid = detail.is_paid === true;
                          const amount = detail.amount || 0;
                          const paidAt = detail.paid_at ? new Date(detail.paid_at).toLocaleString('en-IN', {
                              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                          }) : null;
  
                          const bgStyle = { background: isPaid ? '#10b981' : '#ef4444' };
  
                          return (
                            <div key={`${monthStr}-${idx}`} className="relative rounded-xl overflow-hidden shadow-sm border border-zinc-100 dark:border-zinc-800 group">
                              <div className="absolute inset-0 opacity-10" style={bgStyle}></div>
                              <div className="absolute left-0 top-0 bottom-0 w-1.5" style={bgStyle}></div>
  
                              <div className="relative p-3 pl-5 flex items-center justify-between">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-zinc-900 dark:text-white">
                                      {new Date(date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                                    </span>
                                    {isPaid ? (
                                      <span className="text-[9px] font-bold uppercase bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded">Paid</span>
                                    ) : (
                                      <span className="text-[9px] font-bold uppercase bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-1.5 py-0.5 rounded">Unpaid</span>
                                    )}
                                  </div>
                                  <div className="flex flex-col mt-1">
                                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Penalty</p>
                                      {isPaid && paidAt && (
                                          <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                                              <CheckBadgeIcon className="w-3 h-3" /> Paid on {paidAt}
                                          </p>
                                      )}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className={`text-sm font-bold ${isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                    ₹{amount}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-2 text-[10px] font-bold text-zinc-400 italic">
                        No penalties recorded for this month.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        
        {allMonths.length === 0 && (
          <div className="p-8 text-center bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800">
            <p className="text-xs font-bold text-zinc-400">No history available.</p>
          </div>
        )}
      </div>
    );
  };



  const openDispatchModal = () => {
    setPlantGridData(Array.from({ length: 10 }, () => Array(5).fill("")));
    setIsDispatchModalOpen(true);
  };
  const openReceiveModal = () => {
    setPlantGridData(Array.from({ length: 10 }, () => Array(4).fill("")));
    setIsReceiveModalOpen(true);
  };
  const openWatchlistModal = () => {
    setWatchlistGridData(Array.from({ length: 10 }, () => Array(3).fill("")));
    setIsWatchlistModalOpen(true);
  };
  const openInactiveImportModal = () => {
    setInactiveImportGrid(Array.from({ length: 10 }, () => Array(2).fill("")));
    setIsInactiveImportOpen(true);
  };

  const handleInactiveImportProcess = async () => {
    const rows = inactiveImportGrid.filter((row) => row[0]?.trim());
    if (rows.length === 0) return;
    setIsInactiveImporting(true);
    try {
      const savedPlaces = localStorage.getItem('battery_manual_locations');
      let currentPlaces: Record<string, string> = {};
      if (savedPlaces) {
        try { currentPlaces = JSON.parse(savedPlaces); } catch (e) {}
      }

      for (const row of rows) {
        const [batId, remark] = row;
        if (!batId) continue;
        currentPlaces[batId.trim()] = remark?.trim() || "Other";
      }

      localStorage.setItem('battery_manual_locations', JSON.stringify(currentPlaces));
      window.dispatchEvent(new Event('storage'));

      setIsInactiveImportOpen(false);
      showToast(`Updated ${rows.length} batteries.`);
    } catch (err) {
      showToast("Import failed.");
    } finally {
      setIsInactiveImporting(false);
    }
  };
  const handleBulkDispatch = async () => {
    const rows = plantGridData.filter((row) => row[0]?.trim());
    if (rows.length === 0) return;
    setIsPlantProcessing(true);
    try {
      const savedRegister = localStorage.getItem('battery_plant_dispatch_register');
      let currentRegister: PlantRecord[] = [];
      if (savedRegister) {
        try { currentRegister = JSON.parse(savedRegister); } catch (e) {}
      }

      const savedPlaces = localStorage.getItem('battery_manual_locations');
      let currentPlaces: Record<string, string> = {};
      if (savedPlaces) {
        try { currentPlaces = JSON.parse(savedPlaces); } catch (e) {}
      }

      for (const row of rows) {
        const [bId, iot, mf, desc, dDate] = row;
        if (!bId) continue;
        
        const batteryId = bId.trim();
        const newRecord: PlantRecord = {
          id: `plant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          batteryId,
          iotId: iot?.trim() || "N/A",
          manufacturer: mf?.trim() || "N/A",
          issueDescription: desc?.trim() || "Unknown Issue",
          dispatchDate: dDate?.trim() || new Date().toISOString().split("T")[0],
          status: "Not Returned",
          createdAt: new Date().toISOString(),
        };

        currentRegister.push(newRecord);
        currentPlaces[batteryId] = "Plant";
      }

      localStorage.setItem('battery_plant_dispatch_register', JSON.stringify(currentRegister));
      localStorage.setItem('battery_manual_locations', JSON.stringify(currentPlaces));
      window.dispatchEvent(new Event('storage'));

      setIsDispatchModalOpen(false);
      showToast(`Dispatched ${rows.length} batteries.`);
    } catch (err) {
      showToast("Failed to process.");
    } finally {
      setIsPlantProcessing(false);
    }
  };
  const handleBulkReturn = async () => {
    const rows = plantGridData.filter((row) => row[0]?.trim());
    if (rows.length === 0) return;
    setIsPlantProcessing(true);
    try {
      const savedRegister = localStorage.getItem('battery_plant_dispatch_register');
      let currentRegister: PlantRecord[] = [];
      if (savedRegister) {
        try { currentRegister = JSON.parse(savedRegister); } catch (e) {}
      }

      const savedPlaces = localStorage.getItem('battery_manual_locations');
      let currentPlaces: Record<string, string> = {};
      if (savedPlaces) {
        try { currentPlaces = JSON.parse(savedPlaces); } catch (e) {}
      }

      for (const row of rows) {
        const [bId, rDate, comm, rem] = row;
        if (!bId) continue;

        const batteryId = bId.trim();
        const recordIndex = currentRegister.findIndex(
          (r) => r.batteryId === batteryId && r.status === "Not Returned"
        );

        if (recordIndex !== -1) {
          currentRegister[recordIndex] = {
            ...currentRegister[recordIndex],
            status: "Returned",
            returnDate: rDate?.trim() || new Date().toISOString().split("T")[0],
            serviceComments: comm?.trim() || "",
            remarks: rem?.trim() || "",
          };
        }

        currentPlaces[batteryId] = "Office";
      }

      localStorage.setItem('battery_plant_dispatch_register', JSON.stringify(currentRegister));
      localStorage.setItem('battery_manual_locations', JSON.stringify(currentPlaces));
      window.dispatchEvent(new Event('storage'));

      setIsReceiveModalOpen(false);
      showToast(`Received ${rows.length} batteries.`);
    } catch (err) {
      showToast("Failed to process return.");
    } finally {
      setIsPlantProcessing(false);
    }
  };
  const handleBulkWatchlistAdd = async () => {
    const rows = watchlistGridData.filter((row) => row[0]?.trim());
    if (rows.length === 0) return;
    setIsWatchlistProcessing(true);
    try {
      for (const row of rows) {
        const [bId, rDate, action] = row;
        if (!bId) continue;
        await setDoc(doc(db, "quality_watchlist", bId.trim()), {
          markedAt: rDate?.trim() || new Date().toISOString().split("T")[0],
          notes: action?.trim() || "",
        });
      }
      setIsWatchlistModalOpen(false);
      showToast(`Updated watchlist.`);
    } catch (err) {
      showToast("Failed to update.");
    } finally {
      setIsWatchlistProcessing(false);
    }
  };
  const isOnline = (bat: KazamBattery) => {
    const ts = bat.last_updated_on;
    const lastUpdatedMs =
      typeof ts === "number"
        ? ts > 100000000000
          ? ts
          : ts * 1000
        : new Date(ts).getTime();
    return Date.now() - lastUpdatedMs < 300000;
  };

  const sortedStationIssues = useMemo(() => {
    let list = [];
    if (stationIssueViewMode === "raised") {
      const grouped = new Map<string, any>();
      stationIssues
        .filter((t) => t.status === "Open")
        .forEach((ticket) => {
          const existing = grouped.get(ticket.batteryId);
        const ticketTime = new Date(ticket.createdAt).getTime();
        const existingTime = existing ? new Date(existing.ticket.createdAt).getTime() : 0;

        if (!existing || ticketTime > existingTime) {
          const liveBat = allBatteries.find((b) => b.id === ticket.batteryId);
          const newOccurrenceCount = (existing ? existing.occurrenceCount : 0) + (ticket.occurrenceCount || 1);
          
          let rf = ticket.removalFactor;
          let rec = ticket.removalRecommendation;
          let isOnlineAtRaise = ticket.isOnlineAtRaise;
          
          if (rf === undefined || rf === null) {
            const isOnlineVal = liveBat ? isOnline(liveBat) : false;
            const socVal = liveBat && typeof liveBat.soc === "number" ? liveBat.soc : 100;
            const fallback = getRemovalRecommendation(ticket.mainDescription || ticket.issueType || "Other", isOnlineVal, socVal);
            rf = fallback.percent !== null ? fallback.percent : 0;
            rec = fallback.percent !== null ? `${fallback.percent}%` : "0% (Optional)";
            isOnlineAtRaise = isOnlineVal;
          }

          const enrichedTicket = {
            ...ticket,
            removalFactor: rf,
            removalRecommendation: rec,
            isOnlineAtRaise: isOnlineAtRaise,
          };

          grouped.set(ticket.batteryId, {
            id: ticket.batteryId,
            iot_id: liveBat?.iot_id || "--",
            status: liveBat?.status || 0,
            charge_state: liveBat?.charge_state || 0,
            mosfet: liveBat?.mosfet,
            dealer_name: liveBat?.dealer_name || "Hub",
            dealer_id: liveBat?.dealer_id || "",
            soc: liveBat?.soc || 0,
            last_updated_on: liveBat?.last_updated_on || "",
            lastSwapDate: liveBat?.batteryHistory?.timestamp || liveBat?.last_swap_on || 0,
            ticket: enrichedTicket,
            isOnline: liveBat ? isOnline(liveBat) : false,
            occurrenceCount: newOccurrenceCount,
            driver_id: liveBat?.driver_id,
            driverData: liveBat?.driverData,
          });
        } else {
          existing.occurrenceCount += (ticket.occurrenceCount || 1);
        }
      });
      list = Array.from(grouped.values()).filter((item) => item.dealer_id && item.dealer_id.trim() !== "");
    } else {
      list = allBatteries
        .filter(
          (b) =>
            b.status === 3 &&
            !activeIssuesMap[b.id] &&
            b.dealer_id &&
            b.dealer_id.trim() !== "",
        )
        .map((b) => ({
          ...b,
          ticket: undefined,
          lastSwapDate: b.batteryHistory?.timestamp || b.last_swap_on || 0,
          isOnline: isOnline(b),
          occurrenceCount: 0,
        }));
    }

    if (tabStationFilter !== "all")
      list = list.filter((b) => b.dealer_name === tabStationFilter);
    if (tabStatusFilter !== "all")
      list = list.filter(
        (b) => getDetailedStatus(b, b.ticket) === tabStatusFilter,
      );
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (b) =>
          b.id.toLowerCase().includes(q) ||
          (b.iot_id || "").toLowerCase().includes(q),
      );
    }
    return sortData(list);
  }, [
    allBatteries,
    stationIssues,
    activeIssuesMap,
    stationIssueViewMode,
    tabStationFilter,
    tabStatusFilter,
    searchQuery,
    sortConfig,
  ]);

  const sortedInactiveBatteries = useMemo(() => {
    let list = allBatteries
      .filter((b) => !b.dealer_id || b.dealer_id.trim() === "")
      .map((b) => ({
        ...b,
        currentLocation: b.driverData ? "With Driver" : "Not Assigned",
        ticket: activeIssuesMap[b.id],
        isOnline: isOnline(b),
      }));
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (b) =>
          b.id.toLowerCase().includes(q) ||
          (b.iot_id || "").toLowerCase().includes(q),
      );
    }
    return sortData(list);
  }, [allBatteries, activeIssuesMap, searchQuery, sortConfig]);

  const sortedFleetList = useMemo(() => {
    let list = fullFleetList;

    if (fleetShowOnlyWithIssues) {
      list = list.filter(
        (item) =>
          activeIssuesMap[item.bat1_id] ||
          (item.bat2_id && activeIssuesMap[item.bat2_id]),
      );
    }

    if (fleetShowCriticalOnly) {
      list = list.filter((item) => {
        const hasIssue1 = !!activeIssuesMap[item.bat1_id];
        const hasIssue2 = item.bat2_id ? !!activeIssuesMap[item.bat2_id] : false;
        const isCritical1 = hasIssue1 && item.bat1_soc < 30;
        const isCritical2 = hasIssue2 && item.bat2_soc < 30;
        return isCritical1 || isCritical2;
      });
    }

    if (fleetShowSingleBatteryOnly) {
      list = list.filter((item) => {
        if (!item.bat2_id) return false;
        const socDiff = Math.abs(item.bat1_soc - item.bat2_soc);
        // Large SoC difference (> 15%) OR only one battery is discharging
        const isImbalanced = socDiff > 15 || (item.bat1_discharging !== item.bat2_discharging);
        return isImbalanced;
      });
    }

    if (fleetMosfetChargingFilter !== 'all') {
      list = list.filter((item) => {
        const c1 = item.bat1_mosfet?.charging;
        const c2 = item.bat2_id ? item.bat2_mosfet?.charging : undefined;
        if (fleetMosfetChargingFilter === 'on') {
          return c1 === 1 || (item.bat2_id && c2 === 1);
        } else {
          return c1 === 0 || (item.bat2_id && c2 === 0);
        }
      });
    }

    if (fleetMosfetDischargingFilter !== 'all') {
      list = list.filter((item) => {
        const d1 = item.bat1_mosfet?.discharging;
        const d2 = item.bat2_id ? item.bat2_mosfet?.discharging : undefined;
        if (fleetMosfetDischargingFilter === 'on') {
          return d1 === 1 || (item.bat2_id && d2 === 1);
        } else {
          return d1 === 0 || (item.bat2_id && d2 === 0);
        }
      });
    }

    if (fleetShowBreachedOnly) {
      list = list.filter((item) => {
        const i1 = activeIssuesMap[item.bat1_id];
        const t1 = i1 ? (batteryThresholdOverrides[item.bat1_id] ?? i1.swapAlertSocThreshold ?? globalSwapSocThreshold) : 0;
        const b1 = !!i1 && typeof item.bat1_soc === "number" && item.bat1_soc <= t1;

        const i2 = item.bat2_id ? activeIssuesMap[item.bat2_id] : undefined;
        const t2 = i2 ? (batteryThresholdOverrides[item.bat2_id] ?? i2.swapAlertSocThreshold ?? globalSwapSocThreshold) : 0;
        const b2 = !!i2 && typeof item.bat2_soc === "number" && item.bat2_soc <= t2;

        return b1 || b2;
      });
    }

    if (selectedFleetCityGroup !== 'all') {
      const group = stationGroups.find(g => g.id === selectedFleetCityGroup);
      if (group) {
          const ids = group.stationIds || [];
          const names = group.stationNames || [];
          list = list.filter(item => {
              const currentIds = item.allStationIds || [];
              const currentNames = item.allStationNames || [];
              const matchesId = currentIds.some(id => ids.includes(id));
              const matchesName = currentNames.some(name => names.includes(name));
              return matchesId || matchesName || (item.stationId && ids.includes(item.stationId)) || (item.stationName && names.includes(item.stationName));
          });
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (item) =>
          item.driverName.toLowerCase().includes(q) ||
          item.driverId.toLowerCase().includes(q) ||
          item.phone.includes(q) ||
          item.bat1_id.toLowerCase().includes(q) ||
          item.bat2_id.toLowerCase().includes(q),
      );
    }
    return sortData(list);
  }, [
    fullFleetList,
    searchQuery,
    sortConfig,
    fleetShowOnlyWithIssues,
    fleetShowCriticalOnly,
    fleetShowSingleBatteryOnly,
    fleetMosfetChargingFilter,
    fleetMosfetDischargingFilter,
    fleetShowBreachedOnly,
    selectedFleetCityGroup,
    stationGroups,
    activeIssuesMap,
    batteryThresholdOverrides,
    globalSwapSocThreshold,
  ]);

  interface BreachedBatteryDetail {
    batteryId: string;
    iotId: string;
    soc: number;
    threshold: number;
    issue: BatteryIssue;
    isBat1: boolean;
    deficit: number;
  }

  interface BreachedDriverEntry {
    driver: DriverBatteryMap;
    breaches: BreachedBatteryDetail[];
    primaryBreach: BreachedBatteryDetail;
    notifiedInfo?: {
      timestamp: string;
      driverId: string;
      driverName: string;
      batteryId: string;
      channel: "whatsapp" | "call" | "manual" | "share";
    };
  }

  const breachedDriverList = useMemo<BreachedDriverEntry[]>(() => {
    const list: BreachedDriverEntry[] = [];
    fullFleetList.forEach((driver) => {
      const breaches: BreachedBatteryDetail[] = [];

      // Check Battery 1
      if (driver.bat1_id && activeIssuesMap[driver.bat1_id]) {
        const issue = activeIssuesMap[driver.bat1_id];
        const threshold = batteryThresholdOverrides[driver.bat1_id] 
          ?? issue.swapAlertSocThreshold 
          ?? globalSwapSocThreshold;
        if (typeof driver.bat1_soc === "number" && driver.bat1_soc <= threshold) {
          breaches.push({
            batteryId: driver.bat1_id,
            iotId: driver.bat1_iot,
            soc: driver.bat1_soc,
            threshold,
            issue,
            isBat1: true,
            deficit: threshold - driver.bat1_soc,
          });
        }
      }

      // Check Battery 2
      if (driver.bat2_id && activeIssuesMap[driver.bat2_id]) {
        const issue = activeIssuesMap[driver.bat2_id];
        const threshold = batteryThresholdOverrides[driver.bat2_id] 
          ?? issue.swapAlertSocThreshold 
          ?? globalSwapSocThreshold;
        if (typeof driver.bat2_soc === "number" && driver.bat2_soc <= threshold) {
          breaches.push({
            batteryId: driver.bat2_id,
            iotId: driver.bat2_iot,
            soc: driver.bat2_soc,
            threshold,
            issue,
            isBat1: false,
            deficit: threshold - driver.bat2_soc,
          });
        }
      }

      if (breaches.length > 0) {
        breaches.sort((a, b) => b.deficit - a.deficit);
        const primaryBreach = breaches[0];
        const notifiedInfo = notifiedLogs[`${driver.driverId}_${primaryBreach.batteryId}`] || notifiedLogs[primaryBreach.batteryId];
        list.push({
          driver,
          breaches,
          primaryBreach,
          notifiedInfo,
        });
      }
    });

    return list.sort((a, b) => b.primaryBreach.deficit - a.primaryBreach.deficit);
  }, [fullFleetList, activeIssuesMap, batteryThresholdOverrides, globalSwapSocThreshold, notifiedLogs]);

  const filteredBreachedDrivers = useMemo(() => {
    let list = breachedDriverList;

    if (selectedSwapAlertCityGroup !== "all") {
      const group = stationGroups.find((g) => g.id === selectedSwapAlertCityGroup);
      if (group) {
        const ids = group.stationIds || [];
        const names = group.stationNames || [];
        list = list.filter(({ driver }) => {
          const currentIds = driver.allStationIds || [];
          const currentNames = driver.allStationNames || [];
          const matchesId = currentIds.some((id) => ids.includes(id));
          const matchesName = currentNames.some((name) => names.includes(name));
          return matchesId || matchesName || (driver.stationId && ids.includes(driver.stationId)) || (driver.stationName && names.includes(driver.stationName));
        });
      }
    }

    if (swapAlertsFilterStatus === "pending") {
      list = list.filter((item) => !item.notifiedInfo);
    } else if (swapAlertsFilterStatus === "notified") {
      list = list.filter((item) => !!item.notifiedInfo);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(({ driver, breaches }) => {
        return (
          driver.driverName.toLowerCase().includes(q) ||
          driver.driverId.toLowerCase().includes(q) ||
          driver.phone.includes(q) ||
          (driver.stationName || "").toLowerCase().includes(q) ||
          breaches.some((b) => b.batteryId.toLowerCase().includes(q) || b.iotId.toLowerCase().includes(q) || (b.issue.mainDescription || "").toLowerCase().includes(q))
        );
      });
    }

    return list;
  }, [breachedDriverList, selectedSwapAlertCityGroup, stationGroups, swapAlertsFilterStatus, searchQuery]);

  const swapAlertsTotalPages = Math.max(1, Math.ceil(filteredBreachedDrivers.length / itemsPerPage));
  const paginatedBreachedDrivers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredBreachedDrivers.slice(start, start + itemsPerPage);
  }, [filteredBreachedDrivers, currentPage, itemsPerPage]);
  const sortedPlantRegister = useMemo(() => {
    let list = plantRegister.filter(
      (r) =>
        (plantFilterStatus === "All" || r.status === plantFilterStatus) &&
        (r.batteryId.toLowerCase().includes(plantSearch.toLowerCase()) ||
          r.manufacturer.toLowerCase().includes(plantSearch.toLowerCase())),
    );
    return sortData(list);
  }, [plantRegister, plantSearch, plantFilterStatus, sortConfig]);
  const sortedWatchlist = useMemo(() => {
    let list = repairedList;
    if (watchlistSearchQuery.trim()) {
      const q = watchlistSearchQuery.toLowerCase();
      list = list.filter(
        (item) =>
          item.id.toLowerCase().includes(q) ||
          (item.notes || "").toLowerCase().includes(q),
      );
    }
    return sortData(list);
  }, [repairedList, watchlistSearchQuery, sortConfig]);
  const actionableRules = useMemo(() => {
    const rules = new Set<string>();
    mappedDrivers.forEach((d) => {
      if (d.status) {
        rules.add(d.status);
      }
    });
    return Array.from(rules).sort();
  }, [mappedDrivers]);

  const sortedMappedDrivers = useMemo(() => {
    let list = mappedDrivers;
    if (actionableRuleFilter && actionableRuleFilter.length > 0) {
      list = list.filter((item) => actionableRuleFilter.includes(item.status));
    }
    const seen = new Set<string>();
    list = list.filter((item) => {
      const key = `${item.driverId || item.phone || item.driverName}_${item.status || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return sortData(list);
  }, [mappedDrivers, actionableRuleFilter, sortConfig]);

  const operatorRules = useMemo(() => {
    const rules = new Set<string>();
    operatorAlertsList.forEach((item) => {
      if (item.ruleName) {
        rules.add(item.ruleName);
      }
    });
    return Array.from(rules).sort();
  }, [operatorAlertsList]);

  const operatorStations = useMemo(() => {
    const stations = new Set<string>();
    operatorAlertsList.forEach((item) => {
      if (item.stationName) {
        stations.add(item.stationName);
      }
    });
    return Array.from(stations).sort();
  }, [operatorAlertsList]);

  const sortedOperatorAlerts = useMemo(() => {
    let list = operatorAlertsList;
    if (operatorRuleFilter && operatorRuleFilter.length > 0) {
      list = list.filter((item) => operatorRuleFilter.includes(item.ruleName));
    }
    if (operatorStationFilter && operatorStationFilter.length > 0) {
      list = list.filter((item) => operatorStationFilter.includes(item.stationName));
    }
    const seen = new Set<string>();
    list = list.filter((item) => {
      const key = `${item.batteryId || item.iotId || ""}_${item.ruleName || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return sortData(list);
  }, [operatorAlertsList, operatorRuleFilter, operatorStationFilter, sortConfig]);

  const renderRow = (
    item: DriverBatteryMap,
    isAlert: boolean,
    alertBatId?: string,
    alertStatus?: string,
  ) => {
    const isBat1Alerted =
      isAlert && alertBatId?.split(",").includes(item.bat1_id);
    const isBat2Alerted =
      isAlert && alertBatId?.split(",").includes(item.bat2_id);
    const isBat1Recurring =
      isBat1Alerted && repairedList.some((r) => r.id === item.bat1_id);
    const isBat2Recurring =
      isBat2Alerted && repairedList.some((r) => r.id === item.bat2_id);
    const hasTicket1 = !!activeIssuesMap[item.bat1_id];
    const hasTicket2 = !!activeIssuesMap[item.bat2_id];

    // Swap Alert checks for batteries with active issues
    const issue1 = activeIssuesMap[item.bat1_id];
    const threshold1 = issue1 ? (batteryThresholdOverrides[item.bat1_id] ?? issue1.swapAlertSocThreshold ?? globalSwapSocThreshold) : 0;
    const isBat1Breached = !!issue1 && typeof item.bat1_soc === "number" && item.bat1_soc <= threshold1;

    const issue2 = item.bat2_id ? activeIssuesMap[item.bat2_id] : undefined;
    const threshold2 = issue2 ? (batteryThresholdOverrides[item.bat2_id] ?? issue2.swapAlertSocThreshold ?? globalSwapSocThreshold) : 0;
    const isBat2Breached = !!issue2 && typeof item.bat2_soc === "number" && item.bat2_soc <= threshold2;

    const hasAnyBreach = isBat1Breached || isBat2Breached;
    const isNotified = notifiedLogs[`${item.driverId}_${isBat1Breached ? item.bat1_id : item.bat2_id}`] 
      || (item.bat1_id && notifiedLogs[item.bat1_id]) 
      || (item.bat2_id && notifiedLogs[item.bat2_id]);

    const isBat1Online = isOnline({ last_updated_on: item.bat1_last_updated } as KazamBattery);
    const isBat2Online = item.bat2_id ? isOnline({ last_updated_on: item.bat2_last_updated } as KazamBattery) : false;

    const bat1IdStyle = "text-zinc-900 dark:text-zinc-100";
    const bat2IdStyle = "text-zinc-900 dark:text-zinc-100";

    return (
      <tr
        key={isAlert && alertStatus ? `${item.driverId}_${alertStatus}` : item.driverId}
        className={`group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors duration-200 ${item.isRepairedFailure ? "bg-red-50/50 dark:bg-red-900/10" : ""}`}
      >
        <td className="px-6 py-4">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <span className="font-bold text-sm text-zinc-900 dark:text-zinc-200">
                {item.driverName}
              </span>
              <CopyButton text={item.driverName} />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-zinc-500">
                {item.driverId}
              </span>
              <CopyButton text={item.driverId} />
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-400 mt-0.5">
              <span className="flex items-center gap-1">
                <PhoneIcon className="w-3 h-3" /> {item.phone}
              </span>
              <CopyButton text={item.phone} />
            </div>
          </div>
        </td>
        {isAlert && (
          <td className="px-6 py-4">
            <div className="flex flex-col gap-1">
              <span className="px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[10px] font-bold uppercase w-fit">
                {alertStatus}
              </span>
              {item.isRepairedFailure && (
                <span className="px-2 py-1 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-[10px] font-bold uppercase w-fit flex items-center gap-1">
                  <ExclamationTriangleIcon className="w-3 h-3" /> Repair Failed
                </span>
              )}
            </div>
          </td>
        )}
        <td
          className={`px-6 py-4 ${isBat1Recurring ? "bg-amber-50/50 dark:bg-amber-900/10" : ""}`}
        >
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => openRaiseIssueModal(item.bat1_id)}
                className={`p-1.5 rounded-lg transition-colors ${hasTicket1 ? "bg-zinc-100 text-zinc-400" : "bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100"}`}
                title="Raise Issue"
              >
                <WrenchScrewdriverIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  const bat = allBatteries.find((b) => b.id === item.bat1_id);
                  if (bat && bat.location?.coordinates) {
                    const [lng, lat] = bat.location.coordinates;
                    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
                  } else if (bat && onBatterySelect) {
                    onBatterySelect(bat);
                  }
                }}
                className="p-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                title="Locate Battery"
              >
                <MapPinIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="relative">
                  <span
                    className={`text-sm font-bold ${bat1IdStyle}`}
                  >
                    {item.bat1_id}
                  </span>
                  {hasTicket1 && (
                    <div 
                      className="absolute -top-2 -right-3 cursor-pointer hover:scale-110 transition-transform z-10"
                      onClick={() => {
                        setSelectedBatteryForHistory(item.bat1_id);
                        setIsHistoryModalOpen(true);
                      }}
                    >
                      <TicketIcon className="w-3 h-3 text-indigo-500" />
                      {activeIssuesMap[item.bat1_id]?.occurrenceCount >= 1 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[7px] font-bold px-0.5 min-w-[12px] h-[12px] flex items-center justify-center rounded-full border border-white">
                          {activeIssuesMap[item.bat1_id].occurrenceCount}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {isBat1Recurring && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[9px] font-bold border border-amber-200 dark:border-amber-800 whitespace-nowrap">
                    Recurring
                  </span>
                )}
                <CopyButton text={item.bat1_id} />

                {/* Set SoC button & Red Alert icon on breach placed inline beside battery ID */}
                {hasTicket1 && (
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openSetThresholdModal(item.bat1_id, threshold1, item.bat1_soc, issue1?.mainDescription || "Issue");
                      }}
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 transition-colors shadow-xs flex items-center gap-1"
                      title="Set SoC threshold"
                    >
                      <AdjustmentsHorizontalIcon className="w-3.5 h-3.5 sm:hidden" />
                      <span className="hidden sm:inline">Set SoC</span>
                    </button>
                    {isBat1Breached && (
                      <span title={`SoC breached (${item.bat1_soc}% ≤ ${threshold1}%)`}>
                        <BellAlertIcon className="w-3.5 h-3.5 text-red-600 animate-pulse shrink-0" />
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-[10px] font-bold ${isBat1Alerted ? "text-red-600" : "text-zinc-400"}`}>
                  {item.bat1_iot}
                </span>
                <CopyButton text={item.bat1_iot} />
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold ${item.bat1_soc < 20 ? "text-red-500" : "text-emerald-500"}`}
                >
                  {item.bat1_soc}% SOC
                </span>
              </div>
            </div>
          </div>
        </td>
        <td
          className={`px-6 py-4 ${isBat2Recurring ? "bg-amber-50/50 dark:bg-amber-900/10" : ""}`}
        >
          {item.bat2_id ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => openRaiseIssueModal(item.bat2_id)}
                  className={`p-1.5 rounded-lg transition-colors ${hasTicket2 ? "bg-zinc-100 text-zinc-400" : "bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100"}`}
                  title="Raise Issue"
                >
                  <WrenchScrewdriverIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    const bat = allBatteries.find((b) => b.id === item.bat2_id);
                    if (bat && bat.location?.coordinates) {
                      const [lng, lat] = bat.location.coordinates;
                      window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
                    } else if (bat && onBatterySelect) {
                      onBatterySelect(bat);
                    }
                  }}
                  className="p-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                  title="Locate Battery"
                >
                  <MapPinIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="relative">
                    <span
                      className={`text-sm font-bold ${bat2IdStyle}`}
                    >
                      {item.bat2_id}
                    </span>
                    {hasTicket2 && (
                      <div 
                        className="absolute -top-2 -right-3 cursor-pointer hover:scale-110 transition-transform z-10"
                        onClick={() => {
                          setSelectedBatteryForHistory(item.bat2_id);
                          setIsHistoryModalOpen(true);
                        }}
                      >
                        <TicketIcon className="w-3 h-3 text-indigo-500" />
                        {activeIssuesMap[item.bat2_id]?.occurrenceCount >= 1 && (
                          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[7px] font-bold px-0.5 min-w-[12px] h-[12px] flex items-center justify-center rounded-full border border-white">
                            {activeIssuesMap[item.bat2_id].occurrenceCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {isBat2Recurring && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[9px] font-bold border border-amber-200 dark:border-amber-800 whitespace-nowrap">
                      Recurring
                    </span>
                  )}
                  <CopyButton text={item.bat2_id} />

                  {/* Set SoC button & Red Alert icon on breach placed inline beside battery ID */}
                  {hasTicket2 && (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openSetThresholdModal(item.bat2_id, threshold2, item.bat2_soc, issue2?.mainDescription || "Issue");
                        }}
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 transition-colors shadow-xs flex items-center gap-1"
                        title="Set SoC threshold"
                      >
                        <AdjustmentsHorizontalIcon className="w-3.5 h-3.5 sm:hidden" />
                        <span className="hidden sm:inline">Set SoC</span>
                      </button>
                      {isBat2Breached && (
                        <span title={`SoC breached (${item.bat2_soc}% ≤ ${threshold2}%)`}>
                          <BellAlertIcon className="w-3.5 h-3.5 text-red-600 animate-pulse shrink-0" />
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] font-bold ${isBat2Alerted ? "text-red-600" : "text-zinc-400"}`}>
                    {item.bat2_iot}
                  </span>
                  <CopyButton text={item.bat2_iot} />
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold ${item.bat2_soc < 20 ? "text-red-500" : "text-emerald-500"}`}
                  >
                    {item.bat2_soc}% SOC
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <span className="text-xs font-bold text-zinc-300">--</span>
          )}
        </td>
      </tr>
    );
  };

  const getPaginatedData = (data: any[]) =>
    data.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const getTotalPages = (data: any[]) => Math.ceil(data.length / itemsPerPage);

  return (
    <div className="relative animate-in fade-in duration-500 pb-24">
      <div className="space-y-8">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div>
            <h2 className="text-3xl font-bold font-heading text-zinc-900 dark:text-white mb-2">
              Driver Alert System
            </h2>
            <p className="font-semibold text-zinc-500 dark:text-zinc-400">
              Proactive breakdown prevention & repair quality monitoring.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fetchBatteries()}
              disabled={loadingData}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 transition-all"
            >
              <ArrowPathIcon
                className={`w-4 h-4 ${loadingData ? "animate-spin" : ""}`}
              />
              <span>{loadingData ? "Syncing..." : "Sync Data"}</span>
            </button>
          </div>
        </div>
        <div className="relative group max-w-xl">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
          <input
            type="text"
            placeholder="Search by Battery ID, Driver, or IoT ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/10 dark:text-zinc-100 font-bold transition-all shadow-sm"
          />
        </div>
        <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-1 overflow-x-auto scrollbar-hide whitespace-nowrap">
          {[
            {
              id: "ingestion",
              label: "Ingestion",
              icon: TableCellsIcon,
              color: "indigo",
            },
            {
              id: "actionable",
              label: "Actionable",
              icon: MegaphoneIcon,
              color: "red",
              badge: mappedDrivers.length > 0 ? mappedDrivers.length : undefined,
            },
            {
              id: "operator",
              label: "Operator Alerts",
              icon: BoltIcon,
              color: "orange",
            },
            {
              id: "station_issues",
              label: "Station Issues",
              icon: WrenchScrewdriverIcon,
              color: "purple",
            },
            {
              id: "fleet",
              label: "Full Fleet",
              icon: UserGroupIcon,
              color: "blue",
            },
            {
              id: "swap_alerts",
              label: "Swap Alerts",
              icon: BellAlertIcon,
              color: "rose",
              badge: breachedDriverList.length,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-3 rounded-t-xl text-xs font-bold transition-all border-b-2 flex-shrink-0 ${activeTab === tab.id ? `border-${tab.color}-500 text-${tab.color}-600 bg-${tab.color}-50 dark:bg-${tab.color}-900/10 dark:text-${tab.color}-400` : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
              title={tab.label}
            >
              <tab.icon className="w-4 h-4 shrink-0" /> 
              <span className="hidden sm:inline">{tab.label}</span>
              {typeof tab.badge === "number" && tab.badge > 0 && (
                <span className="ml-0.5 sm:ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-500 text-white animate-pulse">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "station_issues" && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-center flex-wrap">
              <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm w-full md:w-auto">
                <button
                  onClick={() => setStationIssueViewMode("raised")}
                  className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-xs font-bold transition-all ${
                    stationIssueViewMode === "raised"
                      ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-md"
                      : "text-zinc-500"
                  }`}
                >
                  {/* Change stationIssues.length to sortedStationIssues.length when in 'raised' mode */}
                  Raised Issues (
                  {stationIssueViewMode === "raised"
                    ? sortedStationIssues.length
                    : stationIssues.length}
                  )
                </button>

                <button
                  onClick={() => setStationIssueViewMode("errors")}
                  className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-xs font-bold transition-all ${
                    stationIssueViewMode === "errors"
                      ? "bg-white dark:bg-zinc-700 text-red-600 dark:text-white shadow-md"
                      : "text-zinc-500"
                  }`}
                >
                  {/* Similarly, use the sorted count here for consistency */}
                  Error Batteries (
                  {stationIssueViewMode === "errors"
                    ? sortedStationIssues.length
                    : allBatteries.filter(
                        (b) =>
                          b.status === 3 &&
                          !activeIssuesMap[b.id] &&
                          (b.dealer_id || b.driver_id),
                      ).length}
                  )
                </button>
              </div>
              <div className="w-full md:w-64">
                <CustomSelect
                  options={[
                    { value: "all", label: "All Stations" },
                    ...Array.from(
                      new Set(
                        allBatteries.map((b) => b.dealer_name).filter(Boolean),
                      ),
                    ).map((n) => ({ value: n, label: n })),
                  ]}
                  value={tabStationFilter}
                  onChange={setTabStationFilter}
                  className="!bg-white dark:!bg-zinc-900 !border-zinc-200 dark:!border-zinc-800 !py-3 !rounded-2xl shadow-sm"
                />
              </div>
              <div className="w-full md:w-64">
                <CustomSelect
                  options={[
                    { value: "all", label: "All Statuses" },
                    { value: "AVAILABLE", label: "Available" },
                    { value: "ASSIGNED", label: "Assigned" },
                    { value: "CHARGING", label: "Charging" },
                    { value: "LOW SOC", label: "Low SoC" },
                    { value: "ERROR", label: "Error" },
                  ]}
                  value={tabStatusFilter}
                  onChange={setTabStatusFilter}
                  className="!bg-white dark:!bg-zinc-900 !border-zinc-200 dark:!border-zinc-800 !py-3 !rounded-2xl shadow-sm"
                />
              </div>
              <div className="flex gap-2 ml-auto w-full md:w-auto">
                <button
                  onClick={handleBulkMarkError}
                  disabled={isProcessing}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-xl text-xs font-bold hover:bg-rose-600 shadow-sm transition-all disabled:opacity-50"
                >
                  <NoSymbolIcon className="w-4 h-4" /> Mark as Error
                </button>
                <button
                  onClick={() => setExportWithOccurrence(!exportWithOccurrence)}
                  className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                    exportWithOccurrence
                      ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800"
                      : "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                  }`}
                  title={exportWithOccurrence ? "Exporting latest issue summary with occurrences" : "Exporting all ticket history"}
                >
                  <ClipboardDocumentListIcon className="w-4 h-4" />
                  <span>{exportWithOccurrence ? "Summary Mode" : "All Tickets"}</span>
                </button>
                <button
                  onClick={handleExportStationIssues}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-sm transition-all"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" /> Export CSV
                </button>
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col">
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-950/20">
                <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  {stationIssueViewMode === "raised" ? (
                    <TicketIcon className="w-5 h-5 text-indigo-500" />
                  ) : (
                    <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />
                  )}
                  {stationIssueViewMode === "raised"
                    ? "Raised Station Issues"
                    : "Untracked Error Batteries"}
                </h3>
              </div>
              <div className="overflow-auto scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
                <table className="w-full text-left whitespace-nowrap min-w-[1100px] border-collapse">
                  <thead className="bg-zinc-50/95 dark:bg-zinc-900/95 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10 shadow-sm backdrop-blur-sm">
                    {stationIssueViewMode === "raised" ? (
                      <tr>
                        <SortableHeader
                          label="Battery ID"
                          sortKey="id"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                        <SortableHeader
                          label="IoT ID"
                          sortKey="iot_id"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                        <th className="px-6 py-4 text-[11px] font-bold uppercase text-zinc-500 dark:text-zinc-400 text-center">
                          Status
                        </th>
                        <SortableHeader
                          label="Station"
                          sortKey="dealer_name"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                        <SortableHeader
                          label="Issue"
                          sortKey="ticket.mainDescription"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                        <SortableHeader
                          label="Occurrence"
                          sortKey="occurrenceCount"
                          currentSort={sortConfig}
                          onSort={handleSort}
                          className="text-center"
                        />
                        <SortableHeader
                          label="Removal Factor"
                          sortKey="ticket.removalFactor"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                        <SortableHeader
                          label="Raised Date"
                          sortKey="ticket.createdAt"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                        <SortableHeader
                          label="Last Swap"
                          sortKey="lastSwapDate"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                        <SortableHeader
                          label="Last Update"
                          sortKey="last_updated_on"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                        <th className="px-6 py-4 text-[11px] font-bold uppercase text-zinc-500 dark:text-zinc-400 text-center">
                          Map
                        </th>
                      </tr>
                    ) : (
                      <tr>
                        <SortableHeader
                          label="Battery ID"
                          sortKey="id"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                        <SortableHeader
                          label="IoT ID"
                          sortKey="iot_id"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                        <th className="px-6 py-4 text-[11px] font-bold uppercase text-zinc-500 dark:text-zinc-400 text-center">
                          Status
                        </th>
                        <SortableHeader
                          label="SOC"
                          sortKey="soc"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                        <SortableHeader
                          label="Location"
                          sortKey="dealer_name"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                        <SortableHeader
                          label="Removal Factor"
                          sortKey="ticket.removalFactor"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                        <SortableHeader
                          label="Last Swap"
                          sortKey="lastSwapDate"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                        <SortableHeader
                          label="Last Update"
                          sortKey="last_updated_on"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                        <th className="px-6 py-4 text-[11px] font-bold uppercase text-zinc-500 dark:text-zinc-400 text-center">
                          Map
                        </th>
                        <th className="px-6 py-4 text-[11px] font-bold uppercase text-zinc-500 dark:text-zinc-400 text-right">
                          Action
                        </th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                    {sortedStationIssues.length === 0 ? (
                      <tr>
                        <td
                          colSpan={stationIssueViewMode === "raised" ? 11 : 10}
                          className="py-20 text-center text-sm font-bold text-zinc-400"
                        >
                          No matching assets found. Try adjusting filters.
                        </td>
                      </tr>
                    ) : (
                      getPaginatedData(sortedStationIssues).map((bat, idx) => {
                        const detailedStatus = getDetailedStatus(
                          bat,
                          bat.ticket,
                        );
                        const idStyle = "text-zinc-900 dark:text-zinc-100";

                        return (
                          <tr
                            key={`${bat.id}-${idx}`}
                            className="group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span 
                                  className={`text-sm font-bold ${idStyle} ${onBatterySelect ? 'cursor-pointer hover:text-indigo-600 hover:underline' : ''}`}
                                  onClick={() => {
                                    if (onBatterySelect) {
                                      const foundBat = allBatteries.find(b => b.id === bat.id);
                                      if (foundBat) onBatterySelect(foundBat);
                                      else onBatterySelect({ id: bat.id } as KazamBattery);
                                    }
                                  }}
                                >
                                  {bat.id}
                                </span>
                                <CopyButton text={bat.id} />
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-bold text-zinc-500">
                                {bat.iot_id || "--"}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span
                                className={`inline-block px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all shadow-sm ${getStatusColorClass(detailedStatus)}`}
                              >
                                {detailedStatus}
                              </span>
                            </td>
                            {stationIssueViewMode === "raised" ? (
                              <>
                                <td className="px-6 py-4">
                                  <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                                    {bat.dealer_name || "Hub"}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-col">
                                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                      {bat.ticket?.mainDescription || bat.ticket?.issueType || "Alert Generated"}
                                    </span>
                                    <span
                                      className="text-[10px] font-bold text-zinc-400 whitespace-nowrap truncate max-w-[150px]"
                                      title={bat.ticket?.subDescription || bat.ticket?.description}
                                    >
                                      {bat.ticket?.subDescription || bat.ticket?.description}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <div 
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold text-xs cursor-pointer hover:bg-indigo-100 transition-colors"
                                    onClick={() => {
                                      setSelectedBatteryForHistory(bat.id);
                                      setIsHistoryModalOpen(true);
                                    }}
                                  >
                                    {bat.occurrenceCount || 1}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  {(() => {
                                    const rf = bat.ticket?.removalFactor;
                                    const isOnlineAtRaise = bat.ticket?.isOnlineAtRaise;
                                    const rec = bat.ticket?.removalRecommendation;
                                    
                                    if (rf === undefined || rf === null) {
                                      return (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-150 dark:border-zinc-700 text-[10px] font-semibold">
                                          N/A
                                        </span>
                                      );
                                    }

                                    const percentNum = typeof rf === 'number' ? rf : parseInt(rf);
                                    const lvl = isOnlineAtRaise ? "Auto Rec" : "User Decided";
                                    
                                    let badgeStyle = "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700";
                                    if (percentNum === 100) {
                                      badgeStyle = "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/50";
                                    } else if (percentNum === 80) {
                                      badgeStyle = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/50";
                                    } else if (percentNum === 50) {
                                      badgeStyle = "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/10 dark:text-yellow-600 dark:border-yellow-700/50";
                                    } else if (percentNum === 20) {
                                      badgeStyle = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/50";
                                    } else if (percentNum === 0) {
                                      badgeStyle = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/50";
                                    }

                                    return (
                                      <div className="flex flex-col gap-1 items-start">
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-black uppercase ${badgeStyle}`}>
                                          {rec || `${percentNum}%`}
                                        </span>
                                        <span className="text-[9px] font-bold text-zinc-400 tracking-wide uppercase">
                                          {lvl}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </td>
                                <td className="px-6 py-4">
                                  <span className="text-[10px] font-bold text-zinc-500">
                                    {formatDisplayDate(bat.ticket?.createdAt)}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="text-[10px] font-bold text-zinc-500">
                                    {formatDisplayDate(bat.lastSwapDate)}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <span
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${bat.isOnline ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700"}`}
                                  >
                                    <SignalIcon className="w-3 h-3" />
                                    {formatDisplayDate(bat.last_updated_on)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <button
                                    onClick={() => {
                                      const liveBat = allBatteries.find(b => b.id === bat.id);
                                      setMapProps({
                                        isOpen: true,
                                        coordinates: liveBat?.location?.coordinates,
                                        title: `Battery: ${bat.id}`,
                                        subtitle: bat.dealer_name || "Unknown Location",
                                      });
                                    }}
                                    className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40 transition-all text-center inline-block"
                                    title="View location on map"
                                  >
                                    <MapPinIcon className="w-4 h-4 ml-auto mr-auto" />
                                  </button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-6 py-4">
                                  <span
                                    className={`text-xs font-bold ${bat.soc < 20 ? "text-red-600" : "text-emerald-600"}`}
                                  >
                                    {bat.soc}%
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                                    {bat.driver_id
                                      ? `${bat.driverData?.name || 'Driver'} (${bat.driver_id})`
                                      : bat.dealer_name || "Hub"}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-150 dark:border-zinc-700 text-[10px] font-semibold">
                                    N/A
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="text-[10px] font-bold text-zinc-500">
                                    {formatDisplayDate(bat.lastSwapDate)}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <span
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${bat.isOnline ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700"}`}
                                  >
                                    <SignalIcon className="w-3 h-3" />
                                    {formatDisplayDate(bat.last_updated_on)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <button
                                    onClick={() => {
                                      const liveBat = allBatteries.find(b => b.id === bat.id);
                                      setMapProps({
                                        isOpen: true,
                                        coordinates: liveBat?.location?.coordinates,
                                        title: `Battery: ${bat.id}`,
                                        subtitle: bat.dealer_name || "Unknown Location",
                                      });
                                    }}
                                    className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40 transition-all text-center inline-block"
                                    title="View location on map"
                                  >
                                    <MapPinIcon className="w-4 h-4 ml-auto mr-auto" />
                                  </button>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <button
                                    onClick={() => openRaiseIssueModal(bat.id)}
                                    className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-[10px] font-bold uppercase shadow-sm hover:bg-red-700 transition-all"
                                  >
                                    Raise Ticket
                                  </button>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationFooter
                currentPage={currentPage}
                totalPages={getTotalPages(sortedStationIssues)}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(val) => {
                  setItemsPerPage(val);
                  setCurrentPage(1);
                }}
                dataLength={sortedStationIssues.length}
              />
            </div>
          </div>
        )}

        {activeTab === "ingestion" && (
          <div className="bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-5">
            
            {/* Unified Ingestion Header & Action Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
              
              {/* Left Side: Title + Toggles (Ingestion Type & Input Mode) */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2 shrink-0">
                  <TableCellsIcon className="w-5 h-5 text-indigo-500" />
                  Raw Ingestion
                </h3>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Ingestion Type Pill Selector */}
                  <div className="flex items-center gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl w-fit border border-zinc-200 dark:border-zinc-700/60 shrink-0">
                    <button
                      onClick={() => setIngestionType("battery")}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                        ingestionType === "battery"
                          ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-sm"
                          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                      }`}
                    >
                      Battery
                    </button>
                    <button
                      onClick={() => setIngestionType("alerts")}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                        ingestionType === "alerts"
                          ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-sm"
                          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                      }`}
                    >
                      Alerts
                    </button>
                  </div>

                  {/* Input Mode Selector */}
                  <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl w-fit border border-zinc-200 dark:border-zinc-700/60 shrink-0">
                    <button
                      onClick={() => setInputMode("paste")}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                        inputMode === "paste"
                          ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-sm"
                          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                      }`}
                    >
                      Paste
                    </button>
                    <button
                      onClick={() => setInputMode("upload")}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                        inputMode === "upload"
                          ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-white shadow-sm"
                          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                      }`}
                    >
                      Upload
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Side: Action Buttons */}
              <div className="flex items-center gap-2">
                {inputMode === "paste" && (
                  <button
                    onClick={handleIngestionPasteButton}
                    title="Paste from clipboard"
                    className="flex items-center justify-center p-2.5 text-xs font-bold rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all border border-zinc-200 dark:border-zinc-700"
                  >
                    <ClipboardDocumentIcon className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={clearGrid}
                  className="flex items-center justify-center px-3.5 py-2 text-xs font-bold text-zinc-400 hover:text-red-500 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all border border-transparent"
                >
                  Clear Grid
                </button>

                <button
                  onClick={handleIngestionProcess}
                  disabled={isProcessing}
                  className="flex items-center justify-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold shadow-md hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-95"
                >
                  <BoltIcon
                    className={`w-4 h-4 ${isProcessing ? "animate-pulse" : ""}`}
                  />
                  <span>{isProcessing ? "Processing..." : "Process"}</span>
                </button>
              </div>
            </div>

            {/* Ingestion Input Container */}
            {inputMode === "paste" ? (
              <div className="overflow-hidden">
                {ingestionType === "battery" ? (
                  <ExcelGrid
                    headers={INGESTION_HEADERS}
                    data={gridData}
                    onChange={setGridData}
                    onPasteEvent={(e, r, c) =>
                      handlePasteEvent(e, r, c, setGridData, gridData, 21)
                    }
                  />
                ) : (
                  <ExcelGrid
                    headers={ALERTS_HEADERS}
                    data={alertsGridData}
                    onChange={setAlertsGridData}
                    onPasteEvent={(e, r, c) =>
                      handlePasteEvent(e, r, c, setAlertsGridData, alertsGridData, 6)
                    }
                  />
                )}
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) processFile(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/20 scale-[1.01]"
                    : "border-zinc-300 dark:border-zinc-700 hover:border-indigo-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <CloudArrowUpIcon className="w-12 h-12 text-zinc-400 mx-auto mb-3" />
                <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200">
                  Drag & drop your Excel or CSV spreadsheet here, or click to browse
                </p>
                <p className="text-[11px] font-bold text-zinc-400 mt-1">
                  Supports .xlsx, .xls, .csv, .tsv files
                </p>
                
                {ingestionType === "battery" ? (
                  <div className="mt-4 inline-flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-lg text-[10px] font-bold text-zinc-500">
                    <span>Expected columns: 21 (Battery ID, Solution, Make, Model, Status, etc.)</span>
                  </div>
                ) : (
                  <div className="mt-4 inline-flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-lg text-[10px] font-bold text-zinc-500">
                    <span>Expected columns: 6 (Device ID, Serial Number, Rule Name, Start Time, Breach Value, End Breach Value)</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "actionable" && (
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:justify-between sm:items-center bg-red-50/10 gap-4">
              <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />{" "}
                Actionable Driver List ({sortedMappedDrivers.length !== mappedDrivers.length ? `${sortedMappedDrivers.length} of ${mappedDrivers.length}` : mappedDrivers.length})
              </h3>
              <div className="w-full sm:w-64">
                <CustomSelect
                  multiple
                  placeholder="All Alert Statuses"
                  options={actionableRules.map((rule) => ({ value: rule, label: rule }))}
                  value={actionableRuleFilter}
                  onChange={(val) => {
                    setActionableRuleFilter(val as string[]);
                    setCurrentPage(1);
                  }}
                  className="!bg-white dark:!bg-zinc-900 !border-zinc-200 dark:!border-zinc-800 !py-3 !rounded-2xl shadow-sm"
                />
              </div>
            </div>
            <div className="overflow-auto scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
              <table className="w-full text-left whitespace-nowrap min-w-[800px] border-collapse">
                <thead className="bg-zinc-50/95 dark:bg-zinc-900/95 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10 shadow-sm backdrop-blur-sm">
                  <tr>
                    <SortableHeader
                      label="Driver"
                      sortKey="driverName"
                      currentSort={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Alert Status"
                      sortKey="status"
                      currentSort={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Battery 1"
                      sortKey="bat1_id"
                      currentSort={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Battery 2"
                      sortKey="bat2_id"
                      currentSort={sortConfig}
                      onSort={handleSort}
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                  {mappedDrivers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-20 text-center text-sm font-bold text-zinc-400"
                      >
                        No alerts processed. Paste data in 'Ingestion'.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {getPaginatedData(sortedMappedDrivers).map((item) =>
                        renderRow(item, true, item.alertBatteryId, item.status),
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
            {mappedDrivers.length > 0 && (
              <PaginationFooter
                currentPage={currentPage}
                totalPages={getTotalPages(sortedMappedDrivers)}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(val) => {
                  setItemsPerPage(val);
                  setCurrentPage(1);
                }}
                dataLength={sortedMappedDrivers.length}
              />
            )}
          </div>
        )}

        {activeTab === "operator" && (
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-center bg-orange-50/10 gap-4">
              <div className="flex flex-col gap-1 shrink-0">
                <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <BoltIcon className="w-5 h-5 text-orange-500" /> Operator Alerts
                  ({sortedOperatorAlerts.length !== operatorAlertsList.length ? `${sortedOperatorAlerts.length} of ${operatorAlertsList.length}` : operatorAlertsList.length})
                </h3>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0 z-20">
                <div className="w-full sm:w-60">
                  <CustomSelect
                    multiple
                    placeholder="All Alert Statuses"
                    options={operatorRules.map((rule) => ({ value: rule, label: rule }))}
                    value={operatorRuleFilter}
                    onChange={(val) => {
                      setOperatorRuleFilter(val as string[]);
                      setCurrentPage(1);
                    }}
                    className="!bg-white dark:!bg-zinc-900 !border-zinc-200 dark:!border-zinc-800 !py-3 !rounded-2xl shadow-sm"
                  />
                </div>
                <div className="w-full sm:w-60">
                  <CustomSelect
                    multiple
                    placeholder="All Stations"
                    options={operatorStations.map((station) => ({ value: station, label: station }))}
                    value={operatorStationFilter}
                    onChange={(val) => {
                      setOperatorStationFilter(val as string[]);
                      setCurrentPage(1);
                    }}
                    className="!bg-white dark:!bg-zinc-900 !border-zinc-200 dark:!border-zinc-800 !py-3 !rounded-2xl shadow-sm"
                  />
                </div>
              </div>
            </div>
            <div className="overflow-auto scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
              <table className="w-full text-left whitespace-nowrap min-w-[800px] border-collapse">
                <thead className="bg-zinc-50/95 dark:bg-zinc-900/95 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10 shadow-sm backdrop-blur-sm">
                  <tr>
                    <SortableHeader
                      label="Battery ID"
                      sortKey="batteryId"
                      currentSort={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="IoT ID"
                      sortKey="iotId"
                      currentSort={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Alert"
                      sortKey="ruleName"
                      currentSort={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Breach Value"
                      sortKey="endBreachValue"
                      currentSort={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Station"
                      sortKey="stationName"
                      currentSort={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Status"
                      sortKey="status"
                      currentSort={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="SOC"
                      sortKey="soc"
                      currentSort={sortConfig}
                      onSort={handleSort}
                    />
                    <th className="px-6 py-4 text-[11px] font-bold uppercase text-zinc-500 dark:text-zinc-400 text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                  {sortedOperatorAlerts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-20 text-center text-sm font-bold text-zinc-400"
                      >
                        No operator alerts found.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {getPaginatedData(sortedOperatorAlerts).map((item) => {
                        const hasTicket = !!activeIssuesMap[item.batteryId];
                        const isRecurring = repairedList.some(
                          (r) => r.id === item.batteryId,
                        );
                        const idStyle = "text-zinc-900 dark:text-zinc-100";

                        return (
                          <tr
                            key={item.batteryId + item.ruleName}
                            className={`group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors duration-200 ${isRecurring ? "bg-amber-50/30 dark:bg-amber-900/10" : ""}`}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-sm font-bold ${idStyle}`}
                                >
                                  {item.batteryId}
                                </span>
                                {isRecurring && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[9px] font-bold border border-amber-200 dark:border-amber-800 whitespace-nowrap">
                                    Recurring
                                  </span>
                                )}
                                 {hasTicket && (
                                  <div 
                                    className="relative cursor-pointer hover:scale-110 transition-transform"
                                    onClick={() => {
                                      setSelectedBatteryForHistory(item.batteryId);
                                      setIsHistoryModalOpen(true);
                                    }}
                                  >
                                    <TicketIcon className="w-4 h-4 text-indigo-500" />
                                    {activeIssuesMap[item.batteryId]?.occurrenceCount >= 1 && (
                                      <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-bold px-1 rounded-full border border-white">
                                        {activeIssuesMap[item.batteryId].occurrenceCount}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-bold text-zinc-500 whitespace-nowrap">
                                {item.iotId}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-bold text-orange-600 dark:text-orange-400">
                                {item.ruleName}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-bold text-zinc-900 dark:text-white">
                                {item.endBreachValue}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                                {item.stationName}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase shadow-sm ${getStatusColorClass(item.status)}`}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`text-xs font-bold ${item.soc < 20 ? "text-red-500" : "text-emerald-500"}`}
                              >
                                {item.soc}%
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end items-center gap-2">
                                {item.location?.coordinates && 
                                 item.location.coordinates[0] !== 0 && 
                                 item.location.coordinates[1] !== 0 && (
                                  <a
                                    href={`https://www.google.com/maps?q=${item.location.coordinates[1]},${item.location.coordinates[0]}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    referrerPolicy="no-referrer"
                                    className="p-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-lg transition-colors"
                                    title="View Location on Google Maps"
                                  >
                                    <MapPinIcon className="w-4 h-4" />
                                  </a>
                                )}
                                <button
                                  onClick={() =>
                                    openRaiseIssueModal(item.batteryId)
                                  }
                                  className={`p-2 rounded-lg transition-colors ${hasTicket ? "bg-zinc-100 text-zinc-400" : "bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100"}`}
                                >
                                  <WrenchScrewdriverIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                </tbody>
              </table>
            </div>
            {sortedOperatorAlerts.length > 0 && (
              <PaginationFooter
                currentPage={currentPage}
                totalPages={getTotalPages(sortedOperatorAlerts)}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(val) => {
                  setItemsPerPage(val);
                  setCurrentPage(1);
                }}
                dataLength={sortedOperatorAlerts.length}
              />
            )}
          </div>
        )}



        {activeTab === "fleet" && (
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-visible flex flex-col relative z-20">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-center bg-blue-50/10 gap-6 rounded-t-[2rem] relative z-30">
              <div className="flex flex-col gap-1 shrink-0">
                <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <UserGroupIcon className="w-5 h-5 text-blue-500" /> Full Fleet
                  Status ({sortedFleetList.length})
                </h3>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-7">Monitor & Manage Driver Assets</p>
              </div>

              <div className="flex flex-row items-center justify-end gap-2 sm:gap-3 md:ml-auto w-full md:w-auto overflow-visible flex-wrap">
                {/* Two quick filter buttons requested in header */}
                <button
                  type="button"
                  onClick={() => setFleetShowOnlyWithIssues(!fleetShowOnlyWithIssues)}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
                    fleetShowOnlyWithIssues
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-indigo-100 dark:shadow-none"
                      : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                  }`}
                  title="Filter batteries with active issues"
                >
                  <WrenchScrewdriverIcon className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">With Issues</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFleetShowBreachedOnly(!fleetShowBreachedOnly)}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
                    fleetShowBreachedOnly
                      ? "bg-rose-600 text-white border-rose-600 shadow-rose-100 dark:shadow-none"
                      : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                  }`}
                  title="Filter batteries with swap alerts / breaches"
                >
                  <BellAlertIcon className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">With Alerts</span>
                  {breachedDriverList.length > 0 && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                      fleetShowBreachedOnly 
                        ? "bg-white text-rose-600" 
                        : "bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400"
                    }`}>
                      {breachedDriverList.length}
                    </span>
                  )}
                </button>

                <div className="flex-1 sm:flex-none sm:w-48 lg:w-60 z-20">
                  <CustomSelect 
                    options={[{ value: 'all', label: 'All Cities' }, ...stationGroups.map(g => ({ value: g.id, label: g.name }))]}
                    value={selectedFleetCityGroup}
                    onChange={setSelectedFleetCityGroup}
                    placeholder="All Cities"
                    footer={
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowGroupModal(true);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-3 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-colors text-xs font-bold"
                      >
                        <PlusIcon className="w-3.5 h-3.5" />
                        City Groups
                      </button>
                    }
                  />
                </div>
                
                <div className="relative z-30" ref={fleetFiltersRef}>
                  <button
                    onClick={() => setShowFleetFilters(!showFleetFilters)}
                    className={`p-2.5 rounded-xl border transition-all flex items-center justify-center relative ${
                      fleetShowOnlyWithIssues || fleetShowCriticalOnly || fleetShowSingleBatteryOnly || fleetShowBreachedOnly
                        ? "bg-indigo-50 dark:bg-indigo-900/10 text-indigo-600 border-indigo-200 dark:border-indigo-800"
                        : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    }`}
                    title="Filters"
                  >
                    <AdjustmentsHorizontalIcon className="w-5 h-5" />
                    {(fleetShowOnlyWithIssues || fleetShowCriticalOnly || fleetShowSingleBatteryOnly || fleetShowBreachedOnly) && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-600 rounded-full ring-2 ring-white dark:ring-zinc-900" />
                    )}
                  </button>

                  {showFleetFilters && (
                    <div className="absolute right-0 mt-3 w-72 rounded-[2rem] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 z-50 flex flex-col gap-3.5 animate-in fade-in slide-in-from-top-2 duration-200 font-jakarta">
                        <button
                          onClick={() => {
                            setFleetShowBreachedOnly(!fleetShowBreachedOnly);
                          }}
                          className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between font-jakarta ${
                            fleetShowBreachedOnly
                              ? "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400"
                              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <BellAlertIcon className="w-3.5 h-3.5 text-rose-500" />
                            <span>Swap Breached ({breachedDriverList.length})</span>
                          </span>
                          {fleetShowBreachedOnly && <div className="w-1.5 h-1.5 rounded-full bg-rose-600" />}
                        </button>
                        <button
                          onClick={() => {
                            setFleetShowOnlyWithIssues(!fleetShowOnlyWithIssues);
                          }}
                          className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between font-jakarta ${
                            fleetShowOnlyWithIssues
                              ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400"
                              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                          }`}
                        >
                          <span>With Issues</span>
                          {fleetShowOnlyWithIssues && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                        </button>
                        <button
                          onClick={() => {
                            setFleetShowCriticalOnly(!fleetShowCriticalOnly);
                          }}
                          className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between font-jakarta ${
                            fleetShowCriticalOnly
                              ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                          }`}
                        >
                          <span>Critical (SoC &lt; 30%)</span>
                          {fleetShowCriticalOnly && <div className="w-1.5 h-1.5 rounded-full bg-red-600" />}
                        </button>
                        <button
                          onClick={() => {
                            setFleetShowSingleBatteryOnly(!fleetShowSingleBatteryOnly);
                          }}
                          className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between font-jakarta ${
                            fleetShowSingleBatteryOnly
                              ? "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400"
                              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                          }`}
                        >
                          <span>Single Battery Usage</span>
                          {fleetShowSingleBatteryOnly && <div className="w-1.5 h-1.5 rounded-full bg-orange-600" />}
                        </button>

                        {(fleetShowOnlyWithIssues || fleetShowCriticalOnly || fleetShowSingleBatteryOnly || fleetShowBreachedOnly) && (
                          <button
                            onClick={() => {
                              setFleetShowOnlyWithIssues(false);
                              setFleetShowCriticalOnly(false);
                              setFleetShowSingleBatteryOnly(false);
                              setFleetShowBreachedOnly(false);
                            }}
                            className="text-center text-[10px] text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-200 mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/50 font-bold uppercase transition-colors font-jakarta"
                          >
                            Reset Filters
                          </button>
                        )}
                      </div>
                  )}
                </div>
              </div>
            </div>
            <div className="overflow-auto scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800 border-t border-zinc-100 dark:border-zinc-800/50">
              <table className="w-full text-left whitespace-nowrap min-w-[800px] border-collapse">
                <thead className="bg-zinc-50/95 dark:bg-zinc-900/95 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10 shadow-sm backdrop-blur-sm">
                  <tr>
                    <SortableHeader
                      label="Driver"
                      sortKey="driverName"
                      currentSort={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Battery 1"
                      sortKey="bat1_id"
                      currentSort={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Battery 2"
                      sortKey="bat2_id"
                      currentSort={sortConfig}
                      onSort={handleSort}
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70 bg-white dark:bg-zinc-900">
                  {getPaginatedData(sortedFleetList).map((item) =>
                    renderRow(item, false),
                  )}
                </tbody>
              </table>
            </div>
            {sortedFleetList.length > 0 && (
              <PaginationFooter
                currentPage={currentPage}
                totalPages={getTotalPages(sortedFleetList)}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(val) => {
                  setItemsPerPage(val);
                  setCurrentPage(1);
                }}
                dataLength={sortedFleetList.length}
              />
            )}
          </div>
        )}

        {activeTab === "swap_alerts" && (
          <div className="space-y-6">
            {/* Top Overview & Configuration Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200/80 dark:border-zinc-800/80 p-6 md:p-8 shadow-sm space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center">
                      <BellAlertIcon className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-xl md:text-2xl font-black font-heading text-zinc-900 dark:text-white tracking-tight">
                          Proactive Swap Alerts
                        </h2>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-500 text-white shadow-sm shadow-rose-200 dark:shadow-none">
                          {breachedDriverList.length} At Risk
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        Batteries with active issues that have discharged to or below their safe swap threshold. Prompt drivers to swap at station before breakdown.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Global SoC Threshold Configurator */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-zinc-50 dark:bg-zinc-950/60 p-3.5 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                        Default Safe Limit
                      </span>
                      <span className="text-xs font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded-md border border-rose-200/50 dark:border-rose-900/50">
                        ≤ {globalSwapSocThreshold}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[25, 30, 35, 40, 45].map((preset) => (
                        <button
                          key={preset}
                          onClick={() => updateGlobalSwapSocThreshold(preset)}
                          className={`px-2 py-1 text-[10px] font-black rounded-lg border transition-all ${
                            globalSwapSocThreshold === preset
                              ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                              : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          }`}
                        >
                          {preset}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Filter Bar */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/60">
                {/* Status Tabs */}
                <div className="flex items-center bg-zinc-100/80 dark:bg-zinc-950/60 p-1 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-x-auto scrollbar-none">
                  <button
                    onClick={() => {
                      setSwapAlertsFilterStatus("all");
                      setCurrentPage(1);
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
                      swapAlertsFilterStatus === "all"
                        ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                        : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                    }`}
                  >
                    <span>All Drivers</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      {breachedDriverList.length}
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setSwapAlertsFilterStatus("pending");
                      setCurrentPage(1);
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
                      swapAlertsFilterStatus === "pending"
                        ? "bg-white dark:bg-zinc-900 text-amber-600 dark:text-amber-400 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                    }`}
                  >
                    <span>Pending Alert</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                      {breachedDriverList.filter((d) => !d.notifiedInfo).length}
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setSwapAlertsFilterStatus("notified");
                      setCurrentPage(1);
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
                      swapAlertsFilterStatus === "notified"
                        ? "bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                    }`}
                  >
                    <span>Already Notified</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                      {breachedDriverList.filter((d) => !!d.notifiedInfo).length}
                    </span>
                  </button>
                </div>

                {/* Right Controls: City Group + Refresh */}
                <div className="flex items-center gap-3">
                  <div className="w-48 sm:w-56">
                    <CustomSelect
                      options={[
                        { value: "all", label: "All Cities" },
                        ...stationGroups.map((g) => ({ value: g.id, label: g.name })),
                      ]}
                      value={selectedSwapAlertCityGroup}
                      onChange={(val) => {
                        setSelectedSwapAlertCityGroup(val);
                        setCurrentPage(1);
                      }}
                      placeholder="All Cities"
                    />
                  </div>

                  <button
                    onClick={() => fetchBatteries()}
                    disabled={loadingData}
                    className="p-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-xl transition-all border border-zinc-200 dark:border-zinc-700 shadow-sm"
                    title="Refresh data from Local Storage"
                  >
                    <ArrowPathIcon className={`w-4 h-4 ${loadingData ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Breached Drivers Table / Card List */}
            {filteredBreachedDrivers.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200/80 dark:border-zinc-800/80 p-12 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-center justify-center mx-auto">
                  <CheckBadgeIcon className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                    No Swap Threshold Breaches Found
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
                    {swapAlertsFilterStatus !== "all" || searchQuery.trim() || selectedSwapAlertCityGroup !== "all"
                      ? "No drivers match your current filter criteria. Try resetting your search or filter."
                      : `All assigned batteries with recorded issues are operating safely above their SoC swap limit (Current Default: ≤${globalSwapSocThreshold}%).`}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setActiveTab("fleet")}
                    className="px-5 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                  >
                    Inspect Full Fleet
                  </button>
                  <button
                    onClick={() => updateGlobalSwapSocThreshold(Math.min(60, globalSwapSocThreshold + 5))}
                    className="px-5 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-all"
                  >
                    Increase Safe Limit (+5%)
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm overflow-hidden flex flex-col">
                <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
                  <table className="w-full text-left whitespace-nowrap min-w-[950px] border-collapse">
                    <thead className="bg-zinc-50/95 dark:bg-zinc-950/95 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10 backdrop-blur-sm">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-zinc-400 font-jakarta">
                          Driver & Station
                        </th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-zinc-400 font-jakarta">
                          Problem Battery & Issue
                        </th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-zinc-400 font-jakarta">
                          Current SoC / Limit
                        </th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-zinc-400 font-jakarta">
                          Alert Status
                        </th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-zinc-400 font-jakarta text-right">
                          Proactive Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-jakarta text-xs">
                      {paginatedBreachedDrivers.map((entry) => {
                        const { driver, breaches, primaryBreach, notifiedInfo } = entry;
                        const isPrimaryBat1 = primaryBreach.isBat1;
                        const phone = driver.phone && driver.phone !== "--" ? driver.phone : "";

                        return (
                          <tr
                            key={`${driver.driverId}_${primaryBreach.batteryId}`}
                            className="hover:bg-rose-50/30 dark:hover:bg-rose-950/10 transition-colors"
                          >
                            {/* Driver Details */}
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-black text-sm text-zinc-900 dark:text-white">
                                    {driver.driverName}
                                  </span>
                                  {driver.stationName && driver.stationName !== "--" && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                                      {driver.stationName}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-zinc-500 dark:text-zinc-400 text-[11px] font-medium">
                                  <span>ID: {driver.driverId}</span>
                                  {phone && (
                                    <a
                                      href={`tel:${phone}`}
                                      className="flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                    >
                                      <PhoneIcon className="w-3 h-3" />
                                      <span>{phone}</span>
                                    </a>
                                  )}
                                  {/* Map button if coordinates available */}
                                  {allBatteries.find((b) => b.id === primaryBreach.batteryId)?.location?.coordinates && (
                                    <button
                                      onClick={() => {
                                        const bObj = allBatteries.find((b) => b.id === primaryBreach.batteryId);
                                        if (bObj?.location?.coordinates) {
                                          setMapProps({
                                            isOpen: true,
                                            coordinates: [bObj.location.coordinates[1], bObj.location.coordinates[0]],
                                            title: driver.driverName,
                                            subtitle: `Battery: ${primaryBreach.batteryId} | Station: ${driver.stationName || "Hub"}`,
                                          });
                                        }
                                      }}
                                      className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 inline-flex items-center gap-0.5 font-bold"
                                      title="Locate Driver"
                                    >
                                      <MapPinIcon className="w-3 h-3" />
                                      <span>Map</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Problem Battery & Issue */}
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-black text-xs text-zinc-800 dark:text-zinc-200">
                                    {primaryBreach.batteryId}
                                  </span>
                                  <span className="text-[10px] font-bold text-zinc-400">
                                    ({isPrimaryBat1 ? "Bat 1" : "Bat 2"})
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/60">
                                    {primaryBreach.issue.mainDescription || "Active Issue"}
                                  </span>
                                  {primaryBreach.issue.occurrenceCount && primaryBreach.issue.occurrenceCount > 1 && (
                                    <span className="px-1.5 py-0.2 rounded-md text-[9px] font-black bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                      {primaryBreach.issue.occurrenceCount}x
                                    </span>
                                  )}
                                  {breaches.length > 1 && (
                                    <span className="text-[9px] font-bold text-zinc-400">
                                      +{breaches.length - 1} more issue
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* SoC vs Safe Limit */}
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1.5 min-w-[160px]">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-baseline gap-1.5">
                                    <span className={`text-base font-black ${
                                      primaryBreach.soc <= 20
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-amber-600 dark:text-amber-400"
                                    }`}>
                                      {primaryBreach.soc}%
                                    </span>
                                    <span className="text-[10px] font-bold text-zinc-400">
                                      / limit {primaryBreach.threshold}%
                                    </span>
                                  </div>
                                  <button
                                    onClick={() =>
                                      openSetThresholdModal(
                                        primaryBreach.batteryId,
                                        primaryBreach.threshold,
                                        primaryBreach.soc,
                                        primaryBreach.issue.mainDescription,
                                      )
                                    }
                                    className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                    title="Edit Safe SoC Limit for this battery"
                                  >
                                    <PencilSquareIcon className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                {/* Visual Progress Bar */}
                                <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      primaryBreach.soc <= 20
                                        ? "bg-red-500"
                                        : "bg-amber-500"
                                    }`}
                                    style={{ width: `${Math.min(100, Math.max(5, primaryBreach.soc))}%` }}
                                  />
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-bold text-rose-500">
                                    {primaryBreach.deficit}% below safe limit
                                  </span>
                                  {batteryThresholdOverrides[primaryBreach.batteryId] && (
                                    <span className="text-[9px] font-bold text-indigo-500 italic">
                                      (Custom)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Alert Status */}
                            <td className="px-6 py-4">
                              {notifiedInfo ? (
                                <div className="flex flex-col gap-1">
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-900/60 w-max">
                                    <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500" />
                                    <span>
                                      Notified ({notifiedInfo.channel})
                                    </span>
                                  </span>
                                  <span className="text-[9px] font-medium text-zinc-400">
                                    {new Date(notifiedInfo.timestamp).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                                  </span>
                                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                                    Pending Action
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* Proactive Actions */}
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() =>
                                    openNotifyDriverModal(driver, {
                                      batteryId: primaryBreach.batteryId,
                                      iotId: primaryBreach.iotId,
                                      currentSoc: primaryBreach.soc,
                                      socThreshold: primaryBreach.threshold,
                                      issueDescription: primaryBreach.issue.mainDescription,
                                      stationName: driver.stationName,
                                    })
                                  }
                                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-200 dark:shadow-none transition-all active:scale-95"
                                >
                                  <BellAlertIcon className="w-3.5 h-3.5" />
                                  <span>Notify to Swap</span>
                                </button>

                                {phone && (
                                  <>
                                    <button
                                      onClick={() => {
                                        const msg = generateSwapNotificationMessage(
                                          driver.driverName,
                                          primaryBreach.batteryId,
                                          primaryBreach.soc,
                                          primaryBreach.threshold,
                                          primaryBreach.issue.mainDescription,
                                          driver.stationName || "Hub",
                                        );
                                        sendWhatsAppNotification(
                                          phone,
                                          msg,
                                          driver.driverId,
                                          driver.driverName,
                                          primaryBreach.batteryId,
                                        );
                                      }}
                                      className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200/60 dark:border-emerald-900/60 transition-colors"
                                      title="Send WhatsApp Swap Notice"
                                    >
                                      <ChatBubbleLeftRightIcon className="w-4 h-4" />
                                    </button>

                                    <button
                                      onClick={() =>
                                        callDriver(
                                          phone,
                                          driver.driverId,
                                          driver.driverName,
                                          primaryBreach.batteryId,
                                        )
                                      }
                                      className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 transition-colors"
                                      title="Call Driver"
                                    >
                                      <PhoneIcon className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {filteredBreachedDrivers.length > itemsPerPage && (
                  <PaginationFooter
                    currentPage={currentPage}
                    totalPages={swapAlertsTotalPages}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={(val) => {
                      setItemsPerPage(val);
                      setCurrentPage(1);
                    }}
                    dataLength={filteredBreachedDrivers.length}
                  />
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {isManualPasteOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] w-full max-w-2xl p-8 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold font-heading text-zinc-900 dark:text-white">
                  Manual Data Import
                </h3>
                <p className="text-sm font-bold text-zinc-500">
                  Paste Excel or CSV data directly below.
                </p>
              </div>
              <button
                onClick={() => setIsManualPasteOpen(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
              >
                <XMarkIcon className="w-6 h-6 text-zinc-400" />
              </button>
            </div>
            <textarea
              value={manualPasteText}
              onChange={(e) => setManualPasteText(e.target.value)}
              className="w-full h-64 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 text-xs font-mono outline-none focus:border-indigo-50 dark:focus:ring-indigo-900/10 dark:text-zinc-100 font-bold transition-all resize-none mb-6"
              placeholder="Paste content here..."
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsManualPasteOpen(false)}
                className="px-6 py-3 rounded-xl text-sm font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleManualPasteSubmit}
                disabled={!manualPasteText}
                className="px-8 py-3 rounded-xl bg-indigo-600 text-white font-bold shadow-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                Process Data
              </button>
            </div>
          </div>
        </div>
      )}

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
                {allOpenIssues
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
                            {issue.mainDescription || issue.issueType}
                          </span>
                          <span className="text-[10px] font-bold text-zinc-400">
                            {new Date(issue.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">
                          {issue.subDescription || "No sub-description provided."}
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
                {allOpenIssues.filter((issue) => issue.batteryId === selectedBatteryForHistory).length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircleIcon className="w-8 h-8 text-emerald-500" />
                    </div>
                    <p className="text-zinc-500 font-bold">No open issues found for this asset.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isIssueModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold font-heading text-zinc-900 dark:text-white">
                  Raise Issue
                </h3>
                <p className="text-sm font-bold text-zinc-500">
                  Asset: {selectedBatteryIdForIssue}
                </p>
              </div>
              <button
                onClick={() => setIsIssueModalOpen(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
              >
                <XMarkIcon className="w-6 h-6 text-zinc-400" />
              </button>
            </div>
            <div className="space-y-6 mb-8">
              <div>
                <label className="text-xs font-bold uppercase text-zinc-500 mb-2 block">
                  Issue
                </label>
                <CustomSelect
                  options={[
                    { value: "Select Issue", label: "Select Issue" },
                    ...ISSUE_TYPES.map((t) => ({ value: t, label: t })),
                  ]}
                  value={mainIssueDescription}
                  onChange={(v) => setMainIssueDescription(v as string)}
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-zinc-500 mb-2 block">
                  Sub Description (Optional)
                </label>
                <textarea
                  value={subIssueDescription}
                  onChange={(e) => setSubIssueDescription(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-transparent dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-red-500 outline-none dark:text-zinc-100 font-bold"
                  rows={3}
                  placeholder="Describe fault details..."
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-800">
                <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                  Mark as Error (Status 3)
                </span>
                <button
                  onClick={() => setMarkAsError(!markAsError)}
                  className={`w-14 h-8 rounded-full p-1 transition-all ${markAsError ? "bg-red-500" : "bg-zinc-300 dark:bg-zinc-700"}`}
                >
                  <div
                    className={`w-6 h-6 rounded-full bg-white shadow-sm transition-all transform ${markAsError ? "translate-x-6" : "translate-x-0"}`}
                  />
                </button>
              </div>

              {/* Swap Alert SoC Threshold setting for this issue */}
              <div className="p-4 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                    <BellAlertIcon className="w-4 h-4 text-rose-500" />
                    Swap Alert SoC Trigger Limit (%)
                  </span>
                  <span className="text-xs font-black text-rose-600 dark:text-rose-400 bg-white dark:bg-zinc-900 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800">
                    ≤ {raiseIssueSocThreshold}%
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="10"
                    max="70"
                    step="5"
                    value={raiseIssueSocThreshold}
                    onChange={(e) => setRaiseIssueSocThreshold(Number(e.target.value))}
                    className="flex-1 h-2 bg-rose-200 dark:bg-rose-900/50 rounded-lg appearance-none cursor-pointer accent-rose-600"
                  />
                  <input
                    type="number"
                    min="10"
                    max="70"
                    value={raiseIssueSocThreshold}
                    onChange={(e) => setRaiseIssueSocThreshold(Math.min(70, Math.max(10, Number(e.target.value) || 35)))}
                    className="w-16 px-2.5 py-1 text-center bg-white dark:bg-zinc-900 border border-rose-200 dark:border-rose-800 rounded-lg text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                  Driver will be flagged in Swap Alerts when battery discharges to or below this SoC limit.
                </p>
              </div>

              {(() => {
                const selectedBattery = allBatteries.find(b => b.id === selectedBatteryIdForIssue);
                const isOnlineSelected = selectedBattery ? isOnline(selectedBattery) : false;
                return (
                  <>
                    {isOnlineSelected && (mainIssueDescription === 'UV issue' || mainIssueDescription === 'UV issue observed again') && (
                      <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-800/50 rounded-2xl space-y-2">
                        <label className="text-xs font-bold uppercase text-indigo-700 dark:text-indigo-400 block">
                          SoC at which issue occurred (%)
                        </label>
                        <div className="flex items-center gap-3">
                          <input 
                            type="number" 
                            min="0" 
                            max="100" 
                            value={socAtOccurrence} 
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              setSocAtOccurrence(isNaN(val) ? 0 : Math.min(100, Math.max(0, val)));
                            }}
                            className="w-24 px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-855 rounded-lg text-sm font-bold text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                          <span className="text-[11px] font-bold text-zinc-400">
                            Current SoC: <span className="text-zinc-700 dark:text-zinc-351">{selectedBattery?.soc}%</span>
                          </span>
                        </div>
                      </div>
                    )}

                    {mainIssueDescription !== 'Select Issue' && (
                      <div className="p-4 rounded-2xl border bg-zinc-50 dark:bg-zinc-950 border-zinc-150 dark:border-zinc-800">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                            Removal Decision Factor
                          </span>
                          <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-lg border ${isOnlineSelected ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800' : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'}`}>
                            {isOnlineSelected ? 'Battery Online' : 'Battery Offline'}
                          </span>
                        </div>

                        {isOnlineSelected ? (
                          (() => {
                            const rec = getRemovalRecommendation(mainIssueDescription, true, socAtOccurrence);
                            const displayPercent = rec.percent !== null ? `${rec.percent}%` : 'N/A';
                            const badgeBg = rec.percent === 100 
                              ? 'bg-red-500 text-white' 
                              : rec.percent === 80 
                                ? 'bg-amber-500 text-white' 
                                : rec.percent === 50 
                                  ? 'bg-yellow-500 text-zinc-900 dark:text-zinc-900' 
                                  : rec.percent === 20
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-zinc-400 text-white';

                            return (
                              <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                  <span className={`text-base font-black px-2.5 py-1 rounded-xl shrink-0 ${badgeBg}`}>
                                    {displayPercent}
                                  </span>
                                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                                    Network Removal Priority
                                  </span>
                                </div>
                                <p className="text-[11px] font-bold text-zinc-500 leading-relaxed">
                                  {rec.message}
                                </p>
                              </div>
                            );
                          })()
                        ) : (
                          <div className="space-y-3">
                            <p className="text-xs font-bold text-zinc-500">
                              Offline battery. Please decide network removal priority manually:
                            </p>
                            <div className="flex gap-1.5 flex-wrap">
                              {['Keep (0%)', '20%', '50%', '80%', '100%'].map((lvl) => (
                                <button
                                  key={lvl}
                                  type="button"
                                  onClick={() => setManualRemovalFactor(lvl)}
                                  className={`flex-1 min-w-[60px] py-2 text-[10px] font-black rounded-lg border transition-all ${
                                    manualRemovalFactor === lvl
                                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100 dark:shadow-none'
                                      : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                                  }`}
                                >
                                  {lvl}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            <button
              onClick={handleRaiseIssue}
              disabled={!mainIssueDescription || mainIssueDescription === "Select Issue" || isSubmittingIssue}
              className="w-full py-3 rounded-xl bg-red-600 text-white font-bold font-button shadow-lg shadow-red-200 dark:shadow-none hover:bg-red-700 disabled:opacity-50 transition-all"
            >
              {isSubmittingIssue ? "Processing..." : "Confirm & Raise"}
            </button>
          </div>
        </div>
      )}

      {showGroupModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                  <BuildingOfficeIcon className="w-6 h-6 text-indigo-500" />
                  Manage City Groups
                </h3>
                <p className="text-sm font-bold text-zinc-400 mt-1 uppercase tracking-widest text-[10px]">Create groups of stations for filtering</p>
              </div>
              <button 
                onClick={() => {
                   setShowGroupModal(false);
                   setNewGroupName('');
                   setSelectedStationsForGroup([]);
                }} 
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
              >
                <XMarkIcon className="w-6 h-6 text-zinc-400" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1 min-h-0 overflow-hidden">
              <div className="space-y-6 flex flex-col min-h-0">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">City/Group Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Pune, Bangalore..."
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all dark:text-zinc-100"
                  />
                </div>

                <div className="space-y-2 flex-1 flex flex-col min-h-0 overflow-hidden">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Select Stations ({selectedStationsForGroup.length})</label>
                  <div className="flex-1 overflow-y-auto overflow-x-hidden border border-zinc-100 dark:border-zinc-800 rounded-2xl p-2 bg-zinc-50/50 dark:bg-zinc-950/20 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
                    <div className="space-y-1">
                      {stations.map(station => (
                        <button
                          key={station.id}
                          onClick={() => {
                            setSelectedStationsForGroup(prev => 
                              prev.includes(station.id) 
                                ? prev.filter(id => id !== station.id) 
                                : [...prev, station.id]
                            );
                          }}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                            selectedStationsForGroup.includes(station.id)
                              ? 'bg-indigo-600 text-white shadow-md'
                              : 'hover:bg-white dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                          }`}
                        >
                          <span className="text-[11px] font-bold truncate pr-2">{station.name}</span>
                          {selectedStationsForGroup.includes(station.id) && <CheckIcon className="w-4 h-4 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button 
                  onClick={createGroup}
                  disabled={!newGroupName.trim() || selectedStationsForGroup.length === 0}
                  className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-none disabled:opacity-50 mt-auto"
                >
                  Create Group
                </button>
              </div>

              <div className="space-y-6 flex flex-col min-h-0 overflow-hidden">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Existing Groups</label>
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
                  {stationGroups.length === 0 ? (
                    <div className="p-12 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-3xl">
                      <BuildingStorefrontIcon className="w-8 h-8 text-zinc-200 mx-auto mb-3" />
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">No groups yet</p>
                    </div>
                  ) : (
                    stationGroups.map(group => (
                      <div 
                        key={group.id} 
                        className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-5 rounded-3xl shadow-sm group hover:border-indigo-100 dark:hover:border-indigo-900/30 transition-all"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <h4 className="font-bold text-zinc-900 dark:text-white">{group.name}</h4>
                          <button 
                            onClick={(e) => deleteGroup(group.id, e)}
                            className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(group.stationNames || []).slice(0, 3).map((name, i) => (
                            <span key={i} className="px-2 py-0.5 bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-lg text-[9px] font-bold truncate max-w-[100px]">
                              {name}
                            </span>
                          ))}
                          {group.stationNames && group.stationNames.length > 3 && (
                            <span className="px-2 py-0.5 bg-zinc-50 dark:bg-zinc-800 text-zinc-400 rounded-lg text-[9px] font-bold">
                              +{group.stationNames.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isInactiveImportOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] w-full max-w-4xl h-[80vh] p-8 shadow-2xl flex flex-col animate-in fade-in zoom-in-95 border border-zinc-200 dark:border-zinc-800">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold font-heading text-zinc-900 dark:text-white">
                  Bulk Update Inactive Assets
                </h3>
                <p className="text-sm font-bold text-zinc-500">
                  Update unassigned battery context.
                </p>
              </div>
              <button
                onClick={() => setIsInactiveImportOpen(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
              >
                <XMarkIcon className="w-6 h-6 text-zinc-400" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col bg-zinc-50/50 dark:bg-zinc-950/30 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-1">
              <ExcelGrid
                headers={INACTIVE_IMPORT_HEADERS}
                data={inactiveImportGrid}
                onChange={setInactiveImportGrid}
                onPasteEvent={(e, r, c) =>
                  handlePasteEvent(
                    e,
                    r,
                    c,
                    setInactiveImportGrid,
                    inactiveImportGrid,
                    2,
                  )
                }
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsInactiveImportOpen(false)}
                className="px-6 py-3 rounded-xl text-sm font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleInactiveImportProcess}
                disabled={isInactiveImporting}
                className="px-8 py-3 rounded-xl bg-indigo-600 text-white font-bold shadow-lg hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {isInactiveImporting ? (
                  "Processing..."
                ) : (
                  <>
                    <CloudArrowUpIcon className="w-5 h-5" /> Import Context
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {isWatchlistModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] w-full max-w-4xl h-[80vh] p-8 shadow-2xl flex flex-col animate-in fade-in zoom-in-95 border border-zinc-200 dark:border-zinc-800">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold font-heading text-zinc-900 dark:text-white">
                  Add to Watchlist
                </h3>
                <p className="text-sm font-bold text-zinc-500">
                  Track recurring issues.
                </p>
              </div>
              <button
                onClick={() => setIsWatchlistModalOpen(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
              >
                <XMarkIcon className="w-6 h-6 text-zinc-400" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col bg-zinc-50/50 dark:bg-zinc-950/30 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-1">
              <ExcelGrid
                headers={WATCHLIST_HEADERS}
                data={watchlistGridData}
                onChange={setWatchlistGridData}
                onPasteEvent={(e, r, c) =>
                  handlePasteEvent(
                    e,
                    r,
                    c,
                    setWatchlistGridData,
                    watchlistGridData,
                    3,
                  )
                }
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsWatchlistModalOpen(false)}
                className="px-6 py-3 rounded-xl text-sm font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkWatchlistAdd}
                disabled={isWatchlistProcessing}
                className="px-8 py-3 rounded-xl bg-amber-500 text-white font-bold shadow-lg hover:bg-amber-600 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {isWatchlistProcessing ? (
                  "Processing..."
                ) : (
                  <>
                    <ShieldCheckIcon className="w-5 h-5" /> Update Watchlist
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {isDispatchModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] w-full max-w-5xl h-[80vh] p-8 shadow-2xl flex flex-col animate-in fade-in zoom-in-95 border border-zinc-200 dark:border-zinc-800">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold font-heading text-zinc-900 dark:text-white">
                  Bulk Plant Dispatch
                </h3>
                <p className="text-sm font-bold text-zinc-500">
                  Record batteries sent for service.
                </p>
              </div>
              <button
                onClick={() => setIsDispatchModalOpen(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
              >
                <XMarkIcon className="w-6 h-6 text-zinc-400" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col bg-zinc-50/50 dark:bg-zinc-950/30 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-1">
              <ExcelGrid
                headers={DISPATCH_HEADERS}
                data={plantGridData}
                onChange={setPlantGridData}
                onPasteEvent={(e, r, c) =>
                  handlePasteEvent(e, r, c, setPlantGridData, plantGridData, 5)
                }
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsDispatchModalOpen(false)}
                className="px-6 py-3 rounded-xl text-sm font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDispatch}
                disabled={isPlantProcessing}
                className="px-8 py-3 rounded-xl bg-indigo-600 text-white font-bold shadow-lg hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {isPlantProcessing ? (
                  "Processing..."
                ) : (
                  <>
                    <ArrowRightOnRectangleIcon className="w-5 h-5" /> Confirm
                    Dispatch
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {isReceiveModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] w-full max-w-5xl h-[80vh] p-8 shadow-2xl flex flex-col animate-in fade-in zoom-in-95 border border-zinc-200 dark:border-zinc-800">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold font-heading text-zinc-900 dark:text-white">
                  Bulk Plant Receive
                </h3>
                <p className="text-sm font-bold text-zinc-500">
                  Record batteries returning from service.
                </p>
              </div>
              <button
                onClick={() => setIsReceiveModalOpen(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
              >
                <XMarkIcon className="w-6 h-6 text-zinc-400" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col bg-zinc-50/50 dark:bg-zinc-950/30 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-1">
              <ExcelGrid
                headers={RECEIVE_HEADERS}
                data={plantGridData}
                onChange={setPlantGridData}
                onPasteEvent={(e, r, c) =>
                  handlePasteEvent(e, r, c, setPlantGridData, plantGridData, 4)
                }
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsReceiveModalOpen(false)}
                className="px-6 py-3 rounded-xl text-sm font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkReturn}
                disabled={isPlantProcessing}
                className="px-8 py-3 rounded-xl bg-emerald-600 text-white font-bold shadow-lg hover:bg-emerald-700 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {isPlantProcessing ? (
                  "Processing..."
                ) : (
                  <>
                    <ArrowRightOnRectangleIcon className="w-5 h-5 rotate-180" />{" "}
                    Confirm Receive
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {isRechargeModalOpen && (
        <RechargeModal
          driverId={rechargeDriverId}
          driverName={rechargeDriverName}
          WALLET_REASONS={WALLET_REASONS}
          walletUpdate={walletUpdate}
          onClose={() => setIsRechargeModalOpen(false)}
          showToast={showToast}
        />
      )}

      {isPenaltyModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="relative bg-white dark:bg-zinc-900 rounded-3xl sm:rounded-[2.5rem] w-full max-w-4xl h-[92vh] sm:h-[85vh] p-4 sm:p-6 md:p-8 shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 sm:mb-6 border-b border-zinc-100 dark:border-zinc-800 pb-4 sm:pb-5 pr-8 sm:pr-12">
              <div>
                <h3 className="text-lg sm:text-xl font-bold font-heading text-zinc-900 dark:text-white flex items-center gap-2">
                  <ReceiptPercentIcon className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500" /> Penalty Insights
                </h3>
                <p className="text-xs font-bold text-zinc-500 mt-1 uppercase tracking-wider font-mono">Driver ID: {penaltyDriverId}</p>
              </div>
              
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end">
                {currentDriverActive !== null && (
                  <div className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                    <span className="text-[9px] sm:text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                      Driver Status:
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleDriverActiveStatus(penaltyDriverId)}
                      disabled={driverStatusLoading}
                      className={`relative inline-flex h-5 w-10 sm:h-6 sm:w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        currentDriverActive ? "bg-emerald-500" : "bg-red-400"
                      } ${driverStatusLoading ? "opacity-60 cursor-not-allowed" : ""}`}
                      title={currentDriverActive ? "Click to de-activate driver" : "Click to activate driver"}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 sm:h-5 sm:w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          currentDriverActive ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                    <span className={`text-[9px] sm:text-[10px] font-black uppercase tracking-wider ${currentDriverActive ? "text-emerald-500" : "text-red-500"}`}>
                      {currentDriverActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <button 
              type="button" 
              onClick={() => setIsPenaltyModalOpen(false)} 
              className="absolute top-4 right-4 sm:top-6 sm:right-6 p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full shrink-0 flex items-center justify-center cursor-pointer text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors z-20"
              aria-label="Close"
            >
              <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2} />
            </button>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {isLoadingPenalties ? (
                <div className="h-full flex flex-col items-center justify-center gap-4 py-20">
                  <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Calculating Penalties...</span>
                </div>
              ) : penaltyData ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-4">
                  <div className="lg:col-span-5 space-y-6">
                    <div className="bg-zinc-50/50 dark:bg-zinc-800/20 p-6 rounded-[2rem] border border-zinc-100 dark:border-zinc-800">
                      <h4 className="text-xs font-black uppercase text-zinc-400 tracking-widest mb-4">Calendar View</h4>
                      {renderCalendar()}
                    </div>
                    
                    <div className="p-6 rounded-[2rem] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                       <h4 className="text-[10px] font-black uppercase text-zinc-400 mb-4 tracking-[0.2em] flex items-center gap-2">
                          <CurrencyRupeeIcon className="w-4 h-4" /> Financial Summary
                       </h4>
                       <div className="space-y-4">
                          <div className="flex justify-between items-center p-4 rounded-2xl bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30">
                             <span className="text-xs font-bold text-rose-600 dark:text-rose-400">Total Penalty</span>
                             <span className="text-lg font-bold text-rose-700 dark:text-rose-300">₹{penaltyData.total_unpaid_penalty}</span>
                          </div>
                          <div className="flex justify-between items-center p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30">
                             <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Unpaid Penalty</span>
                             <span className="text-lg font-bold text-amber-700 dark:text-amber-300">₹{penaltyData.total_pending_penalty}</span>
                          </div>
                          <div className="flex justify-between items-center p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30">
                             <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Paid Penalty</span>
                             <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">₹{penaltyData.total_unpaid_penalty - penaltyData.total_pending_penalty}</span>
                          </div>
                       </div>
                    </div>
                  </div>

                  <div className="lg:col-span-7 space-y-6">
                    <div className="bg-zinc-50/50 dark:bg-zinc-800/20 p-6 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 flex flex-col h-full">
                      <div className="mb-6">
                        <h4 className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] flex items-center gap-2">
                           <ExclamationTriangleIcon className="w-4 h-4 text-rose-500" /> Penalty History
                        </h4>
                        <p className="text-[10px] font-bold text-zinc-400 mt-1 uppercase tracking-wider">Detailed breakdown by month</p>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        {renderPenaltyList()}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20">
                  <p className="text-zinc-400 font-bold">Failed to load data.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isSwapHistoryModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-[1.5rem] sm:rounded-[2.5rem] w-full max-w-5xl h-[82vh] sm:h-[85vh] p-4 sm:p-8 shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800/80 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4 sm:mb-6 w-full">
              <div>
                <h3 className="text-lg sm:text-xl font-bold font-heading text-zinc-900 dark:text-white flex items-center gap-2">
                  <ArrowPathIcon className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-500 animate-spin-slow" /> Swapping Session Logs
                </h3>
                <p className="text-[10px] sm:text-xs font-bold text-zinc-500 mt-1 uppercase tracking-wider">
                  Last 10 Swaps for Driver: <span className="text-indigo-600 dark:text-indigo-400 font-mono font-black">{swapHistoryDriverId}</span>
                </p>
              </div>
              <button onClick={() => setIsSwapHistoryModalOpen(false)} className="p-1.5 sm:p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-400" />
              </button>
            </div>

            <div className="flex-1 bg-zinc-50/50 dark:bg-zinc-950/20 rounded-[1rem] sm:rounded-[2rem] border border-zinc-100 dark:border-zinc-800/50 p-2 sm:p-6 overflow-hidden flex flex-col">
              {isLoadingSwapHistory ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 pb-24">
                  <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Fetching swap logs...</span>
                </div>
              ) : swapHistoryData.length > 0 ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                  
                  {/* MOBILE & TABLET CARD LAYOUT (Screen sizes below MD) */}
                  <div className="block md:hidden space-y-4 pb-4">
                    {swapHistoryData.map((session, idx) => {
                      const dateVal = session.timestamp ? new Date(session.timestamp * 1000) : null;
                      const dateStrOnly = dateVal ? dateVal.toLocaleDateString() : '--';
                      const timeStrOnly = dateVal ? dateVal.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : '--';
                      const totalAmount = session.amount + (session.penalty_paid_amount || session.total_penalty_paid || 0);
                      const penaltyAmount = session.penalty_paid_amount || session.total_penalty_paid || 0;
                      return (
                        <div key={session._id || idx} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 p-4 shadow-sm flex flex-col gap-3.5">
                          {/* Card Header: Amount, Mode & Date */}
                          <div className="flex items-start justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
                            <div className="flex flex-col gap-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                              <div className="flex items-center gap-1.5">
                                <CalendarIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-300 leading-tight">{dateStrOnly}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <ClockIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 leading-tight">{timeStrOnly}</span>
                              </div>
                            </div>
                            <div className="text-right flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-black text-xs text-zinc-900 dark:text-white">₹{totalAmount}</span>
                                <span className={`inline-flex px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                  session.mode === 'cash' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400' :
                                  session.mode === 'wallet' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400' :
                                  'bg-zinc-100 text-zinc-600'
                                }`}>
                                  {session.mode}
                                </span>
                              </div>
                              <div className="flex gap-2 text-[9px] font-bold">
                                <span className="text-emerald-600 dark:text-emerald-400">Swap: ₹{session.amount}</span>
                                <span className="text-rose-500 dark:text-rose-400">Penalty: ₹{penaltyAmount}</span>
                              </div>
                            </div>
                          </div>

                          {/* Card Meta Bar: Station */}
                          <div className="bg-zinc-50 dark:bg-zinc-950/30 p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800/40 text-[11px] flex justify-between items-center">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-bold text-zinc-400 uppercase text-[9px] shrink-0">Station:</span>
                              <span className="font-extrabold text-zinc-800 dark:text-zinc-200 flex items-center gap-1 whitespace-nowrap truncate">
                                <BuildingStorefrontIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" strokeWidth={2} />
                                {session.dealer_name || '--'}
                              </span>
                              <button
                                type="button"
                                onClick={() => setSelectedStationCalcSession(session)}
                                className="p-1 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg text-indigo-500 hover:text-indigo-650 transition-colors shrink-0"
                                title="Click to open calculation and wallet topup"
                              >
                                <WalletIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Batteries Grid */}
                          <div className="grid grid-cols-2 gap-3">
                            {/* Old batteries (IN) */}
                            <div className="space-y-1.5">
                              <span className="text-[9px] font-black uppercase text-rose-500 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse"></span>
                                Batteries IN (Old)
                              </span>
                              <div className="space-y-1">
                                {session.old_battries?.map((bat: string, i: number) => {
                                  const oldSoc = session.soc_details?.old_soc?.[i];
                                  const bObj = allBatteries.find((b) => b.id === bat);
                                  const iotId = bObj?.iot_id || "";
                                  return (
                                    <div key={bat} className="flex items-center gap-1.5 bg-rose-50/40 dark:bg-rose-950/10 px-2 py-1 rounded-lg border border-rose-100/30 dark:border-rose-900/10 justify-between">
                                      <div className="flex items-center gap-1 min-w-0">
                                        <Battery50Icon className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                        <span className="font-mono text-[9px] font-bold text-zinc-600 dark:text-zinc-400 truncate">{bat}</span>
                                        {iotId && (
                                          <CopyButton text={iotId} />
                                        )}
                                      </div>
                                      {oldSoc !== undefined && (
                                        <span className="text-[9px] font-black bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 px-1 rounded shrink-0">{oldSoc}%</span>
                                      )}
                                    </div>
                                  );
                                }) || <span className="text-zinc-400 text-[10px]">--</span>}
                              </div>
                            </div>

                            {/* New batteries (OUT) */}
                            <div className="space-y-1.5">
                              <span className="text-[9px] font-black uppercase text-emerald-500 flex items-center gap-1 align-middle">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                Batteries OUT (New)
                              </span>
                              <div className="space-y-1">
                                {session.new_battries?.map((bat: string, i: number) => {
                                  const newSoc = session.soc_details?.new_soc?.[i];
                                  const bObj = allBatteries.find((b) => b.id === bat);
                                  const iotId = bObj?.iot_id || "";
                                  return (
                                    <div key={bat} className="flex items-center gap-1.5 bg-emerald-50/40 dark:bg-emerald-950/10 px-2 py-1 rounded-lg border border-emerald-100/30 dark:border-emerald-900/10 justify-between">
                                      <div className="flex items-center gap-1 min-w-0">
                                        <BoltIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                        <span className="font-mono text-[9px] font-bold text-zinc-600 dark:text-zinc-400 truncate">{bat}</span>
                                        {iotId && (
                                          <CopyButton text={iotId} />
                                        )}
                                      </div>
                                      {newSoc !== undefined && (
                                        <span className="text-[9px] font-black bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-1 rounded shrink-0">{newSoc}%</span>
                                      )}
                                    </div>
                                  );
                                }) || <span className="text-zinc-400 text-[10px]">--</span>}
                              </div>
                            </div>
                          </div>

                          {/* SoC Progress bars */}
                          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                            <div className="space-y-1">
                              <div className="flex flex-col text-[10px] font-mono font-bold text-zinc-500 leading-none pb-0.5">
                                <div className="flex justify-between w-full">
                                  <span>B1: <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">{session.soc_range_1 ?? '--'}%</span></span>
                                  <span>ODO1: <span className="text-zinc-800 dark:text-zinc-200 font-extrabold">{session.odometer_range_1 ?? '--'}km</span></span>
                                </div>
                              </div>
                              <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="bg-indigo-500 h-full rounded-full" 
                                  style={{ width: `${session.soc_range_1 ?? 0}%` }}
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div className="flex flex-col text-[10px] font-mono font-bold text-zinc-500 leading-none pb-0.5">
                                <div className="flex justify-between w-full">
                                  <span>B2: <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">{session.soc_range_2 ?? '--'}%</span></span>
                                  <span>ODO2: <span className="text-zinc-800 dark:text-zinc-200 font-extrabold">{session.odometer_range_2 ?? '--'}km</span></span>
                                </div>
                              </div>
                              <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="bg-indigo-500 h-full rounded-full" 
                                  style={{ width: `${session.soc_range_2 ?? 0}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* DESKTOP TABLE VIEW (MD screens and above) */}
                  <div className="hidden md:block">
                    <table className="w-full text-left text-xs border-collapse min-w-[900px]">
                      <thead className="bg-white/95 dark:bg-zinc-900/95 sticky top-0 z-10 shadow-sm backdrop-blur-sm border-b border-zinc-200 dark:border-zinc-800">
                        <tr className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                          <th className="py-3 px-4 whitespace-nowrap">Time</th>
                          <th className="py-3 px-4 whitespace-nowrap">Station</th>
                          <th className="py-3 px-4 whitespace-nowrap">Batteries IN (Old)</th>
                          <th className="py-3 px-4 whitespace-nowrap">Batteries OUT (New)</th>
                          <th className="py-3 px-4 min-w-[120px] whitespace-nowrap">SoC Consumed</th>
                          <th className="py-3 px-4 whitespace-nowrap">Total Amount</th>
                          <th className="py-3 px-4 whitespace-nowrap">Payment</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                        {swapHistoryData.map((session, idx) => {
                          const dateVal = session.timestamp ? new Date(session.timestamp * 1000) : null;
                          const dateStrOnly = dateVal ? dateVal.toLocaleDateString() : '--';
                          const timeStrOnly = dateVal ? dateVal.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : '--';
                          const totalAmount = session.amount + (session.penalty_paid_amount || session.total_penalty_paid || 0);
                          const penaltyAmount = session.penalty_paid_amount || session.total_penalty_paid || 0;
                          return (
                            <tr key={session._id || idx} className="hover:bg-zinc-100/40 dark:hover:bg-zinc-800/20 transition-all duration-150">
                              <td className="py-4 px-4 whitespace-nowrap">
                                <div className="flex flex-col gap-1 select-all">
                                  <div className="flex items-center gap-1.5">
                                    <CalendarIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                    <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-300 leading-tight">{dateStrOnly}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <ClockIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                    <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 leading-tight">{timeStrOnly}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-4 font-bold text-zinc-700 dark:text-zinc-200 whitespace-nowrap">
                                <div className="flex items-center gap-2 whitespace-nowrap">
                                  <BuildingStorefrontIcon className="w-4 h-4 text-zinc-400 shrink-0" />
                                  <span>{session.dealer_name || '--'}</span>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedStationCalcSession(session)}
                                    className="p-1 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg text-indigo-500 hover:text-indigo-650 transition-colors shrink-0"
                                    title="Click to open calculation and wallet topup"
                                  >
                                    <WalletIcon className="w-4 h-4 shrink-0" />
                                  </button>
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex flex-col gap-1.5 max-w-[160px]">
                                  {session.old_battries?.map((bat: string, i: number) => {
                                    const oldSoc = session.soc_details?.old_soc?.[i];
                                    const bObj = allBatteries.find((b) => b.id === bat);
                                    const iotId = bObj?.iot_id || "";
                                    return (
                                      <div key={bat} className="flex items-center gap-1.5 bg-rose-50/40 dark:bg-rose-950/10 px-2 py-1 rounded-lg border border-rose-100/30 dark:border-rose-900/10 justify-between">
                                        <div className="flex items-center gap-1 min-w-0">
                                          <Battery50Icon className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                          <span className="font-mono text-[10px] font-bold text-zinc-600 dark:text-zinc-400 truncate">{bat}</span>
                                          {iotId && (
                                            <CopyButton text={iotId} />
                                          )}
                                        </div>
                                        {oldSoc !== undefined && (
                                          <span className="text-[9px] font-black bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 px-1 rounded shrink-0">{oldSoc}%</span>
                                        )}
                                      </div>
                                    );
                                  }) || <span className="text-zinc-400">--</span>}
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex flex-col gap-1.5 max-w-[160px]">
                                  {session.new_battries?.map((bat: string, i: number) => {
                                    const newSoc = session.soc_details?.new_soc?.[i];
                                    const bObj = allBatteries.find((b) => b.id === bat);
                                    const iotId = bObj?.iot_id || "";
                                    return (
                                      <div key={bat} className="flex items-center gap-1.5 bg-emerald-50/40 dark:bg-emerald-950/10 px-2 py-1 rounded-lg border border-emerald-100/30 dark:border-emerald-900/10 justify-between">
                                        <div className="flex items-center gap-1 min-w-0">
                                          <BoltIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                          <span className="font-mono text-[10px] font-bold text-zinc-600 dark:text-zinc-400 truncate">{bat}</span>
                                          {iotId && (
                                            <CopyButton text={iotId} />
                                          )}
                                        </div>
                                        {newSoc !== undefined && (
                                          <span className="text-[9px] font-black bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1 rounded shrink-0">{newSoc}%</span>
                                        )}
                                      </div>
                                    );
                                  }) || <span className="text-zinc-400">--</span>}
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex flex-col gap-2 select-none min-w-[170px]">
                                  <div className="space-y-0.5">
                                    <div className="flex justify-between text-[10px] font-mono font-semibold text-zinc-500 gap-2 whitespace-nowrap">
                                      <span>B1: <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">{session.soc_range_1 ?? '--'}%</span></span>
                                      <span>ODO1: <span className="text-zinc-800 dark:text-zinc-200 font-extrabold">{session.odometer_range_1 ?? '--'}km</span></span>
                                    </div>
                                    <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1 rounded-full overflow-hidden">
                                      <div 
                                        className="bg-indigo-500 h-full rounded-full" 
                                        style={{ width: `${session.soc_range_1 ?? 0}%` }}
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="flex justify-between text-[10px] font-mono font-semibold text-zinc-500 gap-2 whitespace-nowrap">
                                      <span>B2: <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">{session.soc_range_2 ?? '--'}%</span></span>
                                      <span>ODO2: <span className="text-zinc-800 dark:text-zinc-200 font-extrabold">{session.odometer_range_2 ?? '--'}km</span></span>
                                    </div>
                                    <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1 rounded-full overflow-hidden">
                                      <div 
                                        className="bg-indigo-500 h-full rounded-full" 
                                        style={{ width: `${session.soc_range_2 ?? 0}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-4 whitespace-nowrap">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-zinc-900 dark:text-white font-black text-sm">
                                    ₹{totalAmount}
                                  </span>
                                  <div className="flex flex-col text-[9px] leading-tight font-black uppercase tracking-wide mt-0.5">
                                    <span className="text-emerald-600 dark:text-emerald-400">
                                      Swap: ₹{session.amount}
                                    </span>
                                    <span className="text-red-500 dark:text-red-400">
                                      Penalty: {penaltyAmount > 0 ? `₹${penaltyAmount}` : "0"}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-4 font-medium">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                  session.mode === 'cash' ? 'bg-amber-100/70 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400' :
                                  session.mode === 'wallet' ? 'bg-emerald-100/70 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400' :
                                  'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                                }`}>
                                  {session.mode}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 py-20 text-zinc-400">
                  <ClockIcon className="w-12 h-12 text-zinc-300 dark:text-zinc-700 font-light" />
                  <span className="text-sm font-bold uppercase tracking-wider">No Swapping Sessions Found</span>
                  <span className="text-[11px] font-medium text-zinc-400">This driver has no recorded swap logs.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedStationCalcSession && (
        <CalculatorModal
          session={selectedStationCalcSession}
          driverId={swapHistoryDriverId}
          driverName={swapHistoryDriverName}
          WALLET_REASONS={WALLET_REASONS}
          walletUpdate={walletUpdate}
          getDriverWalletHistory={getDriverWalletHistory}
          onClose={() => setSelectedStationCalcSession(null)}
          showToast={showToast}
        />
      )}

      {isWalletHistoryModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-[1.5rem] sm:rounded-[2.5rem] w-full max-w-3xl h-[80vh] sm:h-[80vh] p-4 sm:p-8 shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4 sm:mb-6">
              <div>
                <h3 className="text-lg sm:text-xl font-bold font-heading text-zinc-900 dark:text-white flex items-center gap-2">
                  <CurrencyRupeeIcon className="w-5 h-5 sm:w-6 sm:h-6 text-purple-500" /> Wallet History (Last 7 Days)
                </h3>
                <p className="text-[10px] sm:text-xs font-bold text-zinc-500 mt-1 uppercase tracking-wider">
                  Driver ID: <span className="text-purple-600 dark:text-purple-400 font-mono font-black">{walletHistoryDriverId}</span>
                </p>
              </div>
              <button onClick={() => setIsWalletHistoryModalOpen(false)} className="p-1.5 sm:p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-400" />
              </button>
            </div>

            <div className="flex-1 bg-zinc-50/50 dark:bg-zinc-950/20 rounded-[1rem] sm:rounded-[2rem] border border-zinc-100 dark:border-zinc-800/50 p-3 sm:p-6 overflow-hidden flex flex-col">
              {isLoadingWalletHistory ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
                  <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Loading Wallet Logs...</span>
                </div>
              ) : walletHistoryData.length > 0 ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                  <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60 font-medium">
                    {walletHistoryData.map((log, idx) => {
                      const amount = log.amount ?? 0;
                      const isCredit = log.type === 'cr' || log.type === 'credit' || log.action?.toLowerCase() === 'credit';
                      
                      const originalNotes = log.notes || log.reason || log.description || log.remark || (isCredit ? 'Wallet Topup' : 'Debit Session');
                      let simplifiedNotes = originalNotes;
                      const lowerNotes = originalNotes.toLowerCase();
                      if (lowerNotes.startsWith('battery swap') || lowerNotes.includes('battery swap')) {
                        simplifiedNotes = 'Battery Swap';
                      } else if (lowerNotes.includes('wallet recharged by dealer') || log.reason) {
                        const rawReason = log.reason || originalNotes.split('dealer:')[1]?.trim() || '';
                        if (rawReason) {
                          simplifiedNotes = rawReason
                            .replace(/_/g, ' ')
                            .replace(/-/g, ' ')
                            .split(' ')
                            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                            .join(' ');
                        }
                      }

                      const dateText = log.date || log.createdAt || log.timestamp 
                        ? new Date(log.date || log.createdAt || (log.timestamp * 1000)).toLocaleString() 
                        : 'N/A';
                      
                      const balanceBefore = log.balance?.before !== undefined ? log.balance.before : undefined;
                      const balanceAfter = log.balance?.after !== undefined ? log.balance.after : undefined;
                      
                      return (
                        <div key={log._id || log.id || idx} className="flex flex-row justify-between items-center py-4 hover:bg-zinc-100/20 dark:hover:bg-zinc-800/5 transition-all px-1 sm:px-2 border-b border-zinc-100/30 gap-4">
                          <div className="flex items-start gap-2.5 sm:gap-4 flex-1 min-w-0">
                            <div className={`p-2 sm:p-2.5 rounded-2xl shrink-0 ${isCredit ? 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600' : 'bg-rose-50 dark:bg-rose-900/10 text-rose-600'}`}>
                              <WalletIcon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                            </div>
                            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                              <span className="text-xs sm:text-sm font-bold text-zinc-800 dark:text-zinc-200 capitalize break-words leading-tight sm:leading-normal">
                                <span className="sm:hidden">{simplifiedNotes}</span>
                                <span className="hidden sm:inline">{originalNotes}</span>
                              </span>
                              <span className="text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{dateText}</span>
                              {log.id && (
                                <span className="text-[8px] sm:text-[9px] font-mono text-zinc-400 truncate">TxID: {log.id}</span>
                              )}
                            </div>
                          </div>
                          
                          <div className="text-right shrink-0 flex flex-col items-end justify-center self-center pl-2">
                            <span className={`text-xs sm:text-sm font-black font-mono ${isCredit ? 'text-emerald-600' : 'text-rose-500'} whitespace-nowrap`}>
                              {isCredit ? '+' : '-'}₹{Math.abs(amount)}
                            </span>
                            {balanceBefore !== undefined && balanceAfter !== undefined ? (
                              <div className="text-[8px] sm:text-[10px] font-semibold text-zinc-400 mt-0.5 whitespace-nowrap">
                                Balance: ₹{balanceBefore} → ₹{balanceAfter}
                              </div>
                            ) : log.balance !== undefined ? (
                              <div className="text-[8px] sm:text-[10px] font-semibold text-zinc-400 mt-0.5 whitespace-nowrap">
                                Balance: ₹{log.balance}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 py-20 text-zinc-400">
                  <CurrencyRupeeIcon className="w-12 h-12 text-zinc-300 dark:text-zinc-700" />
                  <span className="text-sm font-bold uppercase tracking-wider">No Wallet logs found</span>
                  <span className="text-[11px] font-medium text-zinc-400 text-center max-w-sm">
                    No transactions recorded for this driver in the last 7 days.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {toast.show && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] w-[calc(100%-2rem)] sm:w-max max-w-md animate-in fade-in slide-in-from-bottom-3 duration-300">
          <div className="bg-zinc-900/95 dark:bg-zinc-50/95 backdrop-blur-md text-white dark:text-zinc-900 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center justify-center sm:justify-start gap-3 text-xs sm:text-sm font-bold border border-white/10 dark:border-zinc-200/50">
            <ClipboardDocumentIcon className="w-5 h-5 text-indigo-400 shrink-0" />
            <span className="text-center sm:text-left leading-relaxed">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Set Battery Safe Swap SoC Threshold Modal */}
      {isSetThresholdModalOpen && targetBatteryForThreshold && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-[2.5rem] p-6 md:p-8 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-6">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center">
                  <AdjustmentsHorizontalIcon className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                    Set Safe Swap SoC Limit
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    Configure when driver should be alerted to swap this battery.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSetThresholdModalOpen(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-400 transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Battery & Issue Info */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-950/60 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500 font-medium">Battery ID</span>
                <span className="font-mono font-black text-zinc-900 dark:text-white">
                  {targetBatteryForThreshold.batteryId}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500 font-medium">Active Fault</span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                  {targetBatteryForThreshold.issueType || "Operational Issue"}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500 font-medium">Current Charge</span>
                <span className="font-black text-zinc-800 dark:text-zinc-200">
                  {targetBatteryForThreshold.currentSoc}% SoC
                </span>
              </div>
            </div>

            {/* Threshold Configurator */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                  Alert Trigger Limit
                </label>
                <span className="text-lg font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-3 py-1 rounded-xl border border-rose-200/50 dark:border-rose-900/50">
                  ≤ {customThresholdInput}%
                </span>
              </div>

              {/* Presets */}
              <div className="flex gap-2">
                {[20, 25, 30, 35, 40, 45, 50].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCustomThresholdInput(val)}
                    className={`flex-1 py-2 text-xs font-black rounded-xl border transition-all ${
                      customThresholdInput === val
                        ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                        : "bg-zinc-50 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    {val}%
                  </button>
                ))}
              </div>

              {/* Slider & Input */}
              <div className="flex items-center gap-4 pt-2">
                <input
                  type="range"
                  min="10"
                  max="70"
                  step="1"
                  value={customThresholdInput}
                  onChange={(e) => setCustomThresholdInput(Number(e.target.value))}
                  className="flex-1 h-2 bg-rose-200 dark:bg-rose-950 rounded-lg appearance-none cursor-pointer accent-rose-600"
                />
                <input
                  type="number"
                  min="10"
                  max="70"
                  value={customThresholdInput}
                  onChange={(e) => setCustomThresholdInput(Math.min(70, Math.max(10, Number(e.target.value) || 35)))}
                  className="w-16 px-2.5 py-1.5 text-center bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-black text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-rose-500 outline-none"
                />
              </div>

              <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">
                When this battery drops to or below <strong className="text-zinc-700 dark:text-zinc-300">{customThresholdInput}% SoC</strong>, the driver will be flagged in Swap Alerts to visit station before shutdown.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  resetBatterySocThreshold(targetBatteryForThreshold.batteryId);
                  setIsSetThresholdModalOpen(false);
                }}
                className="px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              >
                Reset to Default ({globalSwapSocThreshold}%)
              </button>
              <button
                type="button"
                onClick={() => {
                  setBatterySocThreshold(targetBatteryForThreshold.batteryId, customThresholdInput);
                  setIsSetThresholdModalOpen(false);
                }}
                className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-lg shadow-rose-200 dark:shadow-none transition-all active:scale-95"
              >
                Save Custom Limit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proactive Driver Notification Modal */}
      {isNotifyModalOpen && notificationDriver && notificationBreach && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-xl rounded-[2.5rem] p-6 md:p-8 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-6 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/50 flex items-center justify-center">
                  <MegaphoneIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                    Notify Driver to Swap
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    Proactively alert driver to swap battery at nearest station.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsNotifyModalOpen(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-400 transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Target Driver & Battery Snapshot */}
            <div className="grid grid-cols-2 gap-3 p-4 bg-zinc-50 dark:bg-zinc-950/60 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-400">Driver</span>
                <p className="font-black text-zinc-900 dark:text-white truncate">
                  {notificationDriver.driverName}
                </p>
                <p className="text-zinc-500 text-[11px]">{notificationDriver.phone || "No phone"}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-400">Station</span>
                <p className="font-bold text-zinc-800 dark:text-zinc-200 truncate">
                  {notificationBreach.stationName || "Battery Dost Hub"}
                </p>
              </div>
              <div className="pt-2 border-t border-zinc-200/40 dark:border-zinc-800/40">
                <span className="text-[10px] uppercase font-bold text-zinc-400">Battery & Fault</span>
                <p className="font-mono font-bold text-zinc-800 dark:text-zinc-200 truncate">
                  {notificationBreach.batteryId}
                </p>
                <p className="text-rose-600 dark:text-rose-400 text-[10px] font-bold">
                  {notificationBreach.issueDescription}
                </p>
              </div>
              <div className="pt-2 border-t border-zinc-200/40 dark:border-zinc-800/40">
                <span className="text-[10px] uppercase font-bold text-zinc-400">Charge Status</span>
                <p className="font-black text-rose-600 dark:text-rose-400">
                  {notificationBreach.currentSoc}% SoC
                </p>
                <p className="text-zinc-400 text-[10px]">Safe Limit: ≤{notificationBreach.socThreshold}%</p>
              </div>
            </div>

            {/* Editable Message Box */}
            <div className="space-y-1.5 flex-1 min-h-0 flex flex-col">
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center justify-between">
                <span>Alert Message (WhatsApp / SMS)</span>
                <button
                  type="button"
                  onClick={() => copyNotificationMessage(notificationMessageText)}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 font-bold"
                >
                  <DocumentDuplicateIcon className="w-3.5 h-3.5" />
                  <span>Copy Text</span>
                </button>
              </label>
              <textarea
                value={notificationMessageText}
                onChange={(e) => setNotificationMessageText(e.target.value)}
                className="w-full flex-1 min-h-[140px] p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-mono leading-relaxed outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-800 dark:text-zinc-200 resize-none font-medium"
              />
            </div>

            {/* Notification Actions */}
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-2 gap-2.5">
                {notificationDriver.phone && (
                  <button
                    type="button"
                    onClick={() => {
                      sendWhatsAppNotification(
                        notificationDriver.phone,
                        notificationMessageText,
                        notificationDriver.driverId,
                        notificationDriver.driverName,
                        notificationBreach.batteryId,
                      );
                      setIsNotifyModalOpen(false);
                    }}
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md shadow-emerald-200 dark:shadow-none transition-all active:scale-95"
                  >
                    <ChatBubbleLeftRightIcon className="w-4 h-4" />
                    <span>Send via WhatsApp</span>
                  </button>
                )}

                {notificationDriver.phone && (
                  <button
                    type="button"
                    onClick={() => {
                      callDriver(
                        notificationDriver.phone,
                        notificationDriver.driverId,
                        notificationDriver.driverName,
                        notificationBreach.batteryId,
                      );
                      setIsNotifyModalOpen(false);
                    }}
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-md shadow-indigo-200 dark:shadow-none transition-all active:scale-95"
                  >
                    <PhoneIcon className="w-4 h-4" />
                    <span>Call Driver Directly</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    markDriverAsNotified(
                      notificationDriver.driverId,
                      notificationDriver.driverName,
                      notificationBreach.batteryId,
                      "manual",
                    );
                    setIsNotifyModalOpen(false);
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                >
                  Mark as Notified (Manual)
                </button>
                <button
                  type="button"
                  onClick={() => setIsNotifyModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map modal popup */}
      <MapModal
        isOpen={mapProps.isOpen}
        onClose={() => setMapProps(prev => ({ ...prev, isOpen: false }))}
        coordinates={mapProps.coordinates}
        title={mapProps.title}
        subtitle={mapProps.subtitle}
      />
    </div>
  );
};

// ==========================================
// OPTIMIZED ISOLATED MODAL SUB-COMPONENTS
// ==========================================

interface CalculatorModalProps {
  session: any | null;
  driverId: string;
  driverName: string;
  WALLET_REASONS: string[];
  walletUpdate: (args: any) => Promise<any>;
  getDriverWalletHistory: (driverId: string, fromDate: string, toDate: string) => Promise<any>;
  onClose: () => void;
  showToast: (msg: string) => void;
}

const CalculatorModal: React.FC<CalculatorModalProps> = ({
  session,
  driverId = "",
  driverName = "",
  WALLET_REASONS,
  walletUpdate,
  getDriverWalletHistory,
  onClose,
  showToast
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [calcRechargeAmount, setCalcRechargeAmount] = useState("");
  const [calcRechargeReason, setCalcRechargeReason] = useState("Dispute resolution");
  const [isCalcRecharging, setIsCalcRecharging] = useState(false);
  const [calcWalletHistoryData, setCalcWalletHistoryData] = useState<any[]>([]);
  const [isLoadingCalcWalletHistory, setIsLoadingCalcWalletHistory] = useState(false);

  if (!session) return null;

  const oldSocs = session.soc_details?.old_soc || [];
  let soc1 = oldSocs[0] !== undefined ? Number(oldSocs[0]) : null;
  let soc2 = oldSocs[1] !== undefined ? Number(oldSocs[1]) : null;

  // Fallback to 100 - consumed if details not present
  if (soc1 === null && session.soc_range_1 !== undefined) {
    soc1 = Math.max(0, 100 - Number(session.soc_range_1));
  }
  if (soc2 === null && session.soc_range_2 !== undefined) {
    soc2 = Math.max(0, 100 - Number(session.soc_range_2));
  }

  const s1 = soc1 ?? 0;
  const s2 = soc2 ?? 0;
  const swapAmount = session.amount !== undefined ? Number(session.amount) : 0;
  const sumSocs = s1 + s2;
  const ratio = sumSocs / 200;
  const resultAmount = Math.floor(ratio * swapAmount);

  // Auto pre-populate amount
  useEffect(() => {
    setCalcRechargeAmount(String(resultAmount));
  }, [resultAmount]);

  const fetchCalcWalletHistory = async (id: string) => {
    if (!id) return;
    setIsLoadingCalcWalletHistory(true);
    try {
      const today = new Date();
      const lastWeek = new Date();
      lastWeek.setDate(today.getDate() - 7);
      
      const res = await getDriverWalletHistory(id, lastWeek.toISOString(), today.toISOString());
      if (res && res.data && Array.isArray(res.data.entries)) {
        setCalcWalletHistoryData(res.data.entries);
      } else if (res && res.success && res.data && Array.isArray(res.data.entries)) {
        setCalcWalletHistoryData(res.data.entries);
      } else if (res && Array.isArray(res.walletHistory)) {
        setCalcWalletHistoryData(res.walletHistory);
      } else if (res && Array.isArray(res)) {
        setCalcWalletHistoryData(res);
      } else {
        setCalcWalletHistoryData([]);
      }
    } catch (err) {
      console.error(err);
      setCalcWalletHistoryData([]);
    } finally {
      setIsLoadingCalcWalletHistory(false);
    }
  };

  useEffect(() => {
    fetchCalcWalletHistory(driverId);
  }, [driverId]);

  const handleCalcRechargeSubmit = async () => {
    if (!driverId || !calcRechargeAmount || isNaN(parseFloat(calcRechargeAmount))) {
      showToast("Please enter a valid amount.");
      return;
    }
    setIsCalcRecharging(true);
    try {
      const json = await walletUpdate({
        driver_id: driverId,
        amount: parseFloat(calcRechargeAmount),
        reason: calcRechargeReason,
      });
      if (json.success || json.status === "success" || json.message?.toLowerCase().includes("success")) {
        showToast("Wallet recharged successfully!");
        setCalcRechargeAmount("");
        fetchCalcWalletHistory(driverId);
      } else {
        showToast(json.message || "Failed to recharge wallet.");
      }
    } catch (err) {
      showToast("Error recharging wallet.");
    } finally {
      setIsCalcRecharging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/85 backdrop-blur-md p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] w-full max-w-5xl p-5 sm:p-8 shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col my-auto max-h-[95vh] sm:max-h-[90vh] md:max-h-[85vh] animate-in zoom-in-95 duration-150 relative">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b border-zinc-100 dark:border-zinc-800/80 pb-4 mb-4 sm:mb-6 shrink-0">
          <div>
            <h3 className="text-lg sm:text-xl font-bold font-heading text-zinc-900 dark:text-white flex items-center gap-2">
              <WalletIcon className="w-6 h-6 text-indigo-500" /> Wallet Hub
            </h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs">
              {driverName && <span className="font-extrabold text-zinc-800 dark:text-zinc-200">{driverName}</span>}
              <span className="text-zinc-400">|</span>
              <span className="text-zinc-500 font-bold uppercase tracking-wider">Driver ID: <span className="font-mono text-indigo-650 dark:text-indigo-400 font-extrabold">{driverId}</span></span>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors shrink-0"
            type="button"
            title="Close"
          >
            <XMarkIcon className="w-6 h-6 text-zinc-400" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-6 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-8 min-h-0 custom-scrollbar">
          
          {/* Left Column (Calculations at top, wallet topup just below it) */}
          <div className="space-y-6 flex flex-col justify-start">
            
            {/* Split 1: Calculation Stats */}
            <div className="p-4 sm:p-5 bg-zinc-50/50 dark:bg-zinc-950/40 rounded-2xl border border-zinc-100 dark:border-zinc-800/50 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase text-zinc-400 tracking-wider">Station & Swap Details</span>
                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 truncate max-w-[200px]">{session.dealer_name || '--'}</span>
              </div>
              
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 text-center">
                  <span className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider">B1 SoC</span>
                  <span className="block text-lg font-black text-zinc-800 dark:text-zinc-200 mt-0.5">{s1}%</span>
                </div>
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 text-center">
                  <span className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider">B2 SoC</span>
                  <span className="block text-lg font-black text-zinc-800 dark:text-zinc-200 mt-0.5">{s2}%</span>
                </div>
                <div className="p-3 bg-emerald-50/30 dark:bg-emerald-950/20 rounded-xl border border-emerald-100/10 dark:border-emerald-800/10 text-center">
                  <span className="block text-[9px] font-bold text-emerald-500 uppercase tracking-wider">Swap Amt</span>
                  <span className="block text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">₹{swapAmount}</span>
                </div>
              </div>

              {/* Calculated Result Highlighting */}
              <div className="p-4 bg-indigo-50/40 dark:bg-indigo-950/20 rounded-xl border border-indigo-100/30 dark:border-indigo-900/20 flex justify-between items-center gap-3">
                <div className="text-left">
                  <span className="block text-[9px] font-bold uppercase text-indigo-550 dark:text-indigo-400 tracking-wider">
                    Calculated Result
                  </span>
                  <span className="block text-2xl font-black font-heading text-indigo-605 dark:text-indigo-400">
                    ₹{resultAmount}
                  </span>
                </div>
                
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(String(resultAmount));
                    setIsCopied(true);
                    showToast(`Copied ₹${resultAmount}`);
                    setTimeout(() => setIsCopied(false), 2000);
                  }}
                  className={`py-2 px-4 transition-all rounded-xl font-bold text-[10px] uppercase tracking-wider shrink-0 ${
                    isCopied
                      ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/10"
                      : "bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-850 border border-zinc-200 dark:border-zinc-850 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {isCopied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Split 2: Wallet Top-up Panel */}
            <div className="p-4 sm:p-5 bg-zinc-50/50 dark:bg-zinc-950/40 rounded-2xl border border-zinc-100 dark:border-zinc-850/50 space-y-4">
              <span className="text-xs font-bold uppercase text-zinc-400 tracking-wider block">Wallet Top-up</span>
              
              <div className="space-y-3.5">
                <div>
                  <label className="text-[10px] font-bold uppercase text-zinc-400 mb-1.5 block ml-0.5">Recharge Amount (₹)</label>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">
                      <CurrencyRupeeIcon className="w-5 h-5" />
                    </div>
                    <input 
                      type="number"
                      value={calcRechargeAmount}
                      onChange={(e) => setCalcRechargeAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="w-full pl-10 pr-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-zinc-400 mb-1.5 block ml-0.5">Recharge Reason</label>
                  <CustomSelect
                    options={[
                      ...WALLET_REASONS.map(r => ({ value: r, label: r })),
                      { value: "Battery Swap Bill Settlement", label: "Battery Swap Bill Settlement" }
                    ]}
                    value={calcRechargeReason}
                    onChange={setCalcRechargeReason}
                    className="!py-3 !rounded-xl !bg-white dark:!bg-zinc-900 !border-zinc-200 dark:!border-zinc-800"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleCalcRechargeSubmit}
                  disabled={isCalcRecharging || !calcRechargeAmount}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:hover:bg-emerald-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 disabled:shadow-none transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                >
                  {isCalcRecharging ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Recharging...</span>
                    </>
                  ) : (
                    <>
                      <WalletIcon className="w-5 h-5 shrink-0" />
                      <span>Confirm Topup</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>

          {/* Right Column (Recent Wallet History (7 Days)) */}
          <div className="flex flex-col h-full min-h-[250px] lg:min-h-0">
            <div className="flex justify-between items-center mb-3 shrink-0">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-1 flex items-center gap-1.5">
                <ClockIcon className="w-4 h-4 text-zinc-400" /> Recent Wallet History (7 Days)
              </span>
              <button
                type="button"
                onClick={() => fetchCalcWalletHistory(driverId)}
                className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 dark:text-zinc-500 transition-colors shrink-0"
                title="Refresh logs"
              >
                <ArrowPathIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 bg-zinc-50/50 dark:bg-zinc-950/20 rounded-2xl border border-zinc-100 dark:border-zinc-800/50 p-4 overflow-y-auto max-h-[350px] lg:max-h-full custom-scrollbar text-xs">
              {isLoadingCalcWalletHistory ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                  <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest animate-pulse">Syncing logs...</span>
                </div>
              ) : calcWalletHistoryData.length > 0 ? (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-medium">
                  {calcWalletHistoryData.map((log, idx) => {
                    const amount = log.amount ?? 0;
                    const isCredit = log.type === 'cr' || log.type === 'credit' || log.action?.toLowerCase() === 'credit';
                    
                    const originalNotes = log.notes || log.reason || log.description || log.remark || (isCredit ? 'Wallet Topup' : 'Debit Session');
                    let simplifiedNotes = originalNotes;
                    const lowerNotes = originalNotes.toLowerCase();
                    if (lowerNotes.startsWith('battery swap') || lowerNotes.includes('battery swap')) {
                      simplifiedNotes = 'Battery Swap';
                    } else if (lowerNotes.includes('wallet recharged by dealer') || log.reason) {
                      const rawReason = log.reason || originalNotes.split('dealer:')[1]?.trim() || '';
                      if (rawReason) {
                        simplifiedNotes = rawReason;
                      }
                    }

                    // Strict fallback chain for parsing the timestamp to display the actual date/time
                    const rawTime = log.timestamp || log.createdAt || log.created_at || log.date || log.datetime || log.updatedAt || log.updated_at || log.time;
                    const logTime = rawTime
                      ? new Date(rawTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                      : '--';

                    return (
                      <div key={log._id || log.id || idx} className="flex justify-between items-center py-3 hover:bg-zinc-100/10 dark:hover:bg-zinc-800/5 px-2 rounded-xl transition-all border-b border-zinc-100/30 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2 rounded-xl shrink-0 ${isCredit ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-600'}`}>
                            <WalletIcon className="w-4 h-4 text-current" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate leading-tight">
                              {simplifiedNotes}
                            </span>
                            <span className="text-[10px] text-zinc-400 font-mono mt-0.5">
                              {logTime}
                            </span>
                          </div>
                        </div>
                        <span className={`text-[13px] font-extrabold shrink-0 ${isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-450'}`}>
                          {isCredit ? '+' : '-'}₹{amount}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-zinc-400 text-center">
                  <CurrencyRupeeIcon className="w-10 h-10 text-zinc-300 dark:text-zinc-700" />
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">No transactions found</p>
                  <p className="text-[10px] text-zinc-405 max-w-xs mt-0.5">No transactions recorded for this driver in the last 7 days.</p>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Footer actions */}
        <div className="border-t border-zinc-100 dark:border-zinc-800/80 pt-4 mt-4 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-all rounded-xl font-bold text-xs uppercase tracking-wide shadow-sm"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};

interface RechargeModalProps {
  driverId: string;
  driverName: string;
  WALLET_REASONS: string[];
  walletUpdate: (args: any) => Promise<any>;
  onClose: () => void;
  showToast: (msg: string) => void;
}

const RechargeModal: React.FC<RechargeModalProps> = ({
  driverId,
  driverName,
  WALLET_REASONS,
  walletUpdate,
  onClose,
  showToast
}) => {
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [rechargeReason, setRechargeReason] = useState("Dispute resolution");
  const [isRecharging, setIsRecharging] = useState(false);

  const handleRechargeSubmit = async () => {
    if (!driverId || !rechargeAmount || isNaN(parseFloat(rechargeAmount))) {
      showToast("Please enter a valid amount.");
      return;
    }
    setIsRecharging(true);
    try {
      const json = await walletUpdate({
        driver_id: driverId,
        amount: parseFloat(rechargeAmount),
        reason: rechargeReason,
      });
      if (json.success || json.status === "success" || json.message?.toLowerCase().includes("success")) {
        showToast("Wallet recharged successfully!");
        onClose();
      } else {
        showToast(json.message || "Failed to recharge wallet.");
      }
    } catch (err) {
      showToast("Error recharging wallet.");
    } finally {
      setIsRecharging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl flex flex-col animate-in zoom-in-95 border border-zinc-200 dark:border-zinc-800">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-xl font-bold font-heading text-zinc-900 dark:text-white flex items-center gap-2">
              <WalletIcon className="w-6 h-6 text-emerald-500" /> Recharge Wallet
            </h3>
            {driverName && (
              <p className="text-sm font-extrabold text-zinc-800 dark:text-zinc-200 mt-1">{driverName}</p>
            )}
            <p className="text-xs font-bold text-zinc-500 mt-0.5 uppercase tracking-wider">Driver ID: {driverId}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
            <XMarkIcon className="w-6 h-6 text-zinc-400" />
          </button>
        </div>
        
        <div className="space-y-6">
          <div>
            <label className="text-xs font-bold uppercase text-zinc-400 mb-2 block ml-1">Recharge Amount (₹)</label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">
                <CurrencyRupeeIcon className="w-5 h-5" />
              </div>
              <input 
                type="number"
                value={rechargeAmount}
                onChange={(e) => setRechargeAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full pl-12 pr-4 py-4 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-zinc-400 mb-2 block ml-1">Recharge Reason</label>
            <CustomSelect
              options={WALLET_REASONS.map(r => ({ value: r, label: r }))}
              value={rechargeReason}
              onChange={setRechargeReason}
              className="!py-4 !rounded-2xl !bg-zinc-50 dark:!bg-zinc-800/50 !border-zinc-100 dark:!border-zinc-800"
            />
          </div>

          <button
            onClick={handleRechargeSubmit}
            disabled={isRecharging || !rechargeAmount}
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-all disabled:opacity-50"
          >
            {isRecharging ? "Recharging..." : "Confirm Recharge"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertDriversPage;
