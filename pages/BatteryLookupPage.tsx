
import React, { useState, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon,
  DocumentDuplicateIcon,
  MapPinIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BoltIcon,
  ClipboardIcon,
  ArrowPathIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CheckCircleIcon,
  UserCircleIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ArrowUpOnSquareIcon,
  TicketIcon,
  ExclamationCircleIcon,
  TrashIcon,
  TagIcon,
  ShareIcon
} from '@heroicons/react/24/outline';
import { collection, query, where, getDocs, Firestore, addDoc, updateDoc, doc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { KazamBattery, BatteryIssue, ISSUE_TYPES, UserRole, ColumnGroup } from '../types';
import CustomSelect from '../components/CustomSelect';
import { useBatteryData } from '../hooks/useBatteryData';
import { auth, db } from '../lib/firebase';
import { 
  getStoredBatteries, 
  saveBatteryReport, 
  subscribeToBatteryReport, 
  parseBatteryReportGrid 
} from '../lib/batteryReportStorage';
import SortableHeader from '../components/SortableHeader';
import PaginationFooter from '../components/PaginationFooter';
import MapModal from '../components/MapModal';
import { toPng } from 'html-to-image';

interface ExtendedBattery extends KazamBattery {
  derivedStatus?: string;
  displayLocation?: string;
  isOnlineInstant?: boolean;
  lastUpdateDate?: Date | null;
  latestIssue?: BatteryIssue;
  isInactive?: boolean;
  total_swaps?: number;
  ticketOccurrence?: number;
}

const parseDateToMs = (dateStr?: string): number => {
  if (!dateStr || dateStr.trim() === '' || dateStr === 'N/A') return 0;
  const str = dateStr.trim();
  const ddmmyyyyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(.*))?$/);
  if (ddmmyyyyMatch) {
    const [_, d, m, y, timePart] = ddmmyyyyMatch;
    const formatted = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}${timePart ? ' ' + timePart : ''}`;
    const ts = new Date(formatted).getTime();
    if (!isNaN(ts)) return ts;
  }
  const ts = new Date(str).getTime();
  return isNaN(ts) ? 0 : ts;
};

const parsePastedBatteryRows = (grid: string[][]): KazamBattery[] => {
  return parseBatteryReportGrid(grid);
};

const parseBatteryDate = (input: string | number | undefined): Date | null => {
  if (!input || input === 0 || input === "0") return null;
  if (typeof input === 'number') {
    return new Date(input > 1e11 ? input : input * 1000);
  }
  if (typeof input === 'string') {
    const d = new Date(input);
    if (!isNaN(d.getTime()) && d.getTime() > 0) return d;
  }
  return null;
};

const parseSwapDate = (input: number | undefined): Date | null => {
  if (!input || input === 0) return null;
  return new Date(input > 1e11 ? input : input * 1000);
};

const formatDateForExport = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const normalizeIssueType = (type: string) => {
  if (!type) return 'Other';
  if (type.toLowerCase().includes('uv')) return 'UV Issue';
  if (type.toLowerCase() === 'alert generated') return 'System Alert';
  return type;
};

const cleanDescription = (desc: string) => {
  if (!desc) return '';
  return desc.replace(/alert generated:?\s*/i, '').trim();
};

// Global cache to persist data across navigations within the session
let cachedBatteries: ExtendedBattery[] | null = null;
let cachedFetchTime: number | null = null;

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => { 
    e.stopPropagation(); 
    navigator.clipboard.writeText(text); 
    setCopied(true); 
    setTimeout(() => setCopied(false), 2000); 
  };
  return (
    <button onClick={handleCopy} className={`p-1.5 transition-all rounded-lg ${copied ? 'text-green-500 bg-green-50 dark:bg-green-900/20' : 'text-zinc-400 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
      {copied ? <CheckIcon className="w-3.5 h-3.5" /> : <DocumentDuplicateIcon className="w-3.5 h-3.5" />}
    </button>
  );
};

const HistoryModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  batteryId: string | null;
  issues: BatteryIssue[];
}> = ({ isOpen, onClose, batteryId, issues }) => {
  if (!isOpen || !batteryId) return null;

  const batteryIssues = issues
    .filter(i => i.batteryId === batteryId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col animate-in zoom-in-95 duration-200">
        <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-950/30">
          <div>
            <h3 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-3">
              <ClockIcon className="w-7 h-7 text-indigo-500" />
              Issue History
            </h3>
            <p className="text-sm font-bold text-zinc-500 mt-1">Asset ID: <span className="text-indigo-600 dark:text-indigo-400">{batteryId}</span></p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-2xl transition-all group">
            <XMarkIcon className="w-6 h-6 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
          {batteryIssues.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircleIcon className="w-10 h-10 text-zinc-300" />
              </div>
              <p className="text-zinc-500 font-bold">No issue history found for this battery.</p>
            </div>
          ) : (
            batteryIssues.map((issue, idx) => (
              <div key={issue.id} className="relative pl-8 pb-2 last:pb-0">
                {idx !== batteryIssues.length - 1 && (
                  <div className="absolute left-[11px] top-8 bottom-0 w-0.5 bg-zinc-100 dark:bg-zinc-800" />
                )}
                <div className={`absolute left-0 top-1.5 w-6 h-6 rounded-full border-4 border-white dark:border-zinc-900 z-10 ${issue.status === 'Open' ? 'bg-red-500 shadow-lg shadow-red-200 dark:shadow-none' : 'bg-emerald-500 shadow-lg shadow-emerald-200 dark:shadow-none'}`} />
                
                <div className="bg-zinc-50 dark:bg-zinc-950/40 rounded-3xl p-6 border border-zinc-100 dark:border-zinc-800/50 hover:border-indigo-200 dark:hover:border-indigo-900/30 transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="font-black text-zinc-900 dark:text-white text-lg leading-tight uppercase tracking-tight">
                        {issue.mainDescription || normalizeIssueType(issue.issueType)}
                      </h4>
                      <div className="flex items-center gap-3 mt-2">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${issue.status === 'Open' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'}`}>
                          {issue.status}
                        </span>
                        <span className="text-[11px] font-bold text-zinc-400 flex items-center gap-1.5">
                          <ClockIcon className="w-3.5 h-3.5" />
                          {new Date(issue.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                    </div>
                    {issue.occurrenceCount > 1 && (
                      <div className="bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 text-center">
                        <p className="text-[10px] font-black text-indigo-400 uppercase leading-none mb-1">Occurrences</p>
                        <p className="text-xl font-black text-indigo-600 dark:text-indigo-400 leading-none">{issue.occurrenceCount}</p>
                      </div>
                    )}
                  </div>

                  {issue.subDescription && (
                    <div className="bg-white dark:bg-zinc-900/60 rounded-2xl p-4 border border-zinc-100 dark:border-zinc-800 mb-4">
                      <p className="text-xs font-bold text-zinc-400 uppercase mb-2 flex items-center gap-2">
                        <ClipboardIcon className="w-3.5 h-3.5" />
                        Details
                      </p>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 font-medium leading-relaxed">
                        {issue.subDescription}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center">
                        <UserCircleIcon className="w-4 h-4 text-zinc-500" />
                      </div>
                      <span className="text-[11px] font-bold text-zinc-500">Reported by: <span className="text-zinc-900 dark:text-zinc-200">{issue.raisedByName || 'System'}</span></span>
                    </div>
                    {issue.lastOccurrenceAt && (
                      <span className="text-[10px] font-bold text-zinc-400 italic">
                        Last seen: {new Date(issue.lastOccurrenceAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const BatteryLookupPage: React.FC<{ db: Firestore; role?: UserRole }> = ({ db, role }) => {
  const [allBatteries, setAllBatteries] = useState<ExtendedBattery[]>([]);
  const [allOpenIssues, setAllOpenIssues] = useState<BatteryIssue[]>([]);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedBatteryForHistory, setSelectedBatteryForHistory] = useState<string | null>(null);
  const [fetchTime, setFetchTime] = useState<number>(Date.now());
  const [lookupIds, setLookupIds] = useState<string[]>([]);
  const [pastedIds, setPastedIds] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { updateBatteryStatus } = useBatteryData();
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [stationFilter, setStationFilter] = useState('all');
  const [placeFilter, setPlaceFilter] = useState('all');
  const [issueTypeFilter, setIssueTypeFilter] = useState<string[]>([]);
  const [minSoc, setMinSoc] = useState(0);
  const [maxSoc, setMaxSoc] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | 'none' }>({ key: 'lastUpdateDate', direction: 'desc' });
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isManageGroupsModalOpen, setIsManageGroupsModalOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [columnGroups, setColumnGroups] = useState<ColumnGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('default');
  const [newGroupName, setNewGroupName] = useState('');
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [isCopyingImage, setIsCopyingImage] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isConfirmErrorModalOpen, setIsConfirmErrorModalOpen] = useState(false);
  const [batteryToMarkAsError, setBatteryToMarkAsError] = useState<string | null>(null);
  const [showBatteryUploadModal, setShowBatteryUploadModal] = useState(false);
  const [batteryPasteText, setBatteryPasteText] = useState('');

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
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows: string[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
          const parsedBatteries = parseBatteryReportGrid(rows);
          if (parsedBatteries.length > 0) {
            saveBatteryReport(parsedBatteries, rows);
            fetchData();
            alert(`Successfully loaded and saved ${parsedBatteries.length} batteries from ${file.name} to Local Storage!`);
          } else {
            alert("No valid battery records found in file.");
          }
        } catch (err) {
          console.error("Error reading excel file", err);
          alert("Failed to parse Excel file.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (evt) => {
        try {
          const text = evt.target?.result as string;
          if (!text) return;
          const lines = text.trim().split(/\r?\n/);
          const rows = lines.map(l => l.split(l.includes('\t') ? '\t' : ','));
          const parsedBatteries = parseBatteryReportGrid(rows);
          if (parsedBatteries.length > 0) {
            saveBatteryReport(parsedBatteries, rows);
            fetchData();
            alert(`Successfully loaded and saved ${parsedBatteries.length} batteries from ${file.name} to Local Storage!`);
          } else {
            alert("No valid battery records found in file.");
          }
        } catch (err) {
          console.error("Error reading text file", err);
          alert("Failed to parse file.");
        }
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  const handleBatteryPasteSubmit = () => {
    if (!batteryPasteText.trim()) return;
    const lines = batteryPasteText.trim().split(/\r?\n/);
    const rows = lines.map(l => l.split(l.includes('\t') ? '\t' : ','));
    const parsedBatteries = parseBatteryReportGrid(rows);
    if (parsedBatteries.length > 0) {
      saveBatteryReport(parsedBatteries, rows);
      fetchData();
      alert(`Successfully loaded and saved ${parsedBatteries.length} batteries to Local Storage!`);
      setBatteryPasteText('');
      setShowBatteryUploadModal(false);
    } else {
      alert("No valid battery records found in pasted text.");
    }
  };
  const [mapProps, setMapProps] = useState<{
    isOpen: boolean;
    coordinates?: [number, number];
    title: string;
    subtitle?: string;
  }>({
    isOpen: false,
    title: "",
  });
  const shareTableRef = React.useRef<HTMLDivElement>(null);

  const ALL_COLUMNS = [
    { key: 'id', label: 'Battery ID' },
    { key: 'iot_id', label: 'IoT ID' },
    { key: 'derivedStatus', label: 'Status' },
    { key: 'soc', label: 'SoC' },
    { key: 'voltage', label: 'Voltage' },
    { key: 'latestIssue.issueType', label: 'Latest Issue' },
    { key: 'displayLocation', label: 'Location' },
    { key: 'lastUpdateDate', label: 'Last Updated' },
    { key: 'last_swap_on', label: 'Last Swap' }
  ];

  const openShareModal = () => {
    const first50 = filteredData.slice(0, 50).map(b => b.id);
    setSelectedIds(new Set(first50));
    if (selectedGroupId === 'default') {
      setVisibleColumns(ALL_COLUMNS.map(c => c.key));
    }
    setIsShareModalOpen(true);
  };

  React.useEffect(() => {
    const q = query(
      collection(db, 'battery_column_groups'),
      where('type', '==', 'battery_lookup')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const groups = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ColumnGroup));
      setColumnGroups(groups);
    });
    return () => unsub();
  }, []);

  const handleCreateColumnGroup = async () => {
    if (!newGroupName.trim() || visibleColumns.length === 0) {
      alert("Please provide a group name and select at least one column.");
      return;
    }
    setIsSavingGroup(true);
    try {
      await addDoc(collection(db, 'battery_column_groups'), {
        name: newGroupName.trim(),
        columnKeys: visibleColumns,
        type: 'battery_lookup',
        createdAt: new Date().toISOString()
      });
      setNewGroupName('');
      alert("Group saved successfully!");
    } catch (err) {
      console.error("Failed to create group:", err);
      alert("Failed to create group.");
    } finally {
      setIsSavingGroup(false);
    }
  };

  const handleDeleteColumnGroup = async (groupId: string) => {
    if (!confirm("Are you sure you want to delete this group?")) return;
    try {
      await deleteDoc(doc(db, 'battery_column_groups', groupId));
      if (selectedGroupId === groupId) {
        setSelectedGroupId('default');
      }
    } catch (err) {
      console.error("Failed to delete group:", err);
    }
  };

  const handleApplyGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    if (groupId === 'default') {
      setVisibleColumns(ALL_COLUMNS.map(c => c.key));
    } else {
      const group = columnGroups.find(g => g.id === groupId);
      if (group) {
        setVisibleColumns(group.columnKeys);
      }
    }
  };

  const handleCopyImage = async () => {
    if (!shareTableRef.current) return;
    setIsCopyingImage(true);
    try {
      const dataUrl = await toPng(shareTableRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 3,
        style: {
          borderRadius: '0'
        }
      });
      
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy image:", err);
    } finally {
      setIsCopyingImage(false);
    }
  };

  const handleShareImage = async () => {
    if (!shareTableRef.current) return;
    setIsCopyingImage(true);
    try {
      const dataUrl = await toPng(shareTableRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 3,
        style: {
          borderRadius: '0'
        }
      });
      
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], `Battery_Report_${new Date().toISOString().slice(0,10)}.png`, { type: blob.type });

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Battery Status Report',
          text: 'Check the latest battery status report.'
        });
      } else {
        // Fallback to download if sharing is not supported
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `Battery_Report_${new Date().toISOString().slice(0,10)}.png`;
        link.click();
      }
    } catch (err) {
      console.error("Failed to share image:", err);
    } finally {
      setIsCopyingImage(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedData.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedData.map(b => b.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // Raise Issue States
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [selectedBatteryIdForIssue, setSelectedBatteryIdForIssue] = useState<string | null>(null);
  const [mainIssueDescription, setMainIssueDescription] = useState("Select Issue");
  const [subIssueDescription, setSubIssueDescription] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [markAsError, setMarkAsError] = useState(false);
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);
  const [socAtOccurrence, setSocAtOccurrence] = useState<number>(100);
  const [manualRemovalFactor, setManualRemovalFactor] = useState<string>("100%");

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch only battery-related issues from Firebase
      const fetchIssues = async () => {
        const q = query(collection(db, "battery_issues"), where("status", "in", ["Open", "Pending"]));
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore request timed out')), 15000));
        return Promise.race([getDocs(q), timeoutPromise]) as Promise<any>;
      };

      // 2. Fetch batteries strictly from local storage (no Firebase for battery data)
      const storedBats = getStoredBatteries();

      let activeIssues: BatteryIssue[] = [];
      try {
        const issuesSnapshot = await fetchIssues();
        activeIssues = issuesSnapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as BatteryIssue));
        setAllOpenIssues(activeIssues);
      } catch (issueErr) {
        console.warn("Could not fetch issues from Firestore, proceeding with local storage batteries:", issueErr);
      }
      
      const enriched = storedBats.map(bat => {
        const batIssues = activeIssues.filter(i => i.batteryId === bat.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const ticketOccurrence = batIssues.reduce((acc, curr) => acc + (curr.occurrenceCount || 1), 0);
        return { ...bat, latestIssue: batIssues[0], ticketOccurrence };
      });
      setAllBatteries(enriched);
      const now = Date.now();
      setFetchTime(now);
    } catch (err) {
      console.error("Fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, [db]);

  const getEnrichedBattery = useCallback((bat: ExtendedBattery, currentTime: number) => {
    const lastUpdateDate = parseBatteryDate(bat.last_updated_on);
    const isOnlineInstant = lastUpdateDate ? (currentTime - lastUpdateDate.getTime()) / 1000 < 300 : false;
    
    const isInactive = !bat.dealer_name || bat.dealer_name.trim() === '';
    let displayLocation = isInactive ? 'Unknown' : bat.dealer_name;
    if (bat.driverData) displayLocation = `${bat.driverData.name || 'Unknown Driver'} (${bat.driver_id || 'No ID'})`;

    let status = 'Available';
    if (bat.status === 3) status = 'Error';
    else if (isInactive && !bat.driverData) status = 'Inactive';
    else if (bat.charge_state === 1) status = 'Charging'; 
    else if (bat.status === 4) status = 'Low SoC';
    else if (bat.driverData) status = 'Assigned';

    return { ...bat, derivedStatus: status, displayLocation, isOnlineInstant, lastUpdateDate, isInactive };
  }, []);

  const handleDownloadReport = async () => {
    setIsDownloading(true);
    try {
      const currentTime = Date.now();
      const enriched = allBatteries.map(bat => getEnrichedBattery(bat, currentTime));

      const headers = [
        'Battery ID', 'Make', 'Model', 'Status', 'Station ID', 'Driver ID', 
        'Station Name', 'Driver Name', 'Driver Mobile Number', 'Last Swapped', 
        'Total Swaps', 'Charge Cycles', 'Latitude', 'Longitude', 'SOH', 'SOC', 
        'Battery Voltage', 'Battery Temperature', 'BMS_ID', 'IOT_ID'
      ];

      const rows = enriched.map(bat => {
        const escape = (val: any, forceText: boolean = false) => {
          if (val === undefined || val === null) return '';
          const str = String(val);
          if (forceText) return `="${str.replace(/"/g, '""')}"`;
          return (str.includes(',') || str.includes('"') || str.includes('\n')) ? `"${str.replace(/"/g, '""')}"` : str;
        };

        return [
          escape(bat.id), escape(bat.make), escape(bat.model), escape(bat.derivedStatus),
          escape(bat.dealer_id), escape(bat.driver_id), escape(bat.dealer_name),
          escape(bat.driverData?.name), escape(bat.driverData?.phone),
          escape((bat.batteryHistory?.timestamp || (bat.last_swap_on ? bat.last_swap_on * 1000 : 0)) ? formatDateForExport(new Date(bat.batteryHistory?.timestamp || (bat.last_swap_on ? bat.last_swap_on * 1000 : 0))) : ''),
          escape(bat.total_swaps), escape(bat.charge_cycles || bat.cycles),
          escape(bat.location?.coordinates[1]), escape(bat.location?.coordinates[0]),
          escape(bat.soh), escape(bat.soc), escape(bat.voltage), escape(bat.temperature),
          escape(bat.bms_id, true), escape(bat.iot_id, true)
        ].join(',');
      });

      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const filename = `Battery_Report_${new Date().toISOString().slice(0,10)}.csv`;
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
    } catch (err) {
      console.error("Download failed", err);
    } finally {
      setIsDownloading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
    const unsubscribe = subscribeToBatteryReport(() => {
      fetchData();
    });
    return () => unsubscribe();
  }, [fetchData]);

  const handleApplyLookup = () => {
    const ids = pastedIds.split(/[\n,\s]+/).map(id => id.trim()).filter(id => id !== '');
    setLookupIds(ids);
    setIsModalOpen(false);
    setCurrentPage(1);
  };

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

    setIsIssueModalOpen(true);
  };

  const handleRaiseIssue = async () => {
    if (!mainIssueDescription || mainIssueDescription === "Select Issue" || !selectedBatteryIdForIssue) return;
    
    setIsSubmittingIssue(true);
    const user = auth.currentUser;
    const battery = allBatteries.find(
      (b) => b.id === selectedBatteryIdForIssue,
    );
    const enrichedBattery = battery ? getEnrichedBattery(battery, Date.now()) : null;
    const isOnline = enrichedBattery ? enrichedBattery.isOnlineInstant : false;

    const recResult = getRemovalRecommendation(mainIssueDescription, isOnline, socAtOccurrence);
    const removalFactor = isOnline 
      ? recResult.percent 
      : (manualRemovalFactor === "Keep (0%)" ? 0 : parseInt(manualRemovalFactor));
    const removalRecommendation = isOnline 
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
          : (battery ? (battery.dealer_name || "Station") : "Station"),
        stationId: battery?.dealer_id || "Unknown",
        removalFactor: removalFactor !== undefined ? removalFactor : null,
        removalRecommendation: removalRecommendation || null,
        isOnlineAtRaise: isOnline,
        socAtOccurrence: isOnline ? socAtOccurrence : null,
      });
      if (markAsError) {
        await updateBatteryStatus(selectedBatteryIdForIssue, 3);
      }
      fetchData();
      setIsIssueModalOpen(false);
      // Optional: show a toast or alert
    } catch (err) {
      console.error("Failed to raise issue", err);
    } finally {
      setIsSubmittingIssue(false);
    }
  };

  const filteredData = useMemo(() => {
    let base = allBatteries;
    
    // Filter by lookup IDs if any are provided (matches on either Battery ID or IoT ID)
    if (lookupIds.length > 0) {
      base = base.filter(bat => 
        lookupIds.some(id => 
          id.toLowerCase() === bat.id.toLowerCase() || 
          (bat.iot_id && id.toLowerCase() === bat.iot_id.toLowerCase())
        )
      );
    }

    let data = base.map(bat => getEnrichedBattery(bat, fetchTime)).filter(bat => {
      const normType = bat.latestIssue ? normalizeIssueType(bat.latestIssue.issueType) : null;
      const q = searchQuery.trim().toLowerCase();
      if (q && 
        !bat.id.toLowerCase().includes(q) && 
        !(bat.iot_id || '').toLowerCase().includes(q) && 
        !(normType || '').toLowerCase().includes(q) &&
        !(bat.driverData?.name || '').toLowerCase().includes(q) &&
        !(bat.driver_id || '').toLowerCase().includes(q)
      ) return false;
      if (statusFilter.length > 0 && !statusFilter.includes(bat.derivedStatus || '')) return false;
      if (stationFilter !== 'all' && bat.dealer_name !== stationFilter) return false;
      if (placeFilter !== 'all') {
          if (placeFilter === 'At Station' && (bat.driverData || bat.isInactive)) return false;
          if (placeFilter === 'With Driver' && !bat.driverData) return false;
          if (placeFilter === 'Unknown' && !bat.isInactive) return false;
      }
      if (issueTypeFilter.length > 0) {
        if (!normType || !issueTypeFilter.includes(normType)) return false;
      }

      const isSocValid = typeof bat.soc === 'number';
      if (!isSocValid) return true;
      return bat.soc >= minSoc && bat.soc <= maxSoc;
    });

    if (sortConfig.direction !== 'none') {
      data.sort((a, b) => {
        const getNestedValue = (obj: any, path: string) => {
          return path.split(".").reduce((acc, part) => acc && acc[part], obj);
        };

        let aVal = getNestedValue(a, sortConfig.key);
        let bVal = getNestedValue(b, sortConfig.key);

        if (sortConfig.key === 'last_swap_on') {
          aVal = a.batteryHistory?.timestamp || a.last_swap_on || 0;
          bVal = b.batteryHistory?.timestamp || b.last_swap_on || 0;
        }

        if (sortConfig.key === 'ticketOccurrence') {
          aVal = a.ticketOccurrence || 0;
          bVal = b.ticketOccurrence || 0;
        }

        if (sortConfig.key === 'latestIssue.removalFactor') {
          aVal = a.latestIssue?.removalFactor !== undefined && a.latestIssue?.removalFactor !== null 
            ? Number(a.latestIssue.removalFactor) 
            : -1;
          bVal = b.latestIssue?.removalFactor !== undefined && b.latestIssue?.removalFactor !== null 
            ? Number(b.latestIssue.removalFactor) 
            : -1;
        }

        if (aVal === undefined || aVal === null) aVal = "";
        if (bVal === undefined || bVal === null) bVal = "";

        if (typeof aVal === "string") aVal = aVal.toLowerCase();
        if (typeof bVal === "string") bVal = bVal.toLowerCase();

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return data;
  }, [allBatteries, lookupIds, getEnrichedBattery, fetchTime, searchQuery, statusFilter, stationFilter, placeFilter, issueTypeFilter, minSoc, maxSoc, sortConfig]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Available': return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/50';
      case 'Charging': return 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 border-blue-100 dark:border-blue-900/50';
      case 'Assigned': return 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/50';
      case 'Error': return 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border-red-100 dark:border-red-900/50';
      case 'Low SoC': return 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400 border-orange-100 dark:border-orange-900/50';
      case 'Inactive': return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200';
      default: return 'bg-zinc-50 text-zinc-500 border-zinc-100';
    }
  };

  return (
    <div className="space-y-6 pb-20 w-full animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center justify-between">
        <div className="space-y-4">
          <h2 className="text-3xl font-bold font-heading text-zinc-900 dark:text-white">
            Battery Lookup
          </h2>
          
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
              {filteredData.length} batteries found
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="flex items-center gap-2 px-4 sm:px-5 py-3 rounded-2xl font-bold bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-100 dark:border-zinc-800 shadow-sm transition-all hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer" title="Upload Excel / CSV Battery Data">
            <ArrowUpTrayIcon className="w-5 h-5 text-indigo-500" />
            <span className="hidden sm:inline">Upload</span>
            <input type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" onChange={handleBatteryFileUpload} className="hidden" />
          </label>

          <button 
            onClick={() => setShowBatteryUploadModal(true)}
            className="flex items-center gap-2 px-4 sm:px-5 py-3 rounded-2xl font-bold bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-100 dark:border-zinc-800 shadow-sm transition-all hover:bg-zinc-50 dark:hover:bg-zinc-800"
            title="Paste Battery Data"
          >
            <ArrowUpOnSquareIcon className="w-5 h-5 text-indigo-500" />
            <span className="hidden sm:inline">Paste</span>
          </button>

          <button 
            onClick={openShareModal}
            className="flex items-center gap-2 px-4 sm:px-5 py-3 rounded-2xl font-bold bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-100 dark:border-zinc-800 shadow-sm transition-all hover:bg-zinc-50 dark:hover:bg-zinc-800"
            title="Share Selected Data as Image"
          >
            <DocumentDuplicateIcon className="w-5 h-5 text-indigo-500" />
            <span className="hidden sm:inline">Share</span>
          </button>

          <button 
            onClick={() => setIsModalOpen(true)} 
            className="flex items-center gap-2 px-4 sm:px-6 py-3 rounded-2xl font-bold bg-indigo-600 text-white shadow-lg shadow-indigo-100 dark:shadow-none transition-all hover:bg-indigo-700"
          >
            <MagnifyingGlassIcon className="w-5 h-5" />
            {/* Renamed to "Lookup IDs" and hidden on very small screens if needed */}
            <span className="hidden sm:inline">Lookup IDs</span>
            <span className="sm:hidden">Lookup</span>
          </button>

          <button 
            onClick={fetchData} 
            disabled={loading}
            className="flex items-center gap-2 px-4 sm:px-6 py-3 rounded-2xl font-bold bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-100 dark:border-zinc-800 shadow-sm transition-all hover:bg-zinc-50"
          >
            <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative group flex-1">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search in results..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              className="w-full pl-12 pr-4 py-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/10 dark:text-zinc-100 font-semibold transition-all shadow-sm" 
            />
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            {/* Quick action to clear all custom filters directly from the bar */}
            {(statusFilter.length > 0 || stationFilter !== 'all' || placeFilter !== 'all' || issueTypeFilter.length > 0 || minSoc !== 0 || maxSoc !== 100 || searchQuery !== '' || lookupIds.length > 0) && (
              <button 
                onClick={() => {
                  setStatusFilter([]);
                  setStationFilter('all');
                  setPlaceFilter('all');
                  setIssueTypeFilter([]);
                  setMinSoc(0);
                  setMaxSoc(100);
                  setSearchQuery('');
                  setLookupIds([]);
                }}
                className="flex items-center justify-center gap-1.5 px-4 py-4 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/30 border border-red-200 dark:border-red-900/30 text-red-650 dark:text-red-400 rounded-2xl text-[11px] font-extrabold uppercase transition-all shadow-sm whitespace-nowrap active:scale-95"
                title="Clear All Active Filters"
              >
                <XMarkIcon className="w-4 h-4 shrink-0 text-red-500" />
                <span className="hidden sm:inline">Clear All</span>
              </button>
            )}

            <button 
              onClick={() => setShowAdvanced(!showAdvanced)} 
              className={`flex items-center justify-center gap-2 px-5 py-4 bg-white dark:bg-zinc-900 border rounded-2xl text-sm font-bold transition-all shadow-sm ${showAdvanced ? 'border-indigo-500 text-indigo-600' : 'border-zinc-100 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300'}`}
            >
              <AdjustmentsHorizontalIcon className="w-5 h-5" />
              <span className="hidden sm:inline">Filters</span>
            </button>
          </div>
        </div>

        {showAdvanced && (
          <div className="p-6 md:p-7 bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-150 dark:border-zinc-800 shadow-md animate-in slide-in-from-top-4 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              <CustomSelect 
                multiple 
                label="Status" 
                placeholder="All Statuses"
                options={[
                  {value:'Available',label:'Available'},
                  {value:'Assigned',label:'Assigned'},
                  {value:'Error',label:'Error'},
                  {value:'Low SoC',label:'Low SoC'},
                  {value:'Inactive',label:'Inactive'}
                ]} 
                value={statusFilter} 
                onChange={(v) => setStatusFilter(v as string[])} 
              />
              <CustomSelect label="Station" options={[{value:'all', label:'All Stations'}, ...Array.from(new Set(allBatteries.map(b=>b.dealer_name).filter(Boolean))).map(n=>({value:n,label:n}))]} value={stationFilter} onChange={setStationFilter} />
              <CustomSelect label="Filter Place" options={[{value:'all',label:'All Places'},{value:'At Station',label:'At Station'},{value:'With Driver',label:'With Driver'},{value:'Unknown',label:'Unknown'}]} value={placeFilter} onChange={setPlaceFilter} />
              <CustomSelect 
                multiple 
                label="Filter Issues" 
                options={Array.from(new Set(allBatteries.map(b => b.latestIssue ? normalizeIssueType(b.latestIssue.issueType) : null).filter(Boolean) as string[])).map(t => ({ value: t, label: t }))} 
                value={issueTypeFilter} 
                onChange={(v) => setIssueTypeFilter(v as string[])} 
              />
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">SoC Range</label>
                  <span className="text-[10px] font-bold text-indigo-600">{minSoc}% - {maxSoc}%</span>
                </div>
                <div className="flex flex-col gap-2">
                  <input type="range" min="0" max="100" value={minSoc} onChange={(e) => setMinSoc(Math.min(parseInt(e.target.value), maxSoc))} className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                  <input type="range" min="0" max="100" value={maxSoc} onChange={(e) => setMaxSoc(Math.max(parseInt(e.target.value), minSoc))} className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                </div>
              </div>

              <div className="lg:col-span-full flex justify-end pt-2">
                <button 
                  onClick={() => {
                    setStatusFilter([]);
                    setStationFilter('all');
                    setPlaceFilter('all');
                    setIssueTypeFilter([]);
                    setMinSoc(0);
                    setMaxSoc(100);
                    setSearchQuery('');
                  }}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl text-[11px] font-black uppercase text-red-550 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-650 transition-all border border-red-200 dark:border-red-900/30 whitespace-nowrap shadow-sm hover:border-red-300 active:scale-95"
                >
                  <XMarkIcon className="w-4 h-4 text-red-500" />
                  Clear All Filters
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-auto max-h-[70vh] min-h-[300px] scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800 pb-32">
          <table className="w-full text-left min-w-[1200px] table-fixed">
            <thead className="bg-zinc-50/95 dark:bg-zinc-950/95 border-b border-zinc-100 dark:border-zinc-800 backdrop-blur-sm sticky top-0 z-10">
              <tr>
                <SortableHeader label="Battery ID" sortKey="id" currentSort={sortConfig as any} onSort={handleSort} className="w-44" />
                <SortableHeader label="IoT ID" sortKey="iot_id" currentSort={sortConfig as any} onSort={handleSort} className="w-56" />
                <SortableHeader label="Status" sortKey="derivedStatus" currentSort={sortConfig as any} onSort={handleSort} className="w-32" />
                <SortableHeader label="SoC" sortKey="soc" currentSort={sortConfig as any} onSort={handleSort} className="w-24" />
                <SortableHeader label="Voltage" sortKey="voltage" currentSort={sortConfig as any} onSort={handleSort} className="w-24" />
                <SortableHeader label="Latest Issue" sortKey="latestIssue.issueType" currentSort={sortConfig as any} onSort={handleSort} className="w-64" />
                <SortableHeader label="Location" sortKey="displayLocation" currentSort={sortConfig as any} onSort={handleSort} className="w-48" />
                <SortableHeader label="Removal Factor" sortKey="latestIssue.removalFactor" currentSort={sortConfig as any} onSort={handleSort} className="w-40" />
                <SortableHeader label="Last Updated" sortKey="lastUpdateDate" currentSort={sortConfig as any} onSort={handleSort} className="w-52" />
                <SortableHeader label="Last Swap Date" sortKey="last_swap_on" currentSort={sortConfig as any} onSort={handleSort} className="w-52" />
                <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-widest text-zinc-500 whitespace-nowrap text-center w-24">Map</th>
                <SortableHeader label="Action" sortKey="ticketOccurrence" currentSort={sortConfig as any} onSort={handleSort} className="w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
              {loading && allBatteries.length === 0 ? (
                Array.from({length:5}).map((_,i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-6" colSpan={12}><div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-full"></div></td>
                  </tr>
                ))
              ) : filteredData.length === 0 ? (
                <tr><td colSpan={12} className="py-20 text-center text-zinc-400 font-bold">No assets found matching filters</td></tr>
              ) : (
                paginatedData.map(bat => {
                  const updateStr = bat.lastUpdateDate ? `${bat.lastUpdateDate.toLocaleDateString('en-GB')} ${bat.lastUpdateDate.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' })}` : '';
                  const swapDate = parseSwapDate(bat.batteryHistory?.timestamp || bat.last_swap_on);
                  const swapStr = swapDate ? `${swapDate.toLocaleDateString('en-GB')} ${swapDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '--';
                  const occurrenceCount = bat.ticketOccurrence || 0;

                  return (
                    <tr key={bat._id} className="group hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="font-bold text-zinc-900 dark:text-white text-sm">{bat.id}</span>
                          <div className="flex items-center gap-1">
                            <CopyButton text={bat.id} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="text-xs font-bold text-zinc-500">{bat.iot_id || '--'}</span>
                          <div className="flex items-center gap-1">
                            <CopyButton text={bat.iot_id || ''} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-2">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${getStatusColor(bat.derivedStatus || '')}`}>{bat.derivedStatus}</span>
                          {bat.mosfet && (
                            <div className="flex items-center gap-1.5 px-1">
                              <div 
                                className={`w-2 h-2 rounded-full ${bat.mosfet.charging === 1 ? 'bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-zinc-200 dark:bg-zinc-800'}`}
                                title={`Charging MOSFET: ${bat.mosfet.charging === 1 ? 'ON' : 'OFF'}`}
                              ></div>
                              <div 
                                className={`w-2 h-2 rounded-full ${bat.mosfet.discharging === 1 ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-zinc-200 dark:bg-zinc-800'}`}
                                title={`Discharging MOSFET: ${bat.mosfet.discharging === 1 ? 'ON' : 'OFF'}`}
                              ></div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="w-full max-w-[80px]">
                          <div className="flex justify-between text-[10px] font-bold mb-1 text-zinc-500">
                            <span>{typeof bat.soc === 'number' ? `${bat.soc}%` : '--'}</span>
                            {bat.derivedStatus === 'Charging' && <BoltIcon className="w-3 h-3 text-amber-500 animate-pulse" />}
                          </div>
                          <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${typeof bat.soc === 'number' && bat.soc < 20 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: typeof bat.soc === 'number' ? `${bat.soc}%` : '0%' }}></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs font-bold text-zinc-600 dark:text-zinc-400">
                        {typeof bat.voltage === 'number' ? `${bat.voltage.toFixed(1)} V` : (bat.voltage || '--')}
                      </td>
                      <td className="px-4 py-4">
                        {bat.latestIssue ? (
                          <div 
                            className="flex flex-col gap-1 cursor-pointer group/issue"
                            onClick={() => {
                              setSelectedBatteryForHistory(bat.id);
                              setIsHistoryModalOpen(true);
                            }}
                          >
                            <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-bold text-[10px] uppercase group-hover/issue:text-red-700 transition-colors">
                              <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                              {bat.latestIssue.mainDescription || normalizeIssueType(bat.latestIssue.issueType)}
                              {bat.latestIssue.occurrenceCount > 1 && (
                                <span className="ml-1 px-1 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 text-[8px] font-black">
                                  x{bat.latestIssue.occurrenceCount}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-zinc-500 font-medium line-clamp-2" title={bat.latestIssue.subDescription || cleanDescription(bat.latestIssue.issueType)}>
                              {bat.latestIssue.subDescription || cleanDescription(bat.latestIssue.issueType)}
                            </span>
                            <span className="text-[9px] text-zinc-400 font-bold">
                              Latest: {new Date(bat.latestIssue.lastOccurrenceAt || bat.latestIssue.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">No Issues</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {bat.driverData ? (
                          <div className="flex flex-col gap-0.5" title={bat.displayLocation}>
                            <span className="text-xs font-bold text-zinc-900 dark:text-white truncate max-w-[200px]">
                              {bat.driverData.name || 'Unknown Driver'}
                            </span>
                            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-tighter">
                              {bat.driver_id || 'No ID'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-zinc-900 dark:text-white truncate max-w-[200px]" title={bat.displayLocation}>
                            {bat.displayLocation}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {(() => {
                          let rf = bat.latestIssue?.removalFactor;
                          let isOnlineAtRaise = bat.latestIssue?.isOnlineAtRaise;
                          let rec = bat.latestIssue?.removalRecommendation;
                          
                          if (bat.latestIssue && (rf === undefined || rf === null)) {
                            const isOnlineVal = bat.isOnlineInstant;
                            const socVal = typeof bat.soc === 'number' ? bat.soc : 100;
                            const fallback = getRemovalRecommendation(
                              bat.latestIssue.mainDescription || bat.latestIssue.issueType || "Other",
                              isOnlineVal,
                              socVal
                            );
                            rf = fallback.percent !== null ? fallback.percent : 0;
                            rec = fallback.percent !== null ? `${fallback.percent}%` : "0% (Optional)";
                            isOnlineAtRaise = isOnlineVal;
                          }
                          
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
                      <td className="px-4 py-4">
                        {updateStr ? (
                          <span className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${bat.isOnlineInstant ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                            {updateStr}
                          </span>
                        ) : (
                          <span className="text-zinc-400 dark:text-zinc-600 text-xs font-semibold pl-2">--</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs font-bold text-zinc-600 whitespace-nowrap">{swapStr}</td>
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMapProps({
                              isOpen: true,
                              coordinates: bat.location?.coordinates,
                              title: `Battery ID: ${bat.id}`,
                              subtitle: bat.displayLocation || "Unknown Location",
                            });
                          }}
                          className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40 transition-all text-center inline-block"
                          title="View location on map"
                        >
                          <MapPinIcon className="w-4 h-4 ml-auto mr-auto" />
                        </button>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={(e) => { e.stopPropagation(); openRaiseIssueModal(bat.id); }}
                            className="p-2 rounded-xl text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all relative"
                            title="Raise Issue"
                          >
                            <TicketIcon className="w-5 h-5" />
                            {occurrenceCount > 0 && (
                              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black px-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full border border-white dark:border-zinc-900 shadow-sm">
                                {occurrenceCount}
                              </span>
                            )}
                          </button>
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setBatteryToMarkAsError(bat.id);
                              setIsConfirmErrorModalOpen(true);
                            }}
                            className="p-2 rounded-xl text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                            title="Mark as Error"
                          >
                            <ExclamationCircleIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination Footer */}
        <PaginationFooter
          currentPage={currentPage}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(val) => {
            setItemsPerPage(val);
            setCurrentPage(1);
          }}
          dataLength={filteredData.length}
        />
      </div>

      {/* Lookup Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-950/20">
              <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <ClipboardIcon className="w-5 h-5 text-indigo-500" /> Lookup Battery / IoT IDs
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                <XMarkIcon className="w-6 h-6 text-zinc-400" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-xs text-zinc-500 font-medium">
                Paste the Battery IDs or IoT IDs you want to filter for. Separate them with spaces, commas, or newlines.
              </p>
              <textarea 
                value={pastedIds}
                onChange={(e) => setPastedIds(e.target.value)}
                placeholder="BAT001, IOT1005, BAT002..."
                className="w-full h-48 p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/10 dark:text-zinc-100 font-mono transition-all"
              />
            </div>
            
            <div className="p-6 bg-zinc-50/50 dark:bg-zinc-950/20 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
              <button 
                onClick={() => {
                  setPastedIds('');
                  setLookupIds([]);
                  setIsModalOpen(false);
                }}
                className="px-6 py-2.5 text-red-500 hover:text-red-700 text-xs font-bold transition-all"
              >
                Clear Filters
              </button>
              <button 
                onClick={handleApplyLookup}
                className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-none"
              >
                Apply Lookup
              </button>
            </div>
          </div>
        </div>
      )}

      <HistoryModal 
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        batteryId={selectedBatteryForHistory}
        issues={allOpenIssues}
      />

      {/* Raise Issue Modal */}
      {isIssueModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl animate-in fade-in zoom-in-95 border border-zinc-200 dark:border-zinc-800">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-xl font-bold font-heading text-zinc-900 dark:text-white">
                  Raise Battery Issue
                </h3>
                <p className="text-sm font-bold text-zinc-500">
                  Asset ID: <span className="text-red-600">{selectedBatteryIdForIssue}</span>
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

              {(() => {
                const selectedBattery = allBatteries.find(b => b.id === selectedBatteryIdForIssue);
                const isOnlineSelected = selectedBattery ? getEnrichedBattery(selectedBattery, fetchTime).isOnlineInstant : false;
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

      {isShareModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-zinc-200 dark:border-zinc-800 animate-in zoom-in-95 duration-200">
            <div className="p-4 sm:p-8 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-950/20">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight truncate">Share Summary</h3>
                  <p className="text-zinc-500 dark:text-zinc-400 text-[10px] sm:text-sm font-bold truncate">Generate a shareable image report</p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <button 
                  onClick={handleCopyImage}
                  disabled={isCopyingImage || selectedIds.size === 0}
                  className={`hidden sm:flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl transition-all border shadow-sm disabled:opacity-50 ${
                    isCopied 
                      ? 'bg-emerald-500 text-white border-emerald-500' 
                      : 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                  title="Copy to Clipboard"
                >
                  {isCopied ? <CheckIcon className="w-5 h-5 sm:w-6 sm:h-6" /> : <DocumentDuplicateIcon className="w-5 h-5 sm:w-6 sm:h-6" />}
                </button>
                <button 
                  onClick={handleShareImage}
                  disabled={isCopyingImage || selectedIds.size === 0}
                  className="flex sm:hidden items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-indigo-600 text-white rounded-xl sm:rounded-2xl transition-all shadow-lg shadow-indigo-100 dark:shadow-none disabled:opacity-50"
                  title="Share Report"
                >
                  {isCopyingImage ? <ArrowPathIcon className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" /> : <ShareIcon className="w-5 h-5 sm:w-6 sm:h-6" />}
                </button>
                <button onClick={() => setIsShareModalOpen(false)} className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl sm:rounded-2xl transition-colors">
                  <XMarkIcon className="w-6 h-6 sm:w-7 sm:h-7 text-zinc-400" />
                </button>
              </div>
            </div>
            
            <div className="p-4 sm:p-8 overflow-y-auto flex-1 space-y-6 sm:space-y-8 scrollbar-hide">
              {/* Controls Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
                {/* Battery Selection */}
                <div className="space-y-2 sm:space-y-3">
                  <label className="text-[10px] sm:text-[11px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Select Batteries ({selectedIds.size})</label>
                  <CustomSelect 
                    multiple
                    options={filteredData.map(b => ({ value: b.id, label: b.id }))}
                    value={Array.from(selectedIds)}
                    onChange={(val) => setSelectedIds(new Set(val as string[]))}
                    placeholder="Select IDs to include"
                  />
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setSelectedIds(new Set(filteredData.slice(0, 50).map(b => b.id)))}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                    >
                      Reset to First 50
                    </button>
                    <button 
                      onClick={() => setSelectedIds(new Set())}
                      className="text-[10px] font-bold text-zinc-400 hover:text-zinc-500 transition-colors"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>

                {/* Column Group Selection */}
                <div className="space-y-2 sm:space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] sm:text-[11px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Column Group</label>
                    <button 
                      onClick={() => setIsManageGroupsModalOpen(true)}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-lg transition-colors"
                    >
                      <TagIcon className="w-3 h-3" /> Manage Groups
                    </button>
                  </div>
                  <CustomSelect 
                    options={[
                      { value: 'default', label: 'Default (All Columns)' },
                      ...columnGroups.map(g => ({ value: g.id, label: g.name }))
                    ]}
                    value={selectedGroupId}
                    onChange={(val) => handleApplyGroup(val as string)}
                  />
                </div>
              </div>

              {/* Preview Section */}
              <div className="space-y-4">
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-[1.5rem] sm:rounded-[2.5rem] overflow-hidden bg-zinc-50 dark:bg-zinc-950 shadow-inner">
                  <div className="overflow-x-auto scrollbar-hide border-zinc-100 dark:border-zinc-900">
                    <div ref={shareTableRef} className="bg-white p-8 w-fit">
                      <div className="mb-6 border-l-[6px] border-indigo-600 pl-4">
                        <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-1">
                          {selectedGroupId === 'default' ? 'Battery Status Report' : (columnGroups.find(g => g.id === selectedGroupId)?.name || 'Battery Status Report')}
                        </h4>
                        <p className="text-2xl font-black text-zinc-900 tracking-tight">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                      </div>
                      <table className="w-full text-left border-collapse whitespace-nowrap">
                        <thead>
                          <tr className="bg-zinc-50/50 border-b border-zinc-100">
                            {ALL_COLUMNS.filter(c => visibleColumns.includes(c.key)).map(col => (
                              <th key={col.key} className="px-5 py-4 text-[11px] font-bold uppercase tracking-widest text-zinc-500 whitespace-nowrap">{col.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-50">
                          {filteredData.filter(b => selectedIds.has(b.id)).map(bat => (
                            <tr key={bat.id} className="hover:bg-zinc-50/50 transition-colors">
                              {visibleColumns.includes('id') && <td className="px-5 py-4 text-sm font-black text-zinc-900 whitespace-nowrap">{bat.id}</td>}
                              {visibleColumns.includes('iot_id') && <td className="px-5 py-4 text-xs font-bold text-zinc-500 whitespace-nowrap">{bat.iot_id || '--'}</td>}
                              {visibleColumns.includes('derivedStatus') && (
                                <td className="px-5 py-4 whitespace-nowrap">
                                  <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase border ${getStatusColor(bat.derivedStatus || '')}`}>
                                    {bat.derivedStatus}
                                  </span>
                                </td>
                              )}
                              {visibleColumns.includes('soc') && (
                                <td className="px-5 py-4 whitespace-nowrap">
                                  <div className="flex flex-col gap-1">
                                    <span className="text-xs font-black text-zinc-900">{typeof bat.soc === 'number' ? `${bat.soc}%` : '--'}</span>
                                    <div className="w-12 h-2 bg-zinc-100 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${typeof bat.soc === 'number' && bat.soc < 20 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: typeof bat.soc === 'number' ? `${bat.soc}%` : '0%' }}></div>
                                    </div>
                                  </div>
                                </td>
                              )}
                              {visibleColumns.includes('voltage') && (
                                <td className="px-5 py-4 text-xs font-black text-zinc-900 whitespace-nowrap">
                                  {typeof bat.voltage === 'number' ? `${bat.voltage.toFixed(1)} V` : (bat.voltage || '--')}
                                </td>
                              )}
                              {visibleColumns.includes('latestIssue.issueType') && (
                                <td className="px-5 py-4 whitespace-nowrap">
                                  {bat.latestIssue ? (
                                    <div className="flex flex-col">
                                      <span className="text-[10px] font-black text-red-600 uppercase tracking-tight whitespace-nowrap">{normalizeIssueType(bat.latestIssue.issueType)}</span>
                                      <span className="text-[9px] font-bold text-zinc-400 whitespace-nowrap">{bat.latestIssue.subDescription || cleanDescription(bat.latestIssue.issueType)}</span>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest whitespace-nowrap">No Issues</span>
                                  )}
                                </td>
                              )}
                              {visibleColumns.includes('displayLocation') && <td className="px-5 py-4 text-xs font-bold text-zinc-600 whitespace-nowrap">{bat.displayLocation}</td>}
                              {visibleColumns.includes('lastUpdateDate') && (
                                <td className="px-5 py-4 text-[10px] font-bold text-zinc-500 whitespace-nowrap">
                                  {bat.lastUpdateDate ? bat.lastUpdateDate.toLocaleString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '--'}
                                </td>
                              )}
                              {visibleColumns.includes('last_swap_on') && (
                                <td className="px-5 py-4 text-[10px] font-bold text-zinc-500 whitespace-nowrap">
                                  {parseSwapDate(bat.batteryHistory?.timestamp || bat.last_swap_on)?.toLocaleString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) || '--'}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isManageGroupsModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-zinc-200 dark:border-zinc-800 animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-950/20">
              <div className="flex items-center gap-3">
                <TagIcon className="w-6 h-6 text-indigo-600" />
                <h3 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">Manage Groups</h3>
              </div>
              <button onClick={() => setIsManageGroupsModalOpen(false)} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                <XMarkIcon className="w-6 h-6 text-zinc-400" />
              </button>
            </div>
            
            <div className="p-8 space-y-8 overflow-y-auto max-h-[70vh] scrollbar-hide">
              <div className="space-y-4">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Create New Group</label>
                <div className="space-y-4">
                  <input 
                    type="text" 
                    placeholder="Enter Group Name"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full px-5 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/10 dark:text-zinc-100 font-bold transition-all"
                  />
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Select Columns for this Group</p>
                    <div className="flex flex-wrap gap-2">
                      {ALL_COLUMNS.map(col => (
                        <button
                          key={col.key}
                          onClick={() => {
                            if (visibleColumns.includes(col.key)) {
                              setVisibleColumns(visibleColumns.filter(k => k !== col.key));
                            } else {
                              setVisibleColumns([...visibleColumns, col.key]);
                            }
                          }}
                          className={`px-3 py-2 rounded-xl text-[10px] font-bold transition-all border ${
                            visibleColumns.includes(col.key)
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-white dark:bg-zinc-950 text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-indigo-500'
                          }`}
                        >
                          {col.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button 
                    onClick={handleCreateColumnGroup}
                    disabled={isSavingGroup || !newGroupName.trim() || visibleColumns.length === 0}
                    className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-none disabled:opacity-50"
                  >
                    {isSavingGroup ? 'Saving...' : 'Save Group'}
                  </button>
                </div>
              </div>

              {columnGroups.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Existing Groups</label>
                  <div className="space-y-2">
                    {columnGroups.map(g => (
                      <div key={g.id} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-2xl group">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-zinc-900 dark:text-white">{g.name}</span>
                          <span className="text-[10px] text-zinc-400 font-medium">{g.columnKeys.length} columns</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleApplyGroup(g.id)}
                            className="px-3 py-1.5 bg-white dark:bg-zinc-900 text-indigo-600 rounded-lg text-[10px] font-bold border border-zinc-200 dark:border-zinc-800 hover:bg-indigo-50 transition-all"
                          >
                            Apply
                          </button>
                          <button 
                            onClick={() => handleDeleteColumnGroup(g.id)}
                            className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {isConfirmErrorModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden flex flex-col border border-zinc-200 dark:border-zinc-800 animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <ExclamationTriangleIcon className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight mb-2">Confirm Error Status</h3>
              <p className="text-sm font-bold text-zinc-500">Are you sure you want to mark battery <span className="text-red-600">{batteryToMarkAsError}</span> as Error?</p>
            </div>
            <div className="p-6 bg-zinc-50 dark:bg-zinc-950/20 border-t border-zinc-100 dark:border-zinc-800 flex gap-3">
              <button 
                onClick={() => setIsConfirmErrorModalOpen(false)}
                className="flex-1 py-3 bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 rounded-xl font-bold text-sm border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  if (batteryToMarkAsError) {
                    await updateBatteryStatus(batteryToMarkAsError, 3);
                    fetchData();
                  }
                  setIsConfirmErrorModalOpen(false);
                }}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-all shadow-lg shadow-red-100 dark:shadow-none"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showBatteryUploadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-6 sm:p-8 max-w-2xl w-full border border-zinc-100 dark:border-zinc-800 shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Paste Battery Data</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Paste TSV or CSV rows from Excel / Google Sheets to load battery dataset.
                </p>
              </div>
              <button 
                onClick={() => setShowBatteryUploadModal(false)}
                className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <textarea 
              rows={10}
              placeholder="Paste battery report columns here (Battery ID, Make, Model, Status, Station ID, Driver ID, Station Name, Driver Name, Phone, Last Swap Date, etc.)..."
              value={batteryPasteText}
              onChange={(e) => setBatteryPasteText(e.target.value)}
              className="w-full p-4 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-900 dark:text-white"
            />

            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => setShowBatteryUploadModal(false)}
                className="px-6 py-3 rounded-xl font-bold text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleBatteryPasteSubmit}
                className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-md"
              >
                Parse & Load Batteries
              </button>
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

export default BatteryLookupPage;
