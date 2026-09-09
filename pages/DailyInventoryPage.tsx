
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ClipboardCheck as ClipboardCheckIcon, 
  RefreshCw as ArrowPathIcon, 
  Plus as PlusIcon, 
  Share as ShareIcon, 
  CheckCircle as CheckCircleIcon,
  Store as BuildingStorefrontIcon,
  X as XMarkIcon,
  Search as SearchIcon,
  Filter as FilterIcon,
  Users as UsersIcon,
  Trash2 as TrashIcon,
  ShieldCheck as ShieldCheckIcon,
  History as HistoryIcon,
  ArrowRightLeft as ArrowRightLeftIcon,
  ClipboardList as ClipboardListIcon,
  LayoutDashboard as LayoutDashboardIcon,
  FileSpreadsheet as FileSpreadsheetIcon,
  Upload as UploadIcon,
  FileText as FileTextIcon
} from 'lucide-react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  addDoc, 
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDoc,
  deleteDoc,
  Firestore,
  QueryDocumentSnapshot,
  DocumentData
} from "firebase/firestore";
import { User } from "firebase/auth";
import { useBatteryData } from '@/hooks/useBatteryData';
import { Station, KazamBattery } from '@/types';
import CustomSelect from '@/components/CustomSelect';
import SortableHeader from '@/components/SortableHeader';
import PaginationFooter from '@/components/PaginationFooter';
import { toPng } from 'html-to-image';
import { usePopup } from '@/components/PopupContext';

interface DailyInventoryPageProps {
  isDarkMode: boolean;
  db: Firestore;
  user: User;
}

interface InventoryItemMaster {
  id: string;
  name: string;
  category: string;
  unit: string;
}

interface StationInventory {
  id: string;
  stationId: string;
  itemId: string;
  count: number;
  lastUpdated: string;
}

interface InventoryMovement {
  id: string;
  itemId: string;
  itemName: string;
  sourceType: 'Office' | 'Station';
  sourceId: string; // 'OFFICE' or stationId
  sourceName: string;
  destType: 'Office' | 'Station';
  destId: string; // 'OFFICE' or stationId
  destName: string;
  quantity: number;
  timestamp: string;
  user: string;
}

interface StationGroup {
  id: string;
  name: string;
  stationIds?: string[];
  stationNames?: string[];
  type: string;
}

interface VerificationLog {
  id?: string;
  stationId: string;
  verifiedAt: string;
  verifiedBy: string;
  auditType?: 'quick' | 'complete';
  discrepancies?: { itemName: string; expected: number; actual: number }[];
  auditedItems?: { itemName: string; expected: number; actual: number }[];
  notes?: string;
  items?: string[]; 
}

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

    let statusNum = 0;
    if (statusStr.toLowerCase() === "assigned") statusNum = 2;
    else if (statusStr.toLowerCase() === "error") statusNum = 3;
    else if (statusStr.toLowerCase() === "charging") statusNum = 4;

    const validDriver = isValidDriverId(driverId, driverName);
    const cleanDriverId = validDriver ? driverId : undefined;
    const cleanDriverName = validDriver ? (driverName || "Unknown") : undefined;
    const cleanDriverPhone = validDriver ? (driverMobile || "--") : undefined;

    const lastSwapTs = lastSwapped ? (new Date(lastSwapped).getTime() || 0) : 0;

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
      last_swap_on: lastSwapTs,
      total_swaps: totalSwaps,
      odometer: totalSwaps * 15,
      dealer_name: stationName,
      dealer_id: stationId,
      network: true,
      last_updated_on: Date.now(),
      driver_id: cleanDriverId,
      driverData: cleanDriverId ? {
        id: cleanDriverId,
        name: cleanDriverName!,
        phone: cleanDriverPhone!
      } : undefined,
      location: {
        coordinates: [lng, lat]
      }
    });
  });
  return list;
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
                        id={`cell-${actualRowIdx}-${cIdx}`}
                        value={row[cIdx] || ""}
                        onChange={(e) =>
                          handleCellChange(displayIdx, cIdx, e.target.value)
                        }
                        onPaste={(e) => onPasteEvent(e, actualRowIdx, cIdx)}
                        className="w-full h-full px-2.5 py-2 bg-transparent outline-none focus:bg-indigo-50 dark:focus:bg-indigo-900/20 font-medium text-zinc-700 dark:text-zinc-200 text-xs"
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

const DailyInventoryPage: React.FC<DailyInventoryPageProps> = ({ isDarkMode, db, user }) => {
  const { showAlert, showConfirm } = usePopup();
  const { getAllDealers, getAllBatteries } = useBatteryData();
  const [stations, setStations] = useState<Station[]>([]);
  const [masterItems, setMasterItems] = useState<InventoryItemMaster[]>([]);
  const [stationInventory, setStationInventory] = useState<StationInventory[]>([]);
  const [allBatteries, setAllBatteries] = useState<KazamBattery[]>([]);
  const [verificationLogs, setVerificationLogs] = useState<Record<string, VerificationLog>>({});
  const [batteryIssues, setBatteryIssues] = useState<any[]>([]);
  
  // click-through battery modal state
  const [selectedBatteryListModal, setSelectedBatteryListModal] = useState<{
    stationId: string;
    stationName: string;
    type: 'total' | 'error' | 'available';
  } | null>(null);
  const [modalSortConfig, setModalSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'id', direction: 'asc' });
  const [modalSearchQuery, setModalSearchQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // View State
  const [activeView, setActiveView] = useState<'inventory' | 'ingestion' | 'movements' | 'audits'>('inventory');

  // Ingestion State
  const [gridData, setGridData] = useState<string[][]>(() => {
    try {
      const cached = localStorage.getItem(INGESTION_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error("Failed to load cached ingestion grid", e);
    }
    return Array.from({ length: 15 }, () => Array(21).fill(""));
  });
  const [manualPasteText, setManualPasteText] = useState("");
  const [showPasteModal, setShowPasteModal] = useState(false);
  
  // Sorting & Pagination
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'name', direction: 'asc' });
  const [moveSortConfig, setMoveSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'timestamp', direction: 'desc' });
  const [auditSortConfig, setAuditSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'verifiedAt', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Paginated Data State (Firestore Snapshots for pagination)
  const [movementLogs, setMovementLogs] = useState<InventoryMovement[]>([]);
  const [auditLogs, setAuditLogs] = useState<VerificationLog[]>([]);
  const [lastVisibleMove, setLastVisibleMove] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [lastVisibleAudit, setLastVisibleAudit] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [totalMovements, setTotalMovements] = useState(0);
  const [totalAudits, setTotalAudits] = useState(0);

  // Audit Step & Data
  const [auditStep, setAuditStep] = useState(0);
  const [auditType, setAuditType] = useState<'quick' | 'complete'>('quick');
  const [auditCounts, setAuditCounts] = useState<Record<string, number>>({});

  // Modal State
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState<string | null>(null);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [newAsset, setNewAsset] = useState({ name: '', category: 'Assets', unit: 'pcs' });

  const [movementData, setMovementData] = useState({
    itemId: '',
    sourceId: 'OFFICE',
    sourceType: 'Office' as 'Office' | 'Station',
    destId: '',
    destType: 'Station' as 'Office' | 'Station',
    quantity: 1
  });
  
  const [auditData, setAuditData] = useState({
    stationId: '',
    notes: '',
    auditType: 'quick' as 'quick' | 'complete',
    discrepancies: [] as { itemName: string; expected: number; actual: number }[]
  });
  
  // Filtering & Groups
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStationId, setSelectedStationId] = useState('all');
  const [stationGroups, setStationGroups] = useState<StationGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('all');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedStationsForGroup, setSelectedStationsForGroup] = useState<string[]>([]);
  
  const reportRef = useRef<HTMLDivElement>(null);
  const [showCombinedReportModal, setShowCombinedReportModal] = useState(false);
  const [selectedReportGroupId, setSelectedReportGroupId] = useState('all');
  const [isExportingReport, setIsExportingReport] = useState(false);

  // Synchronize report group when modal is opened
  useEffect(() => {
    if (showCombinedReportModal) {
      setSelectedReportGroupId(selectedGroupId);
    }
  }, [showCombinedReportModal, selectedGroupId]);

  // 1. Load Stations
  useEffect(() => {
    const fetchStations = async () => {
      const data = await getAllDealers();
      setStations(data);
    };
    fetchStations();
  }, [getAllDealers]);

  // 2. Load Master Items
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "inventory_items"), (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItemMaster));
      setMasterItems(items);
    });
    return () => unsub();
  }, [db]);

  // 3. Load Station Inventory
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "station_inventory"), (snapshot) => {
      const inv = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as StationInventory));
      setStationInventory(inv);
    });
    return () => unsub();
  }, [db]);

  // 4. Load All Batteries from Uploaded/Pasted Battery Report
  useEffect(() => {
    try {
      const cachedGrid = localStorage.getItem(INGESTION_CACHE_KEY);
      if (cachedGrid) {
        const parsedGrid = JSON.parse(cachedGrid);
        if (Array.isArray(parsedGrid) && parsedGrid.length > 0) {
          const bats = parsePastedBatteries(parsedGrid);
          setAllBatteries(bats);
          setLoading(false);
          return;
        }
      }
      const cachedBats = localStorage.getItem(CACHE_KEY);
      if (cachedBats) {
        const parsed = JSON.parse(cachedBats);
        if (Array.isArray(parsed)) {
          setAllBatteries(parsed);
          setLoading(false);
          return;
        }
      }
      if (gridData.some(row => row.some(cell => cell.trim() !== ''))) {
        const bats = parsePastedBatteries(gridData);
        setAllBatteries(bats);
      } else {
        setAllBatteries([]);
      }
    } catch (e) {
      console.error("Error loading battery report", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-save gridData changes
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

  // Report Ingestion Action Handlers
  const handlePasteEvent = (
    e: React.ClipboardEvent,
    rIdx: number,
    cIdx: number
  ) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    if (!text) return;
    const newData = parsePasteData(text, gridData, rIdx, cIdx, 21);
    setGridData(newData);
    const parsed = parsePastedBatteries(newData);
    setAllBatteries(parsed);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
    } catch (err) {
      console.warn("Failed to cache parsed batteries", err);
    }
  };

  const handleManualPasteSubmit = () => {
    if (!manualPasteText.trim()) return;
    const newData = parsePasteData(manualPasteText, gridData, 0, 0, 21);
    setGridData(newData);
    const parsed = parsePastedBatteries(newData);
    setAllBatteries(parsed);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
    } catch (err) {
      console.warn("Failed to cache parsed batteries", err);
    }
    setManualPasteText("");
    setShowPasteModal(false);
    showAlert(`Report processed successfully! ${parsed.length} batteries loaded.`, "success");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        const newData = parsePasteData(text, Array.from({ length: 15 }, () => Array(21).fill("")), 0, 0, 21);
        setGridData(newData);
        const parsed = parsePastedBatteries(newData);
        setAllBatteries(parsed);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
        } catch (err) {
          console.warn("Failed to cache parsed batteries", err);
        }
        showAlert(`Successfully loaded ${parsed.length} batteries from ${file.name}!`, "success");
      }
    };
    reader.readAsText(file);
  };

  const handleClearGrid = async () => {
    const confirm = await showConfirm("Are you sure you want to clear the battery report grid?");
    if (!confirm) return;
    const emptyGrid = Array.from({ length: 15 }, () => Array(21).fill(""));
    setGridData(emptyGrid);
    setAllBatteries([]);
    try {
      localStorage.removeItem(INGESTION_CACHE_KEY);
      localStorage.removeItem(CACHE_KEY);
    } catch (e) {
      console.warn("Failed to clear cached grid", e);
    }
    showAlert("Battery report grid cleared.", "success");
  };

  const handleProcessGrid = () => {
    const parsed = parsePastedBatteries(gridData);
    setAllBatteries(parsed);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
    } catch (err) {
      console.warn("Failed to cache parsed batteries", err);
    }
    showAlert(`Applied battery report with ${parsed.length} batteries!`, "success");
  };

  // 4.5. Load battery issues
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "battery_issues"), (snapshot) => {
      const issues = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setBatteryIssues(issues);
    });
    return () => unsub();
  }, [db]);

  // 5. Load Total Counts for Pagination
  useEffect(() => {
    const unsubMove = onSnapshot(collection(db, "inventory_movements"), (snap) => setTotalMovements(snap.size));
    const unsubAudit = onSnapshot(collection(db, "inventory_verification"), (snap) => setTotalAudits(snap.size));
    return () => {
      unsubMove();
      unsubAudit();
    };
  }, [db]);

  // 6. Paginated Movements Fetch
  useEffect(() => {
    if (activeView !== 'movements') return;
    
    const fetchMovements = async () => {
      setLoading(true);
      try {
        const sortKey = moveSortConfig?.key || "timestamp";
        const sortDir = moveSortConfig?.direction || "desc";

        let q = query(
          collection(db, "inventory_movements"), 
          orderBy(sortKey, sortDir), 
          limit(itemsPerPage)
        );
        
        if (currentPage > 1) {
            const tempQ = query(
                collection(db, "inventory_movements"),
                orderBy(sortKey, sortDir),
                limit((currentPage - 1) * itemsPerPage)
            );
            const tempSnap = await getDocs(tempQ);
            const lastDoc = tempSnap.docs[tempSnap.docs.length - 1];
            if (lastDoc) {
                q = query(
                    collection(db, "inventory_movements"), 
                    orderBy(sortKey, sortDir), 
                    startAfter(lastDoc),
                    limit(itemsPerPage)
                );
            }
        }

        const snap = await getDocs(q);
        const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryMovement));
        setMovementLogs(logs);
      } catch (err) {
        console.error("Error fetching movements", err);
      } finally {
        setLoading(false);
      }
    };
    fetchMovements();
  }, [db, activeView, currentPage, itemsPerPage, moveSortConfig]);

  // 7. Paginated Audits Fetch
  useEffect(() => {
    if (activeView !== 'audits') return;

    const fetchAudits = async () => {
      setLoading(true);
      try {
        const sortKey = auditSortConfig?.key || "verifiedAt";
        const sortDir = auditSortConfig?.direction || "desc";

        let q = query(
          collection(db, "inventory_verification"), 
          orderBy(sortKey, sortDir), 
          limit(itemsPerPage)
        );

        if (currentPage > 1) {
            const tempQ = query(
                collection(db, "inventory_verification"),
                orderBy(sortKey, sortDir),
                limit((currentPage - 1) * itemsPerPage)
            );
            const tempSnap = await getDocs(tempQ);
            const lastDoc = tempSnap.docs[tempSnap.docs.length - 1];
            if (lastDoc) {
                q = query(
                    collection(db, "inventory_verification"), 
                    orderBy(sortKey, sortDir), 
                    startAfter(lastDoc),
                    limit(itemsPerPage)
                );
            }
        }

        const snap = await getDocs(q);
        const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as VerificationLog));
        setAuditLogs(logs);
      } catch (err) {
        console.error("Error fetching audits", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAudits();
  }, [db, activeView, currentPage, itemsPerPage, auditSortConfig]);

  // Load Station Groups
  useEffect(() => {
    const q = query(
      collection(db, "station_groups"), 
      where("type", "==", "inventory_report")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const groups = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as StationGroup));
      setStationGroups(groups);
    });
    return () => unsub();
  }, [db]);

  // Load Specific Station Verifications (for the live inventory view)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "inventory_verification"), (snapshot) => {
      const logs: Record<string, VerificationLog> = {};
      snapshot.forEach(d => {
        const data = d.data() as VerificationLog;
        // Only keep the latest verification per station for the record
        if (!logs[data.stationId] || logs[data.stationId].verifiedAt < data.verifiedAt) {
            logs[data.stationId] = data;
        }
      });
      setVerificationLogs(logs);
    });
    return () => unsub();
  }, [db]);

  const isOnline = (bat: KazamBattery) => {
    const ts = bat.last_updated_on;
    if (!ts) return false;
    const lastUpdatedMs =
      typeof ts === "number"
        ? ts > 100000000000
          ? ts
          : ts * 1000
        : new Date(ts).getTime();
    return Date.now() - lastUpdatedMs < 300000;
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const dataSt = await getAllDealers();
      setStations(dataSt);
      const cachedGrid = localStorage.getItem(INGESTION_CACHE_KEY);
      if (cachedGrid) {
        const parsedGrid = JSON.parse(cachedGrid);
        if (Array.isArray(parsedGrid)) {
          setGridData(parsedGrid);
          const bats = parsePastedBatteries(parsedGrid);
          setAllBatteries(bats);
        }
      }
    } catch (err) {
      console.error("Error refreshing data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyStation = async (stationId: string) => {
    try {
      const logId = `${stationId}_${new Date().toISOString().replace(/:/g, '-')}`;
      const categories = ['Batteries', ...Array.from(new Set(masterItems.map(item => item.category || 'Assets')))];
      await setDoc(doc(db, "inventory_verification", logId), {
        stationId,
        verifiedAt: new Date().toISOString(),
        verifiedBy: user.email || 'Unknown',
        items: categories
      });
      setShowConfirmModal(null);
      if (activeView === 'audits') {
        // Refresh audits if on that view
        setCurrentPage(1); 
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAuditAction = async () => {
    if (!auditData.stationId) return;
    
    // Calculate discrepancies
    const stationSummary = sortedData.find(s => s.id === auditData.stationId);
    if (!stationSummary) return;

    const discrepancies: any[] = [];
    const auditedItems: any[] = [];
    
    // Check Batteries if relevant
    if (auditCounts['Batteries'] !== undefined) {
        auditedItems.push({
            itemName: 'Batteries',
            expected: stationSummary.totalBatteries,
            actual: auditCounts['Batteries']
        });
        if (auditCounts['Batteries'] !== stationSummary.totalBatteries) {
            discrepancies.push({
                itemName: 'Batteries',
                expected: stationSummary.totalBatteries,
                actual: auditCounts['Batteries']
            });
        }
    }

    // Check Other Items
    masterItems.forEach(item => {
        if (auditCounts[item.id] !== undefined) {
            const expected = stationSummary.itemCounts[item.name] || 0;
            const isAuditedType = auditType === 'complete';
            if (isAuditedType) {
                auditedItems.push({
                    itemName: item.name,
                    expected,
                    actual: auditCounts[item.id]
                });
                if (auditCounts[item.id] !== expected) {
                    discrepancies.push({
                        itemName: item.name,
                        expected,
                        actual: auditCounts[item.id]
                    });
                }
            }
        }
    });

    try {
      const logId = `${auditData.stationId}_${new Date().toISOString().replace(/:/g, '-')}`;
      await setDoc(doc(db, "inventory_verification", logId), {
        stationId: auditData.stationId,
        verifiedAt: new Date().toISOString(),
        verifiedBy: user.email || 'Unknown',
        auditType: auditType,
        discrepancies,
        auditedItems,
        notes: auditData.notes
      });

      // Update actual station_inventory count with the verified counts
      const promises: any[] = [];
      const timestamp = new Date().toISOString();
      masterItems.forEach(item => {
        if (auditCounts[item.id] !== undefined) {
          const isAuditedType = auditType === 'complete';
          if (isAuditedType) {
            const docRef = doc(db, "station_inventory", `${auditData.stationId}_${item.id}`);
            promises.push(setDoc(docRef, {
              stationId: auditData.stationId,
              itemId: item.id,
              count: auditCounts[item.id],
              lastUpdated: timestamp
            }, { merge: true }));
          }
        }
      });
      if (promises.length > 0) {
        await Promise.all(promises);
      }
      
      await showAlert("Audit completed successfully!", "success");
      setShowAuditModal(false);
      setAuditStep(0);
      setAuditCounts({});
      if (activeView === 'audits') setCurrentPage(1); 
    } catch (err) {
      console.error(err);
      await showAlert("Failed to save audit results", "error");
    }
  };

  const removeMasterItem = async (itemId: string) => {
    const confirmed = await showConfirm("Are you sure you want to remove this asset?");
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, "inventory_items", itemId));
    } catch (err) {
      console.error(err);
    }
  };

  const addMasterItem = async () => {
    if (!newAsset.name.trim()) return;
    try {
      await addDoc(collection(db, "inventory_items"), newAsset);
      setNewAsset({ name: '', category: 'Assets', unit: 'pcs' });
      setShowAssetModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Derived Data for Table
  const filteredStations = useMemo(() => {
    let filtered = stations;

    // 1. Station Filter
    if (selectedStationId !== 'all') {
      filtered = filtered.filter(s => s.id === selectedStationId);
    }

    // 2. Group Filter
    if (selectedGroupId !== 'all') {
      const group = stationGroups.find(g => g.id === selectedGroupId);
      if (group) {
        const ids = group.stationIds || [];
        const names = group.stationNames || [];
        filtered = filtered.filter(s => ids.includes(s.id) || names.includes(s.name));
      }
    }

    // 3. Search Filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        s.name.toLowerCase().includes(query) || 
        (s.dealer_id || "").toLowerCase().includes(query) ||
        s.id.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [stations, selectedStationId, selectedGroupId, stationGroups, searchQuery]);

  const sortedData = useMemo(() => {
    const summary = filteredStations.map(station => {
      // Filter out batteries assigned to drivers (status usually 1 or driver_id exists)
      const stationBatteries = allBatteries.filter(b => {
        const dealerMatch = (b.dealer_id === station.id || b.dealer_id === station.dealer_id || b.dealer_name === station.name);
        return dealerMatch && !b.driver_id;
      });

      const totalBatteries = stationBatteries.length;
      const errorBatteries = stationBatteries.filter(b => b.status === 3).length;
      const availableForSwap = totalBatteries - errorBatteries;
      
      const itemCounts: Record<string, number> = {};
      const lastVerification = verificationLogs[station.id] || (station.dealer_id ? verificationLogs[station.dealer_id] : undefined);
      masterItems.forEach(master => {
        const inv = stationInventory.find(i => 
          (i.stationId === station.id || (station.dealer_id && i.stationId === station.dealer_id)) && 
          i.itemId === master.id
        );
        let count = inv ? inv.count : 0;
        
        // Fallback: Check verification log if physical count was recorded
        if (count === 0 && lastVerification) {
          const auditedItem = lastVerification.auditedItems?.find(it => it.itemName === master.name);
          if (auditedItem) {
            count = auditedItem.actual;
          }
        }
        itemCounts[master.name] = count;
      });

      const verification = Object.values(verificationLogs).find(v => 
        (v.stationId === station.id || (station.dealer_id && v.stationId === station.dealer_id)) && 
        v.verifiedAt.split('T')[0] === new Date().toISOString().split('T')[0]
      );

      return {
        id: station.id,
        dealer_id: station.dealer_id,
        name: station.name,
        totalBatteries,
        errorBatteries,
        availableForSwap,
        itemCounts,
        verification
      };
    });

    if (sortConfig) {
      summary.sort((a, b) => {
        let aVal: any = a[sortConfig.key as keyof typeof a];
        let bVal: any = b[sortConfig.key as keyof typeof b];

        // Handle item counts specifically
        if (masterItems.some(m => m.name === sortConfig.key)) {
          aVal = a.itemCounts[sortConfig.key];
          bVal = b.itemCounts[sortConfig.key];
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return summary;
  }, [filteredStations, allBatteries, stationInventory, masterItems, sortConfig, verificationLogs]);

  const reportGroupStations = useMemo(() => {
    return sortedData.filter(station => {
      if (selectedReportGroupId === 'all') return true;
      const group = stationGroups.find(g => g.id === selectedReportGroupId);
      if (!group) return true;
      const ids = group.stationIds || [];
      const names = group.stationNames || [];
      return ids.includes(station.id) || names.includes(station.name);
    });
  }, [sortedData, selectedReportGroupId, stationGroups]);

  const reportGroupSummary = useMemo(() => {
    const totalBats = reportGroupStations.reduce((sum, s) => sum + s.totalBatteries, 0);
    const availBats = reportGroupStations.reduce((sum, s) => sum + s.availableForSwap, 0);
    const errBats = reportGroupStations.reduce((sum, s) => sum + s.errorBatteries, 0);
    const verifiedCount = reportGroupStations.filter(s => !!s.verification).length;
    
    const itemTotals: Record<string, number> = {};
    masterItems.forEach(item => {
      itemTotals[item.name] = reportGroupStations.reduce((sum, station) => {
        const count = station.itemCounts?.[item.name] || 0;
        return sum + count;
      }, 0);
    });
    
    return {
      totalBatteries: totalBats,
      availableForSwap: availBats,
      errorBatteries: errBats,
      verifiedCount: verifiedCount,
      totalStations: reportGroupStations.length,
      itemTotals
    };
  }, [reportGroupStations, masterItems]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(start, start + itemsPerPage);
  }, [sortedData, currentPage, itemsPerPage]);

  const modalBatteries = useMemo(() => {
    if (!selectedBatteryListModal) return [];
    
    const stationId = selectedBatteryListModal.stationId;
    const type = selectedBatteryListModal.type;

    // Find the station
    const station = stations.find(s => s.id === stationId);
    if (!station) return [];

    // Filter station batteries
    const stationBatteries = allBatteries.filter(b => {
      const dealerMatch = (b.dealer_id === station.id || b.dealer_id === station.dealer_id || b.dealer_name === station.name);
      return dealerMatch && !b.driver_id;
    });

    if (type === 'error') {
      return stationBatteries.filter(b => b.status === 3);
    } else if (type === 'available') {
      return stationBatteries.filter(b => b.status !== 3);
    }
    
    return stationBatteries;
  }, [selectedBatteryListModal, stations, allBatteries]);

  const sortedModalBatteries = useMemo(() => {
    let list = modalBatteries.map(bat => {
      const isInactive = !bat.dealer_name || bat.dealer_name.trim() === '';
      let status = 'Available';
      if (bat.status === 3) status = 'Error';
      else if (isInactive && !bat.driverData) status = 'Inactive';
      else if (bat.charge_state === 1) status = 'Charging'; 
      else if (bat.status === 4) status = 'Low SoC';
      else if (bat.driverData) status = 'Assigned';

      const online = isOnline(bat);

      const activeIssues = batteryIssues.filter(i => i.batteryId === bat.id && i.status !== 'Closed');
      const issueText = activeIssues.map(i => i.mainDescription || i.issueType).join(', ') || '--';

      return {
        ...bat,
        derivedStatus: status,
        isOnline: online,
        issueText
      };
    });

    // Handle search query
    if (modalSearchQuery.trim()) {
      const q = modalSearchQuery.toLowerCase();
      list = list.filter(b => 
        (b.id || '').toLowerCase().includes(q) || 
        (b.iot_id || '').toLowerCase().includes(q) ||
        (b.derivedStatus || '').toLowerCase().includes(q) ||
        (b.issueText || '').toLowerCase().includes(q)
      );
    }

    if (modalSortConfig) {
      list.sort((a, b) => {
        let aVal: any = '';
        let bVal: any = '';

        if (modalSortConfig.key === 'id') {
          aVal = a.id || '';
          bVal = b.id || '';
        } else if (modalSortConfig.key === 'iot_id') {
          aVal = a.iot_id || '';
          bVal = b.iot_id || '';
        } else if (modalSortConfig.key === 'status') {
          aVal = a.derivedStatus || '';
          bVal = b.derivedStatus || '';
        } else if (modalSortConfig.key === 'soc') {
          aVal = a.soc || 0;
          bVal = b.soc || 0;
        } else if (modalSortConfig.key === 'issueText') {
          aVal = a.issueText || '';
          bVal = b.issueText || '';
        }

        if (aVal < bVal) return modalSortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return modalSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return list;
  }, [modalBatteries, modalSortConfig, modalSearchQuery, batteryIssues]);

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current?.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
    setCurrentPage(1);
  };

  const handleModalSort = (key: string) => {
    setModalSortConfig(current => {
      if (current?.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const handleMoveSort = (key: string) => {
    setMoveSortConfig(current => {
      if (current?.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
    setCurrentPage(1);
  };

  const handleAuditSort = (key: string) => {
    setAuditSortConfig(current => {
      if (current?.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
    setCurrentPage(1);
  };

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
      await showAlert("Group created!", "success");
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
    }
  };

  const handleMovement = async () => {
    const { itemId, sourceId, sourceType, destId, destType, quantity } = movementData;
    if (!itemId || !sourceId || !destId || quantity <= 0) return;
    if (sourceId === destId) {
      await showAlert("Source and destination must be different", "error");
      return;
    }

    const master = masterItems.find(m => m.id === itemId);
    const sourceStation = stations.find(s => s.id === sourceId);
    const destStation = stations.find(s => s.id === destId);

    setIsSaving(true);
    try {
      const timestamp = new Date().toISOString();
      const userEmail = user.email || 'Unknown';

      const batch: any[] = [];

      // 1. Decrement Source if Station
      if (sourceType === 'Station') {
        const sourceRef = doc(db, "station_inventory", `${sourceId}_${itemId}`);
        const currentSource = stationInventory.find(i => {
          const st = stations.find(s => s.id === sourceId || s.dealer_id === sourceId);
          return (i.stationId === sourceId || (st && (i.stationId === st.id || i.stationId === st.dealer_id))) && i.itemId === itemId;
        });
        const newSourceCount = Math.max(0, (currentSource?.count || 0) - quantity);
        batch.push(setDoc(sourceRef, { count: newSourceCount, lastUpdated: timestamp }, { merge: true }));
      }

      // 2. Increment Destination if Station
      if (destType === 'Station') {
        const destRef = doc(db, "station_inventory", `${destId}_${itemId}`);
        const currentDest = stationInventory.find(i => {
          const st = stations.find(s => s.id === destId || s.dealer_id === destId);
          return (i.stationId === destId || (st && (i.stationId === st.id || i.stationId === st.dealer_id))) && i.itemId === itemId;
        });
        const newDestCount = (currentDest?.count || 0) + quantity;
        batch.push(setDoc(destRef, { 
          stationId: destId, 
          itemId, 
          count: newDestCount, 
          lastUpdated: timestamp 
        }, { merge: true }));
      }

      // 3. Log Movement
      const movementRef = collection(db, "inventory_movements");
      batch.push(addDoc(movementRef, {
        itemId,
        itemName: master?.name,
        sourceType,
        sourceId,
        sourceName: sourceType === 'Office' ? 'Office' : sourceStation?.name,
        destType,
        destId,
        destName: destType === 'Office' ? 'Office' : destStation?.name,
        quantity,
        timestamp,
        user: userEmail
      }));

      await Promise.all(batch);
      await showAlert("Movement recorded successfully!", "success");
      setShowMovementModal(false);
      setMovementData({ ...movementData, quantity: 1 });
    } catch (err) {
      console.error("Movement error:", err);
      await showAlert("Failed to record movement", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveReport = async () => {
    setIsSaving(true);
    try {
      const timestamp = new Date().toISOString();
      const date = timestamp.split('T')[0];

      const reportData = sortedData.map(station => ({
        stationId: station.id,
        stationName: station.name,
        batteryCount: station.totalBatteries,
        items: masterItems.map(m => ({
          itemName: m.name,
          count: station.itemCounts[m.name]
        }))
      }));

      await addDoc(collection(db, "inventory_reports"), {
        date,
        data: reportData,
        submittedBy: user.email || 'Unknown',
        timestamp
      });

      await showAlert("Daily inventory report saved successfully!", "success");
    } catch (err) {
      console.error("Error saving report", err);
      await showAlert("Failed to save report.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyReportImage = async () => {
    if (!reportRef.current) return;
    try {
      const dataUrl = await toPng(reportRef.current, { 
        cacheBust: true, 
        backgroundColor: isDarkMode ? '#18181b' : '#ffffff',
        style: { borderRadius: '0px' } 
      });
      const link = document.createElement('a');
      link.download = `daily-inventory-${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error generating report image', err);
      await showAlert("Failed to generate report image.", "error");
    }
  };

  const handleExportCombinedReport = async () => {
    if (!reportRef.current) return;
    setIsExportingReport(true);
    try {
      // Find selected group name
      const groupName = selectedReportGroupId === 'all'
        ? 'All Groups'
        : stationGroups.find(g => g.id === selectedReportGroupId)?.name || 'Filtered Group';

      // Build image from reportRef (designed specifically for crisp image rendering)
      const dataUrl = await toPng(reportRef.current, { 
        cacheBust: true, 
        backgroundColor: '#ffffff', // Clean crisp white background for business report style
        pixelRatio: 2.0, // Crisp, ultra-high quality
        style: { 
          borderRadius: '0px',
          fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif"
        } 
      });

      const totalGroupBatteries = reportGroupSummary.totalBatteries;
      const totalGroupAvail = reportGroupSummary.availableForSwap;
      const totalGroupErr = reportGroupSummary.errorBatteries;
      const totalGroupVerified = reportGroupSummary.verifiedCount;

      let waText = `🚨 *DAILY INVENTORY REPORT - ${groupName.toUpperCase()}* 🚨\n\n`;
      waText += `📍 *Group/City:* ${groupName}\n`;
      waText += `📅 *Date:* ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}\n`;
      waText += `🏢 *Total Stations:* ${reportGroupStations.length}\n`;
      waText += `✅ *Verified Today:* ${totalGroupVerified} / ${reportGroupStations.length}\n`;
      waText += `🔋 *Total Batteries:* ${totalGroupBatteries} (${totalGroupAvail} Avail, ${totalGroupErr} Err)\n`;
      masterItems.forEach(item => {
        const total = reportGroupSummary.itemTotals[item.name] || 0;
        waText += `📦 *Total ${item.name}:* ${total}\n`;
      });
      waText += `─────────────────────\n\n`;

      reportGroupStations.forEach((st, idx) => {
        const isVerified = !!st.verification;
        waText += `🏢 *${idx + 1}. ${st.name}*\n`;
        waText += `🔋 *Batteries:* ${st.totalBatteries} (${st.availableForSwap} Avail, ${st.errorBatteries} Err)\n`;
        
        // Show counts of main items if any
        const mainItemCounts = Object.entries(st.itemCounts || {})
          .filter(([name, count]) => count > 0)
          .map(([name, count]) => `${name}: ${count}`)
          .join(', ');
          
        if (mainItemCounts) {
          waText += `🔌 *Assets:* ${mainItemCounts}\n`;
        }
        
        waText += `📝 *Status:* ${isVerified ? '✅ VERIFIED' : '⏳ PENDING'}\n\n`;
      });
      waText += `─────────────────────\n`;
      waText += `_© ${new Date().getFullYear()} Kazam BD Ops Automated System_`;

      try {
        await navigator.clipboard.writeText(waText);
        
        // Trigger PNG Download
        const link = document.createElement('a');
        link.download = `daily-inventory-${groupName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.png`;
        link.href = dataUrl;
        link.click();

        await showAlert("📋 Plaintext WhatsApp report successfully copied to your clipboard!\n\n📥 High-quality, fast-loading image report downloaded successfully!\n\nYou can now paste both into your WhatsApp group!", "success");
      } catch (clipboardErr) {
        console.warn("Direct clipboard write failed. Downloading image only:", clipboardErr);
        // Fallback: Download PNG anyway
        const link = document.createElement('a');
        link.download = `daily-inventory-${groupName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.png`;
        link.href = dataUrl;
        link.click();
        await showAlert("📥 Image report downloaded successfully!", "success");
      }

      setShowCombinedReportModal(false);
    } catch (err) {
      console.error('Error exporting combined report', err);
      await showAlert("Failed to export combined report.", "error");
    } finally {
      setIsExportingReport(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header Section Redesign */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold font-heading text-zinc-900 dark:text-white mb-2">Inventory Management</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Live Resource Tracking</span>
            </div>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 dark:text-zinc-400 transition-colors flex items-center gap-1 w-fit cursor-pointer"
              title="Refresh Data"
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-500' : ''}`} />
              <span className="text-[10px] uppercase font-bold tracking-wider">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* View Selector Tabs & Action Buttons Panel */}
      <div className="w-full overflow-x-auto pb-1.5 scrollbar-thin">
        <div className="flex items-center gap-1.5 p-1.5 bg-zinc-100 dark:bg-zinc-800/50 rounded-2xl w-max min-w-full">
          {/* View Selector Tabs */}
          <button 
            onClick={() => { setActiveView('inventory'); setCurrentPage(1); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${activeView === 'inventory' ? 'bg-white dark:bg-zinc-900 text-indigo-600 shadow-sm' : 'text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800'}`}
          >
            <BuildingStorefrontIcon className="w-3.5 h-3.5" />
            <span>Stations Inventory</span>
          </button>

          <button 
            onClick={() => { setActiveView('ingestion'); setCurrentPage(1); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${activeView === 'ingestion' ? 'bg-white dark:bg-zinc-900 text-indigo-600 shadow-sm' : 'text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800'}`}
          >
            <FileSpreadsheetIcon className="w-3.5 h-3.5" />
            <span>Report Ingestion</span>
            {allBatteries.length > 0 && (
              <span className="ml-1 px-2 py-0.5 text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-full font-extrabold">
                {allBatteries.length}
              </span>
            )}
          </button>

          <button 
            onClick={() => { setActiveView('movements'); setCurrentPage(1); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${activeView === 'movements' ? 'bg-white dark:bg-zinc-900 text-indigo-600 shadow-sm' : 'text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800'}`}
          >
            <HistoryIcon className="w-3.5 h-3.5" />
            <span>Movements</span>
          </button>

          <button 
            onClick={() => { setActiveView('audits'); setCurrentPage(1); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${activeView === 'audits' ? 'bg-white dark:bg-zinc-900 text-indigo-600 shadow-sm' : 'text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-800'}`}
          >
            <ClipboardListIcon className="w-3.5 h-3.5" />
            <span>Audit Logs</span>
          </button>

          {/* Separator */}
          <div className="h-6 w-px bg-zinc-300 dark:bg-zinc-700 mx-1 shrink-0" />

          {/* Action Buttons inside this panel */}
          <button 
            onClick={() => setShowAssetModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-bold shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            <span>Add Asset</span>
          </button>

          <button 
            onClick={() => setShowMovementModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-md transition-all hover:bg-indigo-700 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowRightLeftIcon className="w-4 h-4" />
            <span>Log Movement</span>
          </button>

          <button 
            onClick={() => {
              setAuditStep(0);
              setShowAuditModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all hover:bg-emerald-700 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ClipboardCheckIcon className="w-4 h-4" />
            <span>Asset Audit</span>
          </button>
        </div>
      </div>

      {/* Filter Bar (Only show for inventory view or simplify) */}
      {activeView === 'inventory' && (
        <div className="flex flex-col md:flex-row items-center gap-4 w-full animate-in slide-in-from-top-4 duration-500 my-6">
          <div className="relative group flex-1 w-full md:w-auto">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search Station/ID..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 text-zinc-900 dark:text-zinc-100 shadow-sm transition-all"
            />
          </div>

          <div className="w-full md:w-64 shrink-0">
            <CustomSelect 
              options={[{ value: 'all', label: 'All Stations' }, ...stations.map(s => ({ value: s.id, label: s.name }))]}
              value={selectedStationId}
              onChange={setSelectedStationId}
              placeholder="All Stations"
              className="!bg-white dark:!bg-zinc-900 !border-zinc-200 dark:!border-zinc-800 shadow-sm"
            />
          </div>

          <div className="w-full md:w-64 shrink-0 flex gap-2">
            <div className="flex-1 min-w-0">
              <CustomSelect 
                options={[{ value: 'all', label: 'All Groups' }, ...stationGroups.map(g => ({ value: g.id, label: g.name }))]}
                value={selectedGroupId}
                onChange={setSelectedGroupId}
                placeholder="All Groups"
                className="!bg-white dark:!bg-zinc-900 !border-zinc-200 dark:!border-zinc-800 shadow-sm"
                footer={
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowGroupModal(true);
                    }}
                    className="w-full py-3 text-center text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-center gap-1.5"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    Create/Manage Groups
                  </button>
                }
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedReportGroupId(selectedGroupId);
                setShowCombinedReportModal(true);
              }}
              className="flex items-center justify-center p-3 bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-indigo-600 dark:text-indigo-400 border border-zinc-200 dark:border-zinc-805 rounded-xl font-bold shadow-sm transition-all hover:scale-[1.05] active:scale-[0.95] cursor-pointer w-[46px] h-[46px] shrink-0"
              title="Share City/Group Combined Report"
            >
              <ShareIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Areas */}
      <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col">
        {activeView === 'ingestion' && (
          <div className="p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-gradient-to-r from-indigo-50/70 to-zinc-50 dark:from-indigo-950/20 dark:to-zinc-900 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl">
              <div>
                <div className="flex items-center gap-2">
                  <FileSpreadsheetIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">Battery Report Excel Ingestion</h3>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Paste rows directly from Excel or upload a TSV/CSV battery report file to update station inventories instantly.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <span className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-xs font-bold flex items-center gap-1.5">
                  <CheckCircleIcon className="w-4 h-4" />
                  {allBatteries.length.toLocaleString()} Active Batteries
                </span>

                <button
                  type="button"
                  onClick={() => setShowPasteModal(true)}
                  className="px-3.5 py-2 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <FileTextIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Quick Paste Text
                </button>

                <label className="px-3.5 py-2 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer">
                  <UploadIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Upload File
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleProcessGrid}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
                >
                  <CheckCircleIcon className="w-4 h-4" />
                  Apply & Process
                </button>

                <button
                  type="button"
                  onClick={handleClearGrid}
                  className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors border border-transparent hover:border-rose-200 dark:hover:border-rose-900"
                  title="Clear Grid"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <ExcelGrid
              headers={INGESTION_HEADERS}
              data={gridData}
              onChange={(newData) => {
                setGridData(newData);
                const parsed = parsePastedBatteries(newData);
                setAllBatteries(parsed);
              }}
              onPasteEvent={handlePasteEvent}
            />
          </div>
        )}

        {activeView === 'inventory' && (
          <>
            <div className="overflow-x-auto max-h-[70vh]">
                <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
                  <thead className="bg-zinc-50/95 dark:bg-zinc-900/95 backdrop-blur-sm sticky top-0 z-10 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <SortableHeader label="Station Name" sortKey="name" currentSort={sortConfig} onSort={handleSort} className="w-64 h-14"/>
                      <SortableHeader label="Total Bats" sortKey="totalBatteries" currentSort={sortConfig} onSort={handleSort} className="w-32 h-14 text-center"/>
                      <SortableHeader label="Error Bats" sortKey="errorBatteries" currentSort={sortConfig} onSort={handleSort} className="w-32 h-14 text-center"/>
                      <SortableHeader label="Avail Swaps" sortKey="availableForSwap" currentSort={sortConfig} onSort={handleSort} className="w-32 h-14 text-center"/>
                      {masterItems.slice(0, 10).map(m => (
                        <SortableHeader key={m.id} label={m.name} sortKey={m.name} currentSort={sortConfig} onSort={handleSort} className="w-28 h-14 text-center"/>
                      ))}
                      <th className="px-6 py-4 text-right text-[11px] font-bold uppercase text-zinc-500 w-32">Verification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                    {loading ? (
                      <tr>
                        <td colSpan={masterItems.length + 5} className="py-24 text-center">
                          <div className="flex flex-col items-center">
                            <ArrowPathIcon className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Synchronizing Inventory...</p>
                          </div>
                        </td>
                      </tr>
                    ) : paginatedData.length === 0 ? (
                        <tr><td colSpan={masterItems.length + 5} className="py-20 text-center text-zinc-400 italic">No stations found</td></tr>
                    ) : (
                      paginatedData.map(station => (
                        <tr key={station.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors group h-16">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-400 group-hover:scale-105 transition-transform">
                                <BuildingStorefrontIcon className="w-4 h-4" />
                              </div>
                              <div className="overflow-hidden">
                                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 block truncate">{station.name}</span>
                                <span className="text-[10px] text-zinc-400 font-bold tracking-tight uppercase">ID: {station.dealer_id || station.id}</span>
                              </div>
                            </div>
                          </td>
                           <td className="px-6 py-4 text-center whitespace-nowrap">
                             <button
                               type="button"
                               onClick={() => {
                                 setModalSortConfig({ key: 'id', direction: 'asc' });
                                 setModalSearchQuery('');
                                 setSelectedBatteryListModal({
                                   stationId: station.id,
                                   stationName: station.name,
                                   type: 'total'
                                 });
                               }}
                               className="font-black text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer transition-colors"
                             >
                               {station.totalBatteries}
                             </button>
                           </td>
                           <td className="px-6 py-4 text-center whitespace-nowrap">
                             <button
                               type="button"
                               onClick={() => {
                                 setModalSortConfig({ key: 'id', direction: 'asc' });
                                 setModalSearchQuery('');
                                 setSelectedBatteryListModal({
                                   stationId: station.id,
                                   stationName: station.name,
                                   type: 'error'
                                 });
                               }}
                               className={`font-black hover:underline cursor-pointer transition-colors ${station.errorBatteries > 0 ? 'text-red-500 hover:text-red-600 font-bold' : 'text-zinc-400 hover:text-zinc-500 font-medium'}`}
                             >
                               {station.errorBatteries}
                             </button>
                           </td>
                           <td className="px-6 py-4 text-center whitespace-nowrap">
                             <button
                               type="button"
                               onClick={() => {
                                 setModalSortConfig({ key: 'id', direction: 'asc' });
                                 setModalSearchQuery('');
                                 setSelectedBatteryListModal({
                                   stationId: station.id,
                                   stationName: station.name,
                                   type: 'available'
                                 });
                               }}
                               className="inline-flex items-center justify-center px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-sm font-black border border-emerald-100/50 dark:border-emerald-900/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-all cursor-pointer"
                             >
                               {station.availableForSwap}
                             </button>
                           </td>
                          {masterItems.slice(0, 10).map(m => (
                            <td key={m.id} className="px-4 py-4 text-center whitespace-nowrap">
                              <span className={`text-sm font-bold ${station.itemCounts[m.name] > 0 ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-300 dark:text-zinc-700'}`}>
                                {station.itemCounts[m.name]}
                              </span>
                            </td>
                          ))}
                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            {station.verification ? (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase">
                                  <CheckCircleIcon className="w-3 h-3" /> Verified
                                </span>
                                <span className="text-[9px] text-zinc-400 font-bold">{new Date(station.verification.verifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            ) : (
                              <button 
                                onClick={() => {
                                  setAuditData({ ...auditData, stationId: station.id });
                                  setAuditStep(0); 
                                  setShowAuditModal(true);
                                }} 
                                className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg text-[10px] font-black uppercase transition-all"
                              >
                                Verify
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
            </div>
            <PaginationFooter currentPage={currentPage} totalPages={Math.ceil(sortedData.length / itemsPerPage)} onPageChange={setCurrentPage} dataLength={sortedData.length} itemsPerPage={itemsPerPage} onItemsPerPageChange={setItemsPerPage} />
          </>
        )}

        {activeView === 'movements' && (
          <>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                        <tr>
                            <SortableHeader label="Item Name" sortKey="itemName" currentSort={moveSortConfig} onSort={handleMoveSort} className="px-6 h-14"/>
                            <SortableHeader label="Source" sortKey="sourceName" currentSort={moveSortConfig} onSort={handleMoveSort} className="px-6 h-14"/>
                            <SortableHeader label="Destination" sortKey="destName" currentSort={moveSortConfig} onSort={handleMoveSort} className="px-6 h-14"/>
                            <SortableHeader label="Qty" sortKey="quantity" currentSort={moveSortConfig} onSort={handleMoveSort} className="px-6 h-14 text-center"/>
                            <SortableHeader label="User" sortKey="user" currentSort={moveSortConfig} onSort={handleMoveSort} className="px-6 h-14"/>
                            <SortableHeader label="Timestamp" sortKey="timestamp" currentSort={moveSortConfig} onSort={handleMoveSort} className="px-6 h-14 text-right"/>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                        {loading && currentPage === 1 ? (
                            <tr><td colSpan={6} className="py-20 text-center"><ArrowPathIcon className="w-8 h-8 animate-spin mx-auto text-indigo-600"/></td></tr>
                        ) : movementLogs.length === 0 ? (
                            <tr><td colSpan={6} className="py-20 text-center text-zinc-400 italic">No movement logs found</td></tr>
                        ) : (
                            movementLogs.map(log => (
                                <tr key={log.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors h-16">
                                    <td className="px-6 py-4 font-bold text-sm">{log.itemName}</td>
                                    <td className="px-6 py-4 text-xs font-semibold text-zinc-500">{log.sourceName}</td>
                                    <td className="px-6 py-4 text-xs font-semibold text-zinc-500">{log.destName}</td>
                                    <td className="px-6 py-4 text-center font-black">{log.quantity}</td>
                                    <td className="px-6 py-4 text-xs text-zinc-400">{log.user}</td>
                                    <td className="px-6 py-4 text-right text-xs text-zinc-400">{new Date(log.timestamp).toLocaleString()}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <PaginationFooter currentPage={currentPage} totalPages={Math.ceil(totalMovements / itemsPerPage)} onPageChange={setCurrentPage} dataLength={totalMovements} itemsPerPage={itemsPerPage} onItemsPerPageChange={setItemsPerPage} />
          </>
        )}

        {activeView === 'audits' && (
          <>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                        <tr>
                            <SortableHeader label="Station" sortKey="stationId" currentSort={auditSortConfig} onSort={handleAuditSort} className="px-6 h-14 w-1/4"/>
                            <SortableHeader label="Verified By" sortKey="verifiedBy" currentSort={auditSortConfig} onSort={handleAuditSort} className="px-6 h-14 w-1/4"/>
                            <th className="px-6 py-4 text-[11px] font-bold uppercase text-zinc-500 w-2/5">Audited Counts / Items</th>
                            <SortableHeader label="Verified At" sortKey="verifiedAt" currentSort={auditSortConfig} onSort={handleAuditSort} className="px-6 h-14 text-right w-1/5"/>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                        {loading && currentPage === 1 ? (
                            <tr><td colSpan={4} className="py-20 text-center"><ArrowPathIcon className="w-8 h-8 animate-spin mx-auto text-emerald-600"/></td></tr>
                        ) : auditLogs.length === 0 ? (
                            <tr><td colSpan={4} className="py-20 text-center text-zinc-400 italic">No audit records found</td></tr>
                        ) : (
                            auditLogs.map(log => {
                                const station = stations.find(s => s.id === log.stationId);
                                
                                // Compile audited items
                                const auditedItems: any[] = [];
                                if (log.auditedItems && log.auditedItems.length > 0) {
                                  auditedItems.push(...log.auditedItems);
                                } else {
                                  // Backwards compatibility reconstruction
                                  const batDisc = log.discrepancies?.find((d: any) => d.itemName === 'Batteries');
                                  if (batDisc) {
                                    auditedItems.push({ itemName: 'Batteries', expected: batDisc.expected, actual: batDisc.actual });
                                  } else if (station) {
                                    const matchedStationSummary = sortedData.find(s => s.id === log.stationId);
                                    const totalBats = matchedStationSummary ? matchedStationSummary.totalBatteries : 0;
                                    auditedItems.push({ itemName: 'Batteries', expected: totalBats, actual: totalBats });
                                  }

                                  // Check other master items
                                  masterItems.forEach(item => {
                                    const isAuditedType = log.auditType === 'complete';
                                    if (isAuditedType) {
                                      const itemDisc = log.discrepancies?.find((d: any) => d.itemName === item.name);
                                      if (itemDisc) {
                                        auditedItems.push({ itemName: item.name, expected: itemDisc.expected, actual: itemDisc.actual });
                                      } else if (station) {
                                        const matchedStationSummary = sortedData.find(s => s.id === log.stationId);
                                        const exp = matchedStationSummary?.itemCounts?.[item.name] || 0;
                                        auditedItems.push({ itemName: item.name, expected: exp, actual: exp });
                                      }
                                    }
                                  });
                                }

                                return (
                                <tr key={log.id || `${log.stationId}_${log.verifiedAt}`} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors h-16">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${log.auditType === 'quick' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                                    {log.auditType === 'quick' ? <ArrowPathIcon className="w-4 h-4" /> : <ClipboardCheckIcon className="w-4 h-4" />}
                                                </div>
                                                <div className="overflow-hidden">
                                                    <div className="font-bold text-sm tracking-tight truncate">{station?.name || 'Unknown Station'}</div>
                                                    <div className="text-[10px] text-zinc-400 font-bold uppercase truncate">ID: {log.stationId}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs font-semibold text-zinc-500 truncate max-w-[150px]">{log.verifiedBy}</span>
                                                {log.discrepancies && log.discrepancies.length > 0 && (
                                                    <span className="text-[9px] font-black text-red-500 uppercase tracking-tighter bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded w-fit">
                                                        {log.discrepancies.length} Discrepancies
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1 md:gap-1.5 max-w-lg">
                                                {auditedItems.length === 0 ? (
                                                  <span className="text-[10px] text-zinc-400 italic font-medium">Quick checklist verified</span>
                                                ) : (
                                                  auditedItems.map((item, idx) => {
                                                    const isMismatch = item.expected !== item.actual;
                                                    return (
                                                      <span
                                                        key={idx}
                                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-extrabold ${
                                                          isMismatch
                                                            ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/25 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30'
                                                            : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/15 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/20'
                                                        }`}
                                                        title={`${item.itemName}: Expected ${item.expected}, Actual ${item.actual}`}
                                                      >
                                                        <span className="opacity-70">{item.itemName}:</span>
                                                        <span>
                                                          {item.actual}
                                                          {isMismatch && <span className="opacity-50 font-normal"> / {item.expected}</span>}
                                                        </span>
                                                      </span>
                                                    );
                                                  })
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right text-xs text-zinc-400 font-medium whitespace-nowrap">
                                            {new Date(log.verifiedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
            <PaginationFooter currentPage={currentPage} totalPages={Math.ceil(totalAudits / itemsPerPage)} onPageChange={setCurrentPage} dataLength={totalAudits} itemsPerPage={itemsPerPage} onItemsPerPageChange={setItemsPerPage} />
          </>
        )}
      </div>

      {/* City Wise Combined Report Modal */}
      {showCombinedReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-[2.5rem] p-8 shadow-2xl border border-zinc-100 dark:border-zinc-800 animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <ShareIcon className="w-5 h-5 text-indigo-500 animate-bounce" />
                Share Combined Stations Report
              </h3>
              <button 
                onClick={() => setShowCombinedReportModal(false)} 
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
              >
                <XMarkIcon className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-1">
              {/* Select Report Group/City */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Select Group or City</label>
                <CustomSelect 
                  options={[{ value: 'all', label: 'All Groups Combined' }, ...stationGroups.map(g => ({ value: g.id, label: g.name }))]}
                  value={selectedReportGroupId}
                  onChange={setSelectedReportGroupId}
                  placeholder="All Groups Combined"
                  className="shadow-sm"
                />
              </div>

              {/* LIVE VIEW PREVIEW */}
              <div className="space-y-2">
                <div className="flex items-center justify-between ml-1">
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Report Preview</span>
                  <span className="text-[10px] px-2 py-0.5 font-bold uppercase rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                    {reportGroupStations.length} Stations Selected
                  </span>
                </div>

                <div className="border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 bg-zinc-50 dark:bg-zinc-950/20 text-xs space-y-4">
                  {/* Executive Header */}
                  <div className="border-b border-zinc-200/60 dark:border-zinc-800/60 pb-3 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div>
                      <h4 className="font-extrabold text-sm text-zinc-900 dark:text-zinc-100 uppercase tracking-tight">
                        Daily Inventory Performance
                      </h4>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5">
                        Group: {selectedReportGroupId === 'all' ? 'All Combined' : stationGroups.find(g => g.id === selectedReportGroupId)?.name}
                      </p>
                    </div>
                    <div className="text-left sm:text-right text-[10px] text-zinc-400 font-semibold uppercase">
                      Date: {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>

                  {/* Summary Indicators */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white dark:bg-zinc-900 p-3.5 rounded-2xl border border-zinc-100 dark:border-zinc-800/80">
                    <div className="text-center sm:border-r border-zinc-100 dark:border-zinc-800">
                      <p className="text-[9px] text-zinc-400 font-bold uppercase">Stations</p>
                      <p className="text-base font-extrabold text-zinc-800 dark:text-zinc-200 mt-0.5">{reportGroupSummary.totalStations}</p>
                    </div>
                    <div className="text-center sm:border-r border-zinc-100 dark:border-zinc-800">
                      <p className="text-[9px] text-zinc-400 font-bold uppercase">Batteries</p>
                      <p className="text-base font-extrabold text-zinc-800 dark:text-zinc-200 mt-0.5">{reportGroupSummary.totalBatteries}</p>
                    </div>
                    <div className="text-center sm:border-r border-zinc-100 dark:border-zinc-800">
                      <p className="text-[9px] text-emerald-500 font-bold uppercase">Avail Swap</p>
                      <p className="text-base font-extrabold text-emerald-600 mt-0.5">{reportGroupSummary.availableForSwap}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-rose-500 font-bold uppercase">Error Bats</p>
                      <p className="text-base font-extrabold text-rose-600 mt-0.5">{reportGroupSummary.errorBatteries}</p>
                    </div>
                  </div>

                  {/* Tiny Status indicator lists */}
                  <div className="max-h-48 overflow-y-auto pr-1 space-y-2">
                    {reportGroupStations.map(st => (
                      <div key={st.id} className="flex justify-between items-center py-2 px-3 bg-white dark:bg-zinc-900/60 rounded-xl border border-zinc-100 dark:border-zinc-800/50">
                        <span className="font-bold text-zinc-800 dark:text-zinc-200 truncate pr-2 max-w-[200px]">{st.name}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[10px] text-zinc-400">
                            🔋 <strong>{st.totalBatteries}</strong> bats ({st.availableForSwap} Avail, {st.errorBatteries} Err)
                          </span>
                          {st.verification ? (
                            <span className="text-[10px] text-emerald-600 font-black">✅ Verified</span>
                          ) : (
                            <span className="text-[10px] text-zinc-400 italic">⏳ Pending</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Direct instructions explanation */}
              <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/25 border border-indigo-150/40 rounded-2xl flex gap-3 text-xs text-indigo-700 dark:text-indigo-300">
                <span className="text-base">💡</span>
                <p className="leading-relaxed">
                  Export generates a <strong>gorgeous high-resolution PNG document</strong> and <strong>automatically copies a clean, beautifully formatted plain text</strong> directly to your clipboard so you can paste both seamlessly into WhatsApp.
                </p>
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button 
                onClick={() => setShowCombinedReportModal(false)}
                className="flex-1 py-3 text-sm font-bold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-2xl transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-800"
              >
                Cancel
              </button>
              <button 
                onClick={handleExportCombinedReport}
                disabled={isExportingReport || reportGroupStations.length === 0}
                className="flex-[2] flex items-center justify-center gap-2 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-100 dark:shadow-none disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {isExportingReport ? (
                  <>
                    <ArrowPathIcon className="w-5 h-5 animate-spin" />
                    <span>Generating Image...</span>
                  </>
                ) : (
                  <>
                    <ShareIcon className="w-5 h-5" />
                    <span>Copy Text & Export Image</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GORGEOUS HIGH RESOLUTION PNG DOCUMENT EXPORT DOM (Absolute hidden container to avoid UI glitches, dark theme distortion and browser clippings) */}
      <div className="absolute left-[-9999px] top-[-9999px] pointer-events-none" style={{ width: '800px' }}>
        <div  
          ref={reportRef} 
          className="bg-white p-8 border border-zinc-200 rounded-[2rem] shadow-none select-none text-zinc-900"
          style={{ width: '800px', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
        >
          {/* Brand header */}
          <div className="flex justify-between items-start border-b-2 border-zinc-900 pb-5 mb-5">
            <div>
              <h2 className="text-2xl font-black text-zinc-950 uppercase tracking-tight" style={{ fontFamily: '"Outfit", sans-serif' }}>
                DAILY INVENTORY REPORT
              </h2>
              <p className="text-xs text-zinc-650 font-bold uppercase mt-1" style={{ fontFamily: '"Outfit", sans-serif' }}>
                Group ID/City: {selectedReportGroupId === 'all' ? 'All Cities Combined' : (stationGroups.find(g => g.id === selectedReportGroupId)?.name || 'Combined Stations')}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-zinc-400 font-extrabold uppercase tracking-wide" style={{ fontFamily: '"Outfit", sans-serif' }}>Report Generation Date</span>
              <p className="text-sm font-black text-zinc-950 mt-1" style={{ fontFamily: '"Outfit", sans-serif' }}>
                {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              <p className="text-[10px] text-zinc-500 font-medium">
                {new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })}
              </p>
            </div>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
            <div className="p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-center">
              <span className="text-[9px] text-zinc-500 font-black uppercase tracking-wider block" style={{ fontFamily: '"Outfit", sans-serif' }}>Total Stations</span>
              <span className="text-lg font-black text-zinc-900 block mt-1" style={{ fontFamily: '"Outfit", sans-serif' }}>{reportGroupSummary.totalStations}</span>
            </div>
            <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-center">
              <span className="text-[9px] text-indigo-700 font-black uppercase tracking-wider block" style={{ fontFamily: '"Outfit", sans-serif' }}>Verified Stations</span>
              <span className="text-lg font-black text-indigo-900 block mt-1" style={{ fontFamily: '"Outfit", sans-serif' }}>
                {reportGroupSummary.verifiedCount} / {reportGroupSummary.totalStations}
              </span>
            </div>
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-center">
              <span className="text-[9px] text-emerald-700 font-black uppercase tracking-wider block" style={{ fontFamily: '"Outfit", sans-serif' }}>Swaps Available</span>
              <span className="text-lg font-black text-emerald-600 block mt-1" style={{ fontFamily: '"Outfit", sans-serif' }}>{reportGroupSummary.availableForSwap}</span>
            </div>
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-center">
              <span className="text-[9px] text-rose-700 font-black uppercase tracking-wider block" style={{ fontFamily: '"Outfit", sans-serif' }}>Error Batteries</span>
              <span className="text-lg font-black text-rose-600 block mt-1" style={{ fontFamily: '"Outfit", sans-serif' }}>{reportGroupSummary.errorBatteries}</span>
            </div>
            {masterItems.map((item, index) => {
              const total = reportGroupSummary.itemTotals[item.name] || 0;
              const colors = [
                { bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-700', val: 'text-amber-600' },
                { bg: 'bg-teal-50', border: 'border-teal-100', text: 'text-teal-700', val: 'text-teal-600' },
                { bg: 'bg-sky-50', border: 'border-sky-100', text: 'text-sky-700', val: 'text-sky-600' },
                { bg: 'bg-fuchsia-50', border: 'border-fuchsia-100', text: 'text-fuchsia-700', val: 'text-fuchsia-600' },
              ];
              const c = colors[index % colors.length];
              return (
                <div key={item.id} className={`p-4 ${c.bg} border ${c.border} rounded-2xl text-center`}>
                  <span className={`text-[9px] ${c.text} font-black uppercase tracking-wider block`} style={{ fontFamily: '"Outfit", sans-serif' }}>Total {item.name}</span>
                  <span className={`text-lg font-black ${c.val} block mt-1`} style={{ fontFamily: '"Outfit", sans-serif' }}>{total}</span>
                </div>
              );
            })}
          </div>

          {/* Station Details Table Card */}
          <div className="mb-6">
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest pl-1 mb-2" style={{ fontFamily: '"Outfit", sans-serif' }}>Station Inventory Details</h3>
            <div className="border border-zinc-200 rounded-2xl overflow-hidden bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                      <th className="px-4 py-3" style={{ fontFamily: '"Outfit", sans-serif' }}>Station Name</th>
                      <th className="px-4 py-3 text-center" style={{ fontFamily: '"Outfit", sans-serif' }}>Totals</th>
                      <th className="px-4 py-3 text-center text-emerald-600" style={{ fontFamily: '"Outfit", sans-serif' }}>Available</th>
                      <th className="px-4 py-3 text-center text-rose-600" style={{ fontFamily: '"Outfit", sans-serif' }}>Errors</th>
                      {masterItems.map(item => (
                        <th key={item.id} className="px-4 py-3 text-center" style={{ fontFamily: '"Outfit", sans-serif' }}>{item.name}</th>
                      ))}
                      <th className="px-4 py-3 text-right" style={{ fontFamily: '"Outfit", sans-serif' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 text-xs">
                    {reportGroupStations.map((station, sIdx) => (
                      <tr key={station.id} className={sIdx % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50'}>
                        <td className="px-4 py-2.5 font-bold text-zinc-950 text-sm truncate max-w-[200px]" style={{ fontFamily: '"Outfit", sans-serif' }}>
                          {station.name}
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold text-zinc-500">
                          {station.totalBatteries}
                        </td>
                        <td className="px-4 py-2.5 text-center font-black text-emerald-600 text-sm">
                          {station.availableForSwap}
                        </td>
                        <td className="px-4 py-2.5 text-center font-black text-rose-500">
                          {station.errorBatteries}
                        </td>
                        {masterItems.map(item => (
                          <td key={item.id} className="px-4 py-2.5 text-center font-bold text-zinc-800">
                            {station.itemCounts?.[item.name] || 0}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right font-black tracking-tight text-[11px] uppercase whitespace-nowrap" style={{ fontFamily: '"Outfit", sans-serif' }}>
                          {station.verification ? (
                            <span className="text-emerald-600">✅ Verified Today</span>
                          ) : (
                            <span className="text-zinc-400">⏳ Pending Audit</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>


        </div>
      </div>

      {/* Asset Audit Modal */}
      {showAuditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
              <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl border border-zinc-100 dark:border-zinc-800 animate-in zoom-in duration-200">
                  <div className="flex justify-between items-center mb-8">
                      <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <ClipboardCheckIcon className="w-5 h-5 text-emerald-500" />
                        Quick Station Audit
                      </h3>
                      <button onClick={() => setShowAuditModal(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all">
                <XMarkIcon className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
            
            <div className="space-y-6">
              {auditStep === 0 && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Select Station to Audit</label>
                    <CustomSelect 
                      options={stations.map(s => ({ value: s.id, label: s.name }))}
                      value={auditData.stationId}
                      onChange={(val) => setAuditData({...auditData, stationId: val})}
                      placeholder="Choose station..."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Audit Type</label>
                    <div className="grid grid-cols-2 gap-4">
                        <button 
                            onClick={() => setAuditType('quick')}
                            className={`p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${auditType === 'quick' ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/20' : 'border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30'}`}
                        >
                            <div className={`p-4 rounded-2xl ${auditType === 'quick' ? 'bg-emerald-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>
                                <ArrowPathIcon className="w-6 h-6" />
                            </div>
                            <div className="text-center">
                                <p className="font-bold text-zinc-900 dark:text-zinc-100">Quick Audit</p>
                                <p className="text-[10px] text-zinc-400 font-bold uppercase mt-1">Batteries Only</p>
                            </div>
                        </button>
                        <button 
                            onClick={() => setAuditType('complete')}
                            className={`p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${auditType === 'complete' ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30'}`}
                        >
                            <div className={`p-4 rounded-2xl ${auditType === 'complete' ? 'bg-indigo-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>
                                <ClipboardCheckIcon className="w-6 h-6" />
                            </div>
                            <div className="text-center">
                                <p className="font-bold text-zinc-900 dark:text-zinc-100">Complete Audit</p>
                                <p className="text-[10px] text-zinc-400 font-bold uppercase mt-1">Check All Assets</p>
                            </div>
                        </button>
                    </div>
                  </div>

                  <button 
                    disabled={!auditData.stationId}
                    onClick={() => {
                        const station = sortedData.find(s => s.id === auditData.stationId);
                        const initialCounts: Record<string, number> = {};
                        if (station) {
                            initialCounts['Batteries'] = station.totalBatteries;
                            masterItems.forEach(item => {
                                initialCounts[item.id] = station.itemCounts[item.name] || 0;
                            });
                        }
                        setAuditCounts(initialCounts);
                        setAuditStep(2);
                    }}
                    className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-none disabled:opacity-50 disabled:grayscale"
                  >
                    Next Step
                  </button>
                </div>
              )}

              {auditStep === 2 && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin">
                    <p className="text-xs font-bold text-zinc-500 bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                        Please verify physical counts at the station. System counts are shown for reference.
                    </p>

                    <div className="space-y-4">
                        {/* Always show batteries in both quick and complete */}
                        <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[1.5rem] shadow-sm">
                            <div className="flex justify-between items-center mb-3">
                                <span className="font-bold text-sm text-zinc-900 dark:text-white">Batteries</span>
                                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded-md">Expected: {sortedData.find(s => s.id === auditData.stationId)?.totalBatteries}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                <span className="text-[10px] sm:text-xs text-zinc-400 font-bold uppercase tracking-tight whitespace-nowrap">Physical Count:</span>
                                <input 
                                    type="number"
                                    value={auditCounts['Batteries'] || 0}
                                    onChange={(e) => setAuditCounts({...auditCounts, Batteries: parseInt(e.target.value) || 0})}
                                    className="w-full sm:flex-1 px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                            </div>
                        </div>

                        {masterItems.filter(item => {
                            if (auditType === 'quick') return false;
                            return true;
                        }).map(item => (
                            <div key={item.id} className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[1.5rem] shadow-sm">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="font-bold text-sm text-zinc-900 dark:text-white">{item.name}</span>
                                    <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded-md">Expected: {sortedData.find(s => s.id === auditData.stationId)?.itemCounts[item.name] || 0}</span>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                    <span className="text-[10px] sm:text-xs text-zinc-400 font-bold uppercase tracking-tight whitespace-nowrap">Physical Count:</span>
                                    <input 
                                        type="number"
                                        value={auditCounts[item.id] || 0}
                                        onChange={(e) => setAuditCounts({...auditCounts, [item.id]: parseInt(e.target.value) || 0})}
                                        className="w-full sm:flex-1 px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Notes / Remarks</label>
                            <textarea 
                                placeholder="Any broken items or observations?"
                                value={auditData.notes}
                                onChange={(e) => setAuditData({...auditData, notes: e.target.value})}
                                className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all dark:text-zinc-100 h-24 resize-none"
                            />
                    </div>

                    <div className="flex gap-3 sticky bottom-0 bg-white dark:bg-zinc-900 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                        <button onClick={() => setAuditStep(0)} className="flex-1 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-2xl font-bold">Back</button>
                        <button 
                            onClick={handleAuditAction}
                            className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 dark:shadow-none whitespace-nowrap px-2"
                        >
                            Complete <span className="hidden sm:inline">Audit</span>
                        </button>
                    </div>
                </div>
              )}
            </div>
              </div>
          </div>
      )}

      {/* Asset Management Modal */}
      {showAssetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-[2.5rem] p-8 shadow-2xl border border-zinc-100 dark:border-zinc-800 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                      <PlusIcon className="w-5 h-5 text-emerald-500" />
                      Manage Assets
                    </h3>
                    <button onClick={() => setShowAssetModal(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all">
                        <XMarkIcon className="w-5 h-5 text-zinc-400" />
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 overflow-hidden">
                    {/* Add Section */}
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Asset Name</label>
                            <input 
                                type="text" 
                                placeholder="e.g. Fire Extinguisher, Fan..."
                                value={newAsset.name}
                                onChange={(e) => setNewAsset({...newAsset, name: e.target.value})}
                                className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all dark:text-zinc-100"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Category</label>
                            <div className="flex flex-wrap gap-2">
                                {['Assets', 'Furniture', 'Safety', 'Other'].map(cat => (
                                    <button 
                                        key={cat}
                                        onClick={() => setNewAsset({...newAsset, category: cat})}
                                        className={`px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase transition-all ${
                                            newAsset.category === cat 
                                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-lg' 
                                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border border-transparent'
                                        }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button 
                            onClick={addMasterItem}
                            disabled={!newAsset.name.trim()}
                            className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-none disabled:opacity-50 disabled:grayscale"
                        >
                            Register Asset
                        </button>
                    </div>

                    {/* List Section */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">Current Assets</label>
                        <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin">
                            {masterItems.map(item => (
                                <div key={item.id} className="flex justify-between items-center p-4 bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-100 dark:border-zinc-800 rounded-2xl group text-left">
                                    <div>
                                        <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 block">{item.name}</span>
                                        <span className="text-[9px] font-black text-zinc-400 uppercase">{item.category}</span>
                                    </div>
                                    <button 
                                      onClick={() => removeMasterItem(item.id)}
                                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                                    >
                                      <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Verification Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-[2.5rem] p-10 shadow-2xl border border-zinc-100 dark:border-zinc-800 text-center animate-in zoom-in duration-200">
                <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                    <ShieldCheckIcon className="w-10 h-10 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Inventory Check</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8 font-medium">Have you verified all batteries and assets at this station?</p>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowConfirmModal(null)}
                        className="flex-1 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-2xl font-bold text-sm hover:bg-zinc-200 transition-all"
                    >
                        Wait
                    </button>
                    <button 
                        onClick={() => handleVerifyStation(showConfirmModal)}
                        className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 dark:shadow-none"
                    >
                        Yes, Verified
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Group Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-[2.5rem] p-8 shadow-2xl border border-zinc-100 dark:border-zinc-800 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Station Groups</h3>
                    <button onClick={() => setShowGroupModal(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all">
                        <XMarkIcon className="w-5 h-5 text-zinc-400" />
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4 text-left">
                        <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Create New Group</h4>
                        <input 
                            type="text"
                            placeholder="Group Name (e.g. South Delhi)"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-800 rounded-2xl text-sm font-bold outline-none dark:text-white"
                        />
                        <div className="border border-zinc-100 dark:border-zinc-800 rounded-2xl p-4 max-h-[300px] overflow-y-auto space-y-2">
                            {stations.map(station => (
                                <label key={station.id} className="flex items-center gap-3 p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-xl cursor-pointer transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedStationsForGroup.includes(station.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) setSelectedStationsForGroup([...selectedStationsForGroup, station.id]);
                                            else setSelectedStationsForGroup(selectedStationsForGroup.filter(id => id !== station.id));
                                        }}
                                        className="w-4 h-4 rounded-lg accent-indigo-600"
                                    />
                                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">{station.name}</span>
                                </label>
                            ))}
                        </div>
                        <button 
                            onClick={createGroup}
                            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-md"
                        >
                            Create Group
                        </button>
                    </div>

                    <div className="space-y-4 text-left">
                        <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Existing Groups</h4>
                        <div className="space-y-3 overflow-y-auto max-h-[450px] pr-2">
                            {stationGroups.length === 0 ? (
                                <div className="p-8 text-center text-zinc-400 text-xs italic bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl">
                                    No groups created yet.
                                </div>
                            ) : (
                                stationGroups.map(group => (
                                    <div key={group.id} className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex justify-between items-center group">
                                        <div>
                                            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 block">{group.name}</span>
                                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                                                {(group.stationIds || []).length} Stations
                                            </span>
                                        </div>
                                        <button 
                                            onClick={(e) => deleteGroup(group.id, e)}
                                            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
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

      {/* Movement Modal */}
      {showMovementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm text-left">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl border border-zinc-100 dark:border-zinc-800 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Record Asset Movement</h3>
              <button onClick={() => setShowMovementModal(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all">
                <XMarkIcon className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block ml-1 mb-2">Source Type</label>
                <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
                    <button 
                        onClick={() => setMovementData({...movementData, sourceType: 'Office', sourceId: 'OFFICE'})}
                        className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${movementData.sourceType === 'Office' ? 'bg-white dark:bg-zinc-900 shadow-sm text-indigo-600' : 'text-zinc-500'}`}
                    >Office</button>
                    <button 
                        onClick={() => setMovementData({...movementData, sourceType: 'Station', sourceId: ''})}
                        className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${movementData.sourceType === 'Station' ? 'bg-white dark:bg-zinc-900 shadow-sm text-indigo-600' : 'text-zinc-500'}`}
                    >Station</button>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block ml-1 mb-2">Dest Type</label>
                <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
                    <button 
                        onClick={() => setMovementData({...movementData, destType: 'Office', destId: 'OFFICE'})}
                        className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${movementData.destType === 'Office' ? 'bg-white dark:bg-zinc-900 shadow-sm text-indigo-600' : 'text-zinc-500'}`}
                    >Office</button>
                    <button 
                        onClick={() => setMovementData({...movementData, destType: 'Station', destId: ''})}
                        className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${movementData.destType === 'Station' ? 'bg-white dark:bg-zinc-900 shadow-sm text-indigo-600' : 'text-zinc-500'}`}
                    >Station</button>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              {movementData.sourceType === 'Station' && (
                <div>
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block ml-1 mb-2">Select Source Station</label>
                  <CustomSelect 
                    options={stations.map(s => ({ value: s.id, label: s.name }))}
                    value={movementData.sourceId}
                    onChange={(val) => setMovementData(prev => ({ ...prev, sourceId: val }))}
                    placeholder="From..."
                  />
                </div>
              )}

              {movementData.destType === 'Station' && (
                <div>
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block ml-1 mb-2">Select Dest Station</label>
                  <CustomSelect 
                    options={stations.map(s => ({ value: s.id, label: s.name }))}
                    value={movementData.destId}
                    onChange={(val) => setMovementData(prev => ({ ...prev, destId: val }))}
                    placeholder="To..."
                  />
                </div>
              )}

              <div>
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block ml-1 mb-2">Asset Type</label>
                <CustomSelect 
                  options={masterItems.map(m => ({ value: m.id, label: m.name }))}
                  value={movementData.itemId}
                  onChange={(val) => setMovementData(prev => ({ ...prev, itemId: val }))}
                  placeholder="Select Asset"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block ml-1">Quantity</label>
                <input 
                  type="number"
                  min="1"
                  value={movementData.quantity}
                  onChange={(e) => setMovementData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-sm font-bold outline-none dark:text-white"
                />
              </div>

              <button 
                onClick={handleMovement}
                disabled={isSaving}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg disabled:opacity-50"
              >
                {isSaving ? 'Processing...' : 'Transfer Assets'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Battery Detail Drilldown Modal */}
      {selectedBatteryListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm text-left">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-4xl rounded-[2.5rem] p-8 shadow-2xl border border-zinc-100 dark:border-zinc-800 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <div>
                <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 tracking-widest block uppercase mb-1">
                  {selectedBatteryListModal.type === 'total' ? 'Total Batteries' : selectedBatteryListModal.type === 'error' ? 'Error Batteries' : 'Available Swaps'}
                </span>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
                  {selectedBatteryListModal.stationName}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedBatteryListModal(null)} 
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            {/* Search Filter inside Modal */}
            <div className="relative group mb-4 shrink-0">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Search battery ID, IoT ID, status, issues..." 
                value={modalSearchQuery}
                onChange={(e) => setModalSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 text-zinc-900 dark:text-zinc-100 shadow-sm transition-all"
              />
            </div>

            {/* Battery List Table */}
            <div className="overflow-y-auto flex-1 min-h-0 border border-zinc-100 dark:border-zinc-800 rounded-2xl">
              <table className="w-full text-left border-collapse table-fixed min-w-[700px]">
                <thead className="bg-zinc-50 dark:bg-zinc-850 border-b border-zinc-100 dark:border-zinc-800 sticky top-0 z-10">
                  <tr>
                    <th 
                      onClick={() => handleModalSort('id')}
                      className="px-6 py-3 text-[10px] font-black uppercase text-zinc-400 tracking-wider w-1/4 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        <span>Battery ID</span>
                        {modalSortConfig?.key === 'id' && (
                          <span className="text-indigo-600 dark:text-indigo-400">{modalSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleModalSort('iot_id')}
                      className="px-6 py-3 text-[10px] font-black uppercase text-zinc-400 tracking-wider w-1/4 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        <span>IoT ID</span>
                        {modalSortConfig?.key === 'iot_id' && (
                          <span className="text-indigo-600 dark:text-indigo-400">{modalSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleModalSort('status')}
                      className="px-6 py-3 text-[10px] font-black uppercase text-zinc-400 tracking-wider w-1/6 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        <span>Status</span>
                        {modalSortConfig?.key === 'status' && (
                          <span className="text-indigo-600 dark:text-indigo-400">{modalSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleModalSort('soc')}
                      className="px-6 py-3 text-[10px] font-black uppercase text-zinc-400 tracking-wider w-1/6 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-center"
                    >
                      <div className="flex items-center justify-center gap-1.5 font-bold">
                        <span>SoC</span>
                        {modalSortConfig?.key === 'soc' && (
                          <span className="text-indigo-600 dark:text-indigo-400">{modalSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleModalSort('issueText')}
                      className="px-6 py-3 text-[10px] font-black uppercase text-zinc-400 tracking-wider w-1/4 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        <span>Issue</span>
                        {modalSortConfig?.key === 'issueText' && (
                          <span className="text-indigo-600 dark:text-indigo-400">{modalSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                  {sortedModalBatteries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-zinc-400 text-xs italic bg-zinc-50/50 dark:bg-zinc-800/10">
                        No matching batteries found
                      </td>
                    </tr>
                  ) : (
                    sortedModalBatteries.map(bat => {
                      const idBg = bat.isOnline
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20';

                      return (
                        <tr key={bat.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors h-14">
                          <td className="px-6 py-3 whitespace-nowrap">
                            <span className={`px-2.5 py-1.5 rounded-lg text-xs font-bold font-mono tracking-wider ${idBg}`}>
                              {bat.id}
                            </span>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-xs font-semibold text-zinc-500 dark:text-zinc-400 font-mono">
                            {bat.iot_id || '--'}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase ${
                              bat.derivedStatus === 'Error' ? 'bg-red-50 text-red-700 dark:bg-red-900/10 dark:text-red-400 border border-red-100 dark:border-red-900/20' :
                              bat.derivedStatus === 'Charging' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/10 dark:text-amber-400 border border-amber-100 dark:border-amber-900/20' :
                              bat.derivedStatus === 'Low SoC' ? 'bg-orange-50 text-orange-700 dark:bg-orange-900/10 dark:text-orange-400 border border-orange-100 dark:border-orange-900/20' :
                              'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/10 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/20'
                            }`}>
                              {bat.derivedStatus}
                            </span>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-center">
                            <span className={`text-xs font-black ${bat.soc < 20 ? 'text-rose-500' : 'text-zinc-700 dark:text-zinc-300'}`}>
                              {bat.soc}%
                            </span>
                          </td>
                          <td className="px-6 py-3 text-xs font-medium text-zinc-600 dark:text-zinc-300 truncate max-w-xs" title={bat.issueText}>
                            {bat.issueText !== '--' ? (
                              <span className="text-rose-500 dark:text-rose-400 font-bold">{bat.issueText}</span>
                            ) : (
                              <span className="text-zinc-400">None</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 mt-6 shrink-0">
              <button
                onClick={() => setSelectedBatteryListModal(null)}
                className="px-5 py-2.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Paste Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileTextIcon className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">Paste Raw Battery Report Text</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              Copy rows directly from Excel or Google Sheets (including tab-separated columns) and paste them into the box below:
            </p>
            <textarea
              value={manualPasteText}
              onChange={(e) => setManualPasteText(e.target.value)}
              placeholder="Paste Excel columns here (Battery ID, Solution, Make, Model, Status, Station ID, Driver ID...)"
              className="w-full h-48 p-3 text-xs font-mono bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-800 dark:text-zinc-200"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="px-4 py-2 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleManualPasteSubmit}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md"
              >
                Import Report Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyInventoryPage;
