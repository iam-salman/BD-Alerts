import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  ExclamationCircleIcon,
  CheckCircleIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  XMarkIcon,
  PlusIcon,
  WrenchScrewdriverIcon,
  TableCellsIcon,
  CalendarDaysIcon,
  TagIcon,
  PencilSquareIcon,
  EyeIcon,
  QrCodeIcon,
  MapPinIcon,
  BoltIcon,
  SignalIcon,
  CheckBadgeIcon,
  ClockIcon,
  InformationCircleIcon,
  ChevronDownIcon,
  CheckIcon,
  TruckIcon,
  BuildingOffice2Icon,
  ArrowUturnLeftIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  Firestore,
  addDoc,
  writeBatch,
  setDoc
} from "firebase/firestore";
import { format, differenceInDays } from 'date-fns';
import {
  BatteryIssue,
  BatteryIssueStatus,
  ISSUE_STATUSES,
  UserRole,
  ISSUE_TYPES,
  IssueType,
  KazamBattery
} from '@/types';
import CustomSelect from '@/components/CustomSelect';
import SortableHeader from '@/components/SortableHeader';
import CopyButton from '@/components/CopyButton';
import PaginationFooter from '@/components/PaginationFooter';
import { usePopup } from '@/components/PopupContext';
import { BatteryQrScannerModal } from '@/components/BatteryQrScannerModal';
import { useBatteryData } from '@/hooks/useBatteryData';

interface BatteryIssuesPageProps {
  db: Firestore;
  isDarkMode: boolean;
  role?: UserRole | string;
  onBatterySelect?: (battery: KazamBattery) => void;
}

interface BatteryAggregate {
  batteryId: string;
  manufacturerSrNo?: string;
  iotId?: string;
  totalIssues: number;
  openIssuesCount: number;
  closedIssuesCount: number;
  hasActiveIssue: boolean;
  isRepeatIssue: boolean; // Had issue, was resolved/closed, and got another issue!
  latestIssue: BatteryIssue;
  firstIssueDate: string;
  latestIssueDate: string;
  allIssues: BatteryIssue[];
  distinctIssueTypes: string[];
}

export const ISSUE_STATUS_OPTIONS = [
  { value: 'Open', label: 'Open' },
  { value: 'Closed', label: 'Closed' },
  { value: 'RTF', label: 'RTF (Return to Factory)' },
  { value: 'In Plant', label: 'In Plant' },
  { value: 'Returned', label: 'Returned (from plant)' },
  { value: 'Issue Resolved Automatically', label: 'Issue Resolved Automatically' },
];

export const getStatusBadgeStyle = (status: string) => {
  switch (status) {
    case 'Open':
      return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/50';
    case 'Closed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50';
    case 'RTF':
      return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-900/50';
    case 'Issue Resolved Automatically':
      return 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-900/50';
    case 'In Plant':
      return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/50';
    case 'Returned':
      return 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';
    default:
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50';
  }
};

const TableStatusSelect: React.FC<{
  status: BatteryIssueStatus;
  onChange: (newStatus: BatteryIssueStatus) => void;
}> = ({ status, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase border outline-none cursor-pointer flex items-center gap-1.5 transition-all whitespace-nowrap shadow-xs hover:scale-105 active:scale-95 ${getStatusBadgeStyle(status || 'Open')}`}
      >
        <span className="whitespace-nowrap">{status || 'Open'}</span>
        <ChevronDownIcon className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 z-50 mt-1.5 min-w-[190px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-1.5 space-y-1">
            {ISSUE_STATUSES.map(st => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  onChange(st);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-[11px] font-bold uppercase transition-all whitespace-nowrap ${
                  st === status
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-black'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
                }`}
              >
                <span className="whitespace-nowrap">{st}</span>
                {st === status && <CheckIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 stroke-[3]" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const cleanDescription = (desc?: string) => {
  if (!desc) return '';
  let cleaned = desc.replace(/alert generated:?\s*/i, '').trim();
  cleaned = cleaned.replace(/\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/g, '');
  cleaned = cleaned.replace(/\d{1,2}:\d{1,2}(:\d{1,2})?/g, '');
  return cleaned.replace(/\s+/g, ' ').trim();
};

const normalizeIssueType = (type?: string) => {
  if (!type) return 'Other';
  const lower = type.toLowerCase();
  if (lower.includes('uv')) return 'UV issue';
  if (lower.includes('iot')) return 'IoT offline';
  if (lower.includes('bms')) return 'BMS not connected';
  if (lower.includes('e5')) return 'E5 Error';
  if (lower.includes('ce')) return 'CE Error';
  if (lower.includes('e3')) return 'E3 Error';
  if (lower.includes('buzzer')) return 'Buzzer is beeping';
  return type;
};

const formatDisplayDate = (dateStr?: string | number) => {
  if (!dateStr) return '--';
  try {
    const d = typeof dateStr === 'number' ? new Date(dateStr) : new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return format(d, 'MMM dd, yyyy hh:mm a');
  } catch {
    return String(dateStr);
  }
};

const formatShortDate = (dateStr?: string | number) => {
  if (!dateStr) return '--';
  try {
    const d = typeof dateStr === 'number' ? new Date(dateStr) : new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return format(d, 'yyyy-MM-dd');
  } catch {
    return String(dateStr);
  }
};

const SkeletonRow: React.FC<{ cols?: number }> = ({ cols = 10 }) => (
  <tr className="animate-pulse border-b border-zinc-100 dark:border-zinc-800">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="px-5 py-4">
        <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-full"></div>
      </td>
    ))}
  </tr>
);

export const BatteryIssuesPage: React.FC<BatteryIssuesPageProps> = ({
  db,
  isDarkMode: _isDarkMode,
  role = UserRole.OPERATOR,
  onBatterySelect
}) => {
  const { showAlert, showConfirm } = usePopup();
  const { getAllBatteries } = useBatteryData();

  // Cached live battery dataset for automatic IoT ID lookup & telemetry
  const [liveBatteries, setLiveBatteries] = useState<KazamBattery[]>([]);

  // Primary states
  const [issues, setIssues] = useState<BatteryIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'issues' | 'batteries' | 'recurrence'>('issues');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [issueTypeFilter, setIssueTypeFilter] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'createdAt',
    direction: 'desc'
  });

  // Action states
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedBatteryId, setSelectedBatteryId] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);

  // Edit issue modal state
  const [editingIssue, setEditingIssue] = useState<BatteryIssue | null>(null);
  const [isUpdatingIssue, setIsUpdatingIssue] = useState(false);

  // Bulk resolve modal state
  const [showBulkResolve, setShowBulkResolve] = useState(false);
  const [bulkTargetStatus, setBulkTargetStatus] = useState<BatteryIssueStatus>('Closed');
  const [bulkFseComments, setBulkFseComments] = useState('');
  const [bulkFseVisitDate, setBulkFseVisitDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [bulkRows, setBulkRows] = useState<Array<{
    batteryId: string;
    fseComments: string;
    fseVisitDate: string;
    status: BatteryIssueStatus;
    issues: BatteryIssue[];
    isChecking: boolean;
  }>>([{ batteryId: '', fseComments: '', fseVisitDate: format(new Date(), 'yyyy-MM-dd'), status: 'Closed', issues: [], isChecking: false }]);
  const [isBulkResolving, setIsBulkResolving] = useState(false);

  // Dynamic Zones Management state
  const [customZones, setCustomZones] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('battery_dost_custom_zones');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [showManageZonesModal, setShowManageZonesModal] = useState(false);
  const [newZoneInput, setNewZoneInput] = useState('');

  // Report new issue modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [newIssueBatteryId, setNewIssueBatteryId] = useState('');
  const [newIssueMfrSrNo, setNewIssueMfrSrNo] = useState('');
  const [newIssueIotId, setNewIssueIotId] = useState('');
  const [newIssueType, setNewIssueType] = useState<string>('');
  const [newIssueCustomText, setNewIssueCustomText] = useState('');
  const [newIssueRaiseDateTime, setNewIssueRaiseDateTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [newIssueComplaintId, setNewIssueComplaintId] = useState('');
  const [newIssueZone, setNewIssueZone] = useState('');
  const [newIssueStatus, setNewIssueStatus] = useState<BatteryIssueStatus>('Open');
  const [isSubmittingNewIssue, setIsSubmittingNewIssue] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Synchronize dynamic zones from Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "app_settings", "operational_zones"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data?.zones)) {
          setCustomZones(data.zones);
          try {
            localStorage.setItem('battery_dost_custom_zones', JSON.stringify(data.zones));
          } catch {
            // ignore
          }
        }
      }
    }, (err) => {
      console.warn("Failed to listen to operational_zones from Firestore:", err);
    });

    return () => unsub();
  }, [db]);

  // Fetch cached Kazam batteries for automatic IoT ID lookup
  useEffect(() => {
    const fetchCached = async () => {
      try {
        const data = await getAllBatteries('Battery_Dost', {}, false);
        if (data && data.length > 0) {
          setLiveBatteries(data);
        }
      } catch (e) {
        console.warn("Failed to fetch live battery catalog for lookup:", e);
      }
    };
    fetchCached();
  }, [getAllBatteries]);

  // Subscribe to real-time battery issues in Firestore
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "battery_issues"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => {
        const item = { id: d.id, ...d.data() } as BatteryIssue;
        // Normalize status if missing or legacy
        if (!item.status) item.status = 'Open';
        return item;
      });
      setIssues(data);
      setLoading(false);
    }, (err) => {
      console.error("Failed to fetch battery issues:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [db]);

  // Helper to lookup IoT ID from live catalog or issues
  const getBatteryIotId = useCallback((batteryId?: string, fallbackIotId?: string): string => {
    if (fallbackIotId && fallbackIotId.trim()) return fallbackIotId.trim();
    if (!batteryId) return '--';
    const clean = batteryId.trim().toUpperCase();
    const foundLive = liveBatteries.find(b => b.id?.toUpperCase() === clean);
    if (foundLive?.iot_id) return foundLive.iot_id;
    return '--';
  }, [liveBatteries]);

  // Helper to lookup Manufacturer Sr No
  const getBatteryMfrSrNo = useCallback((batteryId?: string, fallbackMfr?: string): string => {
    if (fallbackMfr && fallbackMfr.trim()) return fallbackMfr.trim();
    if (!batteryId) return '--';
    const clean = batteryId.trim().toUpperCase();
    const foundIssue = issues.find(i => i.batteryId?.toUpperCase() === clean && i.manufacturerSrNo);
    if (foundIssue?.manufacturerSrNo) return foundIssue.manufacturerSrNo;
    const foundLive = liveBatteries.find(b => b.id?.toUpperCase() === clean);
    if ((foundLive as any)?.manufacturer_sr_no) return (foundLive as any).manufacturer_sr_no;
    if ((foundLive as any)?.serial_number) return (foundLive as any).serial_number;
    return '--';
  }, [liveBatteries, issues]);

  // Auto-fill IoT ID and Zone when Battery ID is entered in Report Modal
  useEffect(() => {
    if (!newIssueBatteryId.trim()) return;
    const clean = newIssueBatteryId.trim().toUpperCase();
    const found = liveBatteries.find(b => b.id?.toUpperCase() === clean);
    if (found) {
      if (found.iot_id && !newIssueIotId) {
        setNewIssueIotId(found.iot_id);
      }
      if ((found as any).manufacturer_sr_no && !newIssueMfrSrNo) {
        setNewIssueMfrSrNo((found as any).manufacturer_sr_no);
      }
      if (found.dealer_name && !newIssueZone) {
        setNewIssueZone(found.dealer_name);
      }
    }
  }, [newIssueBatteryId, liveBatteries, newIssueZone, newIssueIotId, newIssueMfrSrNo]);

  // Aggregate issues by battery ID
  const batteryAggregates = useMemo<BatteryAggregate[]>(() => {
    const map = new Map<string, BatteryIssue[]>();
    issues.forEach(issue => {
      if (!issue.batteryId) return;
      const bId = issue.batteryId.trim().toUpperCase();
      if (!map.has(bId)) map.set(bId, []);
      map.get(bId)!.push(issue);
    });

    const aggregates: BatteryAggregate[] = [];

    map.forEach((batteryIssues, batteryId) => {
      const sortedAsc = [...batteryIssues].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const sortedDesc = [...batteryIssues].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const openCount = batteryIssues.filter(i => i.status === 'Open' || i.status === 'Pending' || i.status === 'In Plant').length;
      const closedCount = batteryIssues.filter(i => i.status === 'Closed' || i.status === 'Issue Resolved Automatically' || i.status === 'RTF').length;
      const hasActive = openCount > 0;
      const totalCount = batteryIssues.length;

      // Recurrence rule:
      let isRepeat = totalCount >= 2;
      let hadIssueAfterResolution = false;
      let hasSeenResolved = false;
      for (const item of sortedAsc) {
        if (hasSeenResolved && (item.status === 'Open' || item.status === 'In Plant')) {
          hadIssueAfterResolution = true;
          break;
        }
        if (item.status === 'Closed' || item.status === 'RTF' || item.status === 'Issue Resolved Automatically') {
          hasSeenResolved = true;
        }
      }

      if (hadIssueAfterResolution) {
        isRepeat = true;
      }

      const firstDate = sortedAsc[0]?.createdAt || '';
      const latestDate = sortedDesc[0]?.createdAt || '';

      const distinctTypes = Array.from(
        new Set(batteryIssues.map(i => cleanDescription(i.issue || i.mainDescription || normalizeIssueType(i.issueType))))
      ).filter(Boolean);

      const mfr = batteryIssues.find(i => i.manufacturerSrNo)?.manufacturerSrNo;
      const iot = batteryIssues.find(i => i.iotId)?.iotId;

      aggregates.push({
        batteryId,
        manufacturerSrNo: mfr,
        iotId: iot,
        totalIssues: totalCount,
        openIssuesCount: openCount,
        closedIssuesCount: closedCount,
        hasActiveIssue: hasActive,
        isRepeatIssue: isRepeat,
        latestIssue: sortedDesc[0],
        firstIssueDate: firstDate,
        latestIssueDate: latestDate,
        allIssues: sortedDesc,
        distinctIssueTypes: distinctTypes
      });
    });

    return aggregates;
  }, [issues]);

  // Key fleet metrics
  const metrics = useMemo(() => {
    const totalDistinctBatteries = batteryAggregates.length;
    const totalIssueTickets = issues.length;
    const openTickets = issues.filter(i => i.status === 'Open').length;
    const closedTickets = issues.filter(i => i.status === 'Closed' || i.status === 'Issue Resolved Automatically').length;
    const rtfTickets = issues.filter(i => i.status === 'RTF').length;
    const inPlantTickets = issues.filter(i => i.status === 'In Plant').length;
    const returnedTickets = issues.filter(i => i.status === 'Returned').length;
    const repeatBatteries = batteryAggregates.filter(b => b.isRepeatIssue).length;
    const resolutionRate = totalIssueTickets > 0 ? Math.round((closedTickets / totalIssueTickets) * 100) : 0;

    return {
      totalDistinctBatteries,
      totalIssueTickets,
      openTickets,
      closedTickets,
      rtfTickets,
      inPlantTickets,
      returnedTickets,
      repeatBatteries,
      resolutionRate
    };
  }, [batteryAggregates, issues]);

  // Filtering for Issues Table View
  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      // Global Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = (issue.batteryId || '').toLowerCase().includes(q);
        const matchesMfr = (issue.manufacturerSrNo || '').toLowerCase().includes(q);
        const matchesIot = (issue.iotId || getBatteryIotId(issue.batteryId, issue.iotId)).toLowerCase().includes(q);
        const matchesIssue = (issue.issue || issue.mainDescription || issue.issueType || '').toLowerCase().includes(q);
        const matchesComplaint = (issue.complaintId || '').toLowerCase().includes(q);
        const matchesZone = (issue.zone || '').toLowerCase().includes(q);
        const matchesFse = (issue.fseComments || issue.actionTaken || '').toLowerCase().includes(q);
        const matchesUser = (issue.raisedByName || '').toLowerCase().includes(q);
        if (!matchesId && !matchesMfr && !matchesIot && !matchesIssue && !matchesComplaint && !matchesZone && !matchesFse && !matchesUser) return false;
      }

      // Status Filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'repeat') {
          const agg = batteryAggregates.find(b => b.batteryId === issue.batteryId);
          if (!agg || !agg.isRepeatIssue) return false;
        } else if (issue.status !== statusFilter) {
          return false;
        }
      }

      // Zone Filter
      if (zoneFilter !== 'all' && issue.zone !== zoneFilter) {
        return false;
      }

      // Issue Type Filter
      if (issueTypeFilter.length > 0) {
        const issueTitle = (issue.issue || issue.mainDescription || issue.issueType)?.trim();
        if (!issueTypeFilter.includes(issueTitle || '')) return false;
      }

      return true;
    }).sort((a, b) => {
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      if (sortConfig.key === 'batteryId') return dir * (a.batteryId || '').localeCompare(b.batteryId || '');
      if (sortConfig.key === 'mfr') return dir * (a.manufacturerSrNo || '').localeCompare(b.manufacturerSrNo || '');
      if (sortConfig.key === 'iot') return dir * (a.iotId || '').localeCompare(b.iotId || '');
      if (sortConfig.key === 'issue') return dir * (a.issue || a.mainDescription || a.issueType || '').localeCompare(b.issue || b.mainDescription || b.issueType || '');
      if (sortConfig.key === 'createdAt') return dir * (new Date(a.createdAt || a.issueRaiseDateTime || 0).getTime() - new Date(b.createdAt || b.issueRaiseDateTime || 0).getTime());
      if (sortConfig.key === 'complaintId') return dir * (a.complaintId || '').localeCompare(b.complaintId || '');
      if (sortConfig.key === 'zone') return dir * (a.zone || '').localeCompare(b.zone || '');
      if (sortConfig.key === 'status') return dir * (a.status || '').localeCompare(b.status || '');
      if (sortConfig.key === 'fseVisitDate') return dir * (a.fseVisitDate || '').localeCompare(b.fseVisitDate || '');
      return dir * (new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
    });
  }, [issues, searchQuery, statusFilter, zoneFilter, issueTypeFilter, sortConfig, batteryAggregates, getBatteryIotId]);

  // Filtering for Repeat Recurrence analysis view
  const repeatAnalysisBatteries = useMemo(() => {
    return batteryAggregates.filter(b => b.isRepeatIssue).sort((a, b) => {
      if (b.totalIssues !== a.totalIssues) return b.totalIssues - a.totalIssues;
      if (a.hasActiveIssue !== b.hasActiveIssue) return a.hasActiveIssue ? -1 : 1;
      return new Date(b.latestIssueDate).getTime() - new Date(a.latestIssueDate).getTime();
    });
  }, [batteryAggregates]);

  // Available issue types for filter dropdown
  const availableIssueTypes = useMemo(() => {
    const set = new Set<string>();
    issues.forEach(i => {
      const t = (i.issue || i.mainDescription || i.issueType)?.trim();
      if (t) set.add(t);
    });
    return Array.from(set).map(t => ({ value: t, label: t }));
  }, [issues]);

  // Dynamically configured and detected operational zones
  const availableZones = useMemo(() => {
    const set = new Set<string>();
    customZones.forEach(z => {
      if (z && z.trim()) set.add(z.trim());
    });
    issues.forEach(i => {
      if (i.zone && i.zone.trim()) set.add(i.zone.trim());
    });
    return Array.from(set).sort();
  }, [customZones, issues]);

  // Zone options for CustomSelect dropdowns
  const zoneSelectOptions = useMemo(() => {
    return availableZones.map(z => ({ value: z, label: z }));
  }, [availableZones]);

  // Zone filter options including 'All Zones'
  const zoneFilterOptions = useMemo(() => {
    return [
      { value: 'all', label: 'All Zones' },
      ...availableZones.map(z => ({ value: z, label: z }))
    ];
  }, [availableZones]);

  // Add a user-defined zone
  const handleAddZone = async (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    if (availableZones.includes(clean)) {
      showAlert(`Zone "${clean}" already exists.`, 'info');
      return;
    }
    const updated = Array.from(new Set([...customZones, clean]));
    setCustomZones(updated);
    try {
      localStorage.setItem('battery_dost_custom_zones', JSON.stringify(updated));
      await setDoc(doc(db, "app_settings", "operational_zones"), {
        zones: updated,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      showAlert(`Zone "${clean}" added successfully!`, 'success');
      setNewZoneInput('');
    } catch (err: any) {
      console.error("Failed to add zone:", err);
      showAlert(err?.message || "Failed to save zone", 'error');
    }
  };

  // Delete a user-defined zone
  const handleDeleteZone = async (name: string) => {
    const confirmed = await showConfirm(`Are you sure you want to remove Zone "${name}"?`);
    if (!confirmed) return;
    const updated = customZones.filter(z => z !== name);
    setCustomZones(updated);
    try {
      localStorage.setItem('battery_dost_custom_zones', JSON.stringify(updated));
      await setDoc(doc(db, "app_settings", "operational_zones"), {
        zones: updated,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      showAlert(`Zone "${name}" removed.`, 'success');
    } catch (err: any) {
      console.error("Failed to remove zone:", err);
      showAlert(err?.message || "Failed to remove zone", 'error');
    }
  };

  // Active battery selected for history modal
  const selectedBatteryAggregate = useMemo(() => {
    if (!selectedBatteryId) return null;
    return batteryAggregates.find(b => b.batteryId.toUpperCase() === selectedBatteryId.toUpperCase()) || null;
  }, [selectedBatteryId, batteryAggregates]);

  // Active battery live telemetry from Kazam
  const selectedBatteryLive = useMemo(() => {
    if (!selectedBatteryId) return null;
    return liveBatteries.find(b => b.id?.toUpperCase() === selectedBatteryId.toUpperCase()) || null;
  }, [selectedBatteryId, liveBatteries]);

  // Handle Sort
  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Open history modal for a battery
  const handleOpenHistory = (batteryId: string) => {
    setSelectedBatteryId(batteryId.toUpperCase());
    setShowHistoryModal(true);
  };

  // Handle QR code scanner match
  const handleQrScanSuccess = (batteryId: string) => {
    setShowQrScanner(false);
    setSelectedBatteryId(batteryId.toUpperCase());
    setShowHistoryModal(true);
    showAlert(`Scanned Battery: ${batteryId}`, 'success');
  };

  // Delete issue (admin)
  const handleDeleteIssue = async (e: React.MouseEvent, issueId: string) => {
    e.stopPropagation();
    const confirmed = await showConfirm("Are you sure you want to delete this issue record?");
    if (!confirmed) return;
    setActionLoading(issueId);
    try {
      await deleteDoc(doc(db, "battery_issues", issueId));
      showAlert("Issue deleted successfully", 'success');
    } catch (err: any) {
      console.error("Failed to delete issue:", err);
      showAlert(err?.message || "Failed to delete issue", 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Save Edit Issue Modal
  const handleSaveEditedIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIssue) return;
    setIsUpdatingIssue(true);
    try {
      const issueRef = doc(db, "battery_issues", editingIssue.id);
      const isClosing = editingIssue.status === 'Closed' || editingIssue.status === 'RTF' || editingIssue.status === 'Issue Resolved Automatically';
      
      const hasFseComment = !!editingIssue.fseComments?.trim();
      const calculatedFseVisitDate = hasFseComment 
        ? (editingIssue.fseVisitDate || format(new Date(), 'yyyy-MM-dd'))
        : (editingIssue.fseVisitDate || undefined);

      const payload: Partial<BatteryIssue> = {
        manufacturerSrNo: editingIssue.manufacturerSrNo || undefined,
        iotId: editingIssue.iotId || undefined,
        issue: editingIssue.issue || editingIssue.mainDescription || editingIssue.issueType,
        complaintId: editingIssue.complaintId || undefined,
        zone: editingIssue.zone || undefined,
        fseComments: editingIssue.fseComments?.trim() || undefined,
        fseVisitDate: calculatedFseVisitDate,
        status: editingIssue.status,
        actionTaken: editingIssue.fseComments?.trim() || editingIssue.actionTaken || undefined,
        resolutionDate: calculatedFseVisitDate || editingIssue.resolutionDate || (isClosing ? format(new Date(), 'yyyy-MM-dd') : undefined)
      };

      if (isClosing && !editingIssue.resolvedAt) {
        payload.resolvedAt = new Date().toISOString();
      }

      await updateDoc(issueRef, payload as any);
      showAlert(`Battery ${editingIssue.batteryId} updated to ${editingIssue.status}!`, 'success');
      setEditingIssue(null);
    } catch (err: any) {
      console.error("Failed to update issue:", err);
      showAlert(err?.message || "Failed to update issue", 'error');
    } finally {
      setIsUpdatingIssue(false);
    }
  };

  // Quick Status Toggle from Table
  const handleQuickStatusChange = async (issue: BatteryIssue, newStatus: BatteryIssueStatus) => {
    try {
      const issueRef = doc(db, "battery_issues", issue.id);
      const isClosing = newStatus === 'Closed' || newStatus === 'RTF' || newStatus === 'Issue Resolved Automatically';
      
      await updateDoc(issueRef, {
        status: newStatus,
        resolvedAt: isClosing ? new Date().toISOString() : undefined,
        resolutionDate: isClosing ? format(new Date(), 'yyyy-MM-dd') : issue.resolutionDate
      });
      showAlert(`Status updated to ${newStatus}`, 'success');
    } catch (err: any) {
      console.error("Failed to change status:", err);
      showAlert(err?.message || "Failed to change status", 'error');
    }
  };

  // Bulk Resolve & Status Update
  const addBulkRow = () => {
    setBulkRows([...bulkRows, { batteryId: '', fseComments: '', fseVisitDate: format(new Date(), 'yyyy-MM-dd'), status: bulkTargetStatus, issues: [], isChecking: false }]);
  };

  const removeBulkRow = (index: number) => {
    if (bulkRows.length === 1) return;
    setBulkRows(bulkRows.filter((_, i) => i !== index));
  };

  const updateBulkRow = (index: number, field: string, value: string) => {
    if (field === 'batteryId' && value.includes('\n')) {
      const ids = value.split(/\r?\n/).map(id => id.trim()).filter(id => id.length > 0);
      if (ids.length > 1) {
        const newRows = [...bulkRows];
        newRows.splice(index, 1);
        ids.forEach(id => {
          newRows.push({
            batteryId: id,
            fseComments: bulkFseComments,
            fseVisitDate: bulkFseVisitDate,
            status: bulkTargetStatus,
            issues: [],
            isChecking: true
          });
        });
        setBulkRows(newRows);
        newRows.forEach((row, rIdx) => {
          if (row.batteryId) {
            checkBatteryIssues(row.batteryId, rIdx);
          }
        });
        return;
      }
    }

    const newRows = [...bulkRows];
    newRows[index] = { ...newRows[index], [field]: value };
    setBulkRows(newRows);

    if (field === 'batteryId') {
      const batId = value.trim();
      if (batId) {
        checkBatteryIssues(batId, index);
      } else {
        newRows[index].issues = [];
        newRows[index].isChecking = false;
        setBulkRows([...newRows]);
      }
    }
  };

  const checkBatteryIssues = (batteryId: string, index: number) => {
    const clean = batteryId.trim().toUpperCase();
    const matching = issues.filter(i => i.batteryId?.toUpperCase() === clean);
    setBulkRows(prev => {
      const next = [...prev];
      if (next[index]) {
        next[index] = {
          ...next[index],
          issues: matching,
          isChecking: false
        };
      }
      return next;
    });
  };

  const handleBulkSubmit = async () => {
    const validRows = bulkRows.filter(r => r.batteryId.trim());
    if (validRows.length === 0) {
      showAlert("Please enter at least one valid Battery ID.", "error");
      return;
    }

    setIsBulkResolving(true);
    try {
      const batch = writeBatch(db);
      let totalUpdated = 0;
      const now = new Date().toISOString();

      for (const row of validRows) {
        const batId = row.batteryId.trim().toUpperCase();
        const existingOpenIssues = issues.filter(i => i.batteryId?.toUpperCase() === batId && i.status !== 'Closed');

        if (existingOpenIssues.length > 0) {
          existingOpenIssues.forEach(iss => {
            const ref = doc(db, "battery_issues", iss.id);
            batch.update(ref, {
              status: row.status || bulkTargetStatus,
              fseComments: row.fseComments || bulkFseComments || iss.fseComments || 'Bulk update',
              fseVisitDate: row.fseVisitDate || bulkFseVisitDate || format(new Date(), 'yyyy-MM-dd'),
              actionTaken: row.fseComments || bulkFseComments || 'Updated in bulk',
              resolvedAt: (row.status === 'Closed' || row.status === 'RTF') ? now : iss.resolvedAt,
              resolutionDate: row.fseVisitDate || bulkFseVisitDate || format(new Date(), 'yyyy-MM-dd')
            });
            totalUpdated++;
          });
        } else {
          // If no existing ticket, log a record with this status
          const newDocRef = doc(collection(db, "battery_issues"));
          const autoIot = getBatteryIotId(batId);
          const autoMfr = getBatteryMfrSrNo(batId);
          batch.set(newDocRef, {
            batteryId: batId,
            manufacturerSrNo: autoMfr !== '--' ? autoMfr : undefined,
            iotId: autoIot !== '--' ? autoIot : undefined,
            issue: 'Status Check / Bulk Update',
            mainDescription: 'Other',
            issueType: 'Other',
            issueRaiseDateTime: now,
            zone: 'Central',
            fseComments: row.fseComments || bulkFseComments || 'Bulk status logged',
            fseVisitDate: row.fseVisitDate || bulkFseVisitDate || format(new Date(), 'yyyy-MM-dd'),
            status: row.status || bulkTargetStatus,
            occurrenceCount: 1,
            occurrenceDates: [now],
            createdAt: now,
            lastOccurrenceAt: now,
            raisedBy: 'operator@batterydost.com',
            raisedByName: role === UserRole.ADMIN ? 'Admin User' : 'Fleet Operator',
            raisedByRole: role
          });
          totalUpdated++;
        }
      }

      await batch.commit();
      showAlert(`Successfully updated ${totalUpdated} issues across ${validRows.length} batteries!`, "success");
      setShowBulkResolve(false);
      setBulkRows([{ batteryId: '', fseComments: '', fseVisitDate: format(new Date(), 'yyyy-MM-dd'), status: 'Closed', issues: [], isChecking: false }]);
    } catch (err: any) {
      console.error("Bulk update failed:", err);
      showAlert(err?.message || "Failed to update issues in bulk", "error");
    } finally {
      setIsBulkResolving(false);
    }
  };

  // Report New Issue submit
  const handleReportNewIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIssueBatteryId.trim()) {
      showAlert("Please enter a valid Battery ID", "error");
      return;
    }
    if (!newIssueType || !newIssueType.trim() || newIssueType === 'Select Issue') {
      showAlert("Please select an Issue", "error");
      return;
    }

    setIsSubmittingNewIssue(true);
    try {
      const bId = newIssueBatteryId.trim().toUpperCase();
      const nowIso = new Date().toISOString();
      const existingForBattery = issues.filter(i => i.batteryId?.toUpperCase() === bId);
      const isRepeat = existingForBattery.length > 0;
      const finalIssueText = newIssueType === 'Other' && newIssueCustomText.trim() ? newIssueCustomText.trim() : newIssueType;

      const autoIot = newIssueIotId.trim() || getBatteryIotId(bId);
      const autoMfr = newIssueMfrSrNo.trim() || getBatteryMfrSrNo(bId);

      await addDoc(collection(db, "battery_issues"), {
        batteryId: bId,
        manufacturerSrNo: autoMfr !== '--' ? autoMfr : undefined,
        iotId: autoIot !== '--' ? autoIot : undefined,
        issue: finalIssueText,
        mainDescription: newIssueType,
        issueType: newIssueType,
        issueRaiseDateTime: newIssueRaiseDateTime || nowIso,
        complaintId: newIssueComplaintId.trim() || undefined,
        zone: newIssueZone.trim() || 'Central',
        status: newIssueStatus,
        occurrenceCount: (existingForBattery.length || 0) + 1,
        occurrenceDates: [nowIso],
        createdAt: newIssueRaiseDateTime ? new Date(newIssueRaiseDateTime).toISOString() : nowIso,
        lastOccurrenceAt: nowIso,
        raisedBy: 'operator@batterydost.com',
        raisedByName: role === UserRole.ADMIN ? 'Admin User' : 'Fleet Operator',
        raisedByRole: role
      });

      showAlert(`Issue logged for battery ${bId}${isRepeat ? ' (Repeat issue tracked)' : ''}!`, "success");
      setShowReportModal(false);
      setNewIssueBatteryId('');
      setNewIssueMfrSrNo('');
      setNewIssueIotId('');
      setNewIssueType('');
      setNewIssueCustomText('');
      setNewIssueComplaintId('');
      setNewIssueStatus('Open');
    } catch (err: any) {
      console.error("Failed to log issue:", err);
      showAlert(err?.message || "Failed to log issue", "error");
    } finally {
      setIsSubmittingNewIssue(false);
    }
  };

  // Export to Excel with all exact requested columns
  const handleExport = () => {
    const exportData = filteredIssues.map(i => {
      const agg = batteryAggregates.find(b => b.batteryId === i.batteryId);
      return {
        'Battery ID': i.batteryId,
        'Manufacturer Sr, No.': i.manufacturerSrNo || getBatteryMfrSrNo(i.batteryId, i.manufacturerSrNo),
        'IoT ID': i.iotId || getBatteryIotId(i.batteryId, i.iotId),
        'Issue': i.issue || i.mainDescription || i.issueType || 'Unspecified',
        'Issue Raise Date and Time': formatDisplayDate(i.issueRaiseDateTime || i.createdAt),
        'Complaint ID': i.complaintId || '--',
        'Zone': i.zone || '--',
        'FSE Comments': i.fseComments || i.actionTaken || '--',
        'FSE visit Date': i.fseVisitDate || i.resolutionDate || '--',
        'Status': i.status || 'Open',
        'Repeat Issue': agg?.isRepeatIssue ? 'YES' : 'NO',
        'Total Battery Incidents': agg?.totalIssues || 1,
        'Raised By': i.raisedByName || 'Operator'
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Battery_Issues");
    XLSX.writeFile(wb, `Battery_Issues_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  // Pagination helper
  const paginatedIssues = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredIssues.slice(start, start + itemsPerPage);
  }, [filteredIssues, currentPage, itemsPerPage]);

  return (
    <div className="space-y-6 pb-16 animate-in fade-in duration-300">
      {/* Top Header Card */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl">
              <WrenchScrewdriverIcon className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black font-heading text-zinc-900 dark:text-white tracking-tight">
                Battery Issues Monitor
              </h1>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* QR Code Scanner Trigger Button */}
          <button
            onClick={() => setShowQrScanner(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-black rounded-2xl transition-all shadow-md shadow-indigo-200 dark:shadow-none"
          >
            <QrCodeIcon className="w-4 h-4" />
            <span>Scan</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping ml-0.5" />
          </button>

          <button
            onClick={() => setShowManageZonesModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold rounded-2xl transition-all"
            title="Manage Operational Zones"
          >
            <MapPinIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Zones</span>
          </button>

          <button
            onClick={() => setShowReportModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-bold rounded-2xl transition-all shadow-sm"
          >
            <PlusIcon className="w-4 h-4" /> Report Issue
          </button>

          <button
            onClick={() => setShowBulkResolve(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-2xl transition-all shadow-sm"
          >
            <CheckCircleIcon className="w-4 h-4" /> Bulk Update
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold rounded-2xl transition-all"
          >
            <ArrowDownTrayIcon className="w-4 h-4" /> Export Excel
          </button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Metric 1: Open */}
        <div
          onClick={() => { setStatusFilter('Open'); setCurrentPage(1); }}
          className={`p-4 rounded-3xl border transition-all cursor-pointer ${
            statusFilter === 'Open'
              ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 ring-2 ring-rose-500/20'
              : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-rose-300'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 block mb-1">
            Open Issues
          </span>
          <div className="text-2xl font-black text-zinc-900 dark:text-white">
            {metrics.openTickets}
          </div>
          <p className="text-[10px] text-zinc-400 mt-1 font-semibold">Active defects</p>
        </div>

        {/* Metric 2: RTF */}
        <div
          onClick={() => { setStatusFilter('RTF'); setCurrentPage(1); }}
          className={`p-4 rounded-3xl border transition-all cursor-pointer ${
            statusFilter === 'RTF'
              ? 'bg-purple-50 dark:bg-purple-950/30 border-purple-300 dark:border-purple-800 ring-2 ring-purple-500/20'
              : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-purple-300'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 block mb-1">
            RTF
          </span>
          <div className="text-2xl font-black text-zinc-900 dark:text-white">
            {metrics.rtfTickets}
          </div>
          <p className="text-[10px] text-zinc-400 mt-1 font-semibold">Return to Factory</p>
        </div>

        {/* Metric 3: In Plant */}
        <div
          onClick={() => { setStatusFilter('In Plant'); setCurrentPage(1); }}
          className={`p-4 rounded-3xl border transition-all cursor-pointer ${
            statusFilter === 'In Plant'
              ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800 ring-2 ring-blue-500/20'
              : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-blue-300'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 block mb-1">
            In Plant
          </span>
          <div className="text-2xl font-black text-zinc-900 dark:text-white">
            {metrics.inPlantTickets}
          </div>
          <p className="text-[10px] text-zinc-400 mt-1 font-semibold">Under repair at plant</p>
        </div>

        {/* Metric 4: Returned */}
        <div
          onClick={() => { setStatusFilter('Returned'); setCurrentPage(1); }}
          className={`p-4 rounded-3xl border transition-all cursor-pointer ${
            statusFilter === 'Returned'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 ring-2 ring-emerald-500/20'
              : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-emerald-300'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-teal-600 dark:text-teal-400 block mb-1">
            Returned
          </span>
          <div className="text-2xl font-black text-zinc-900 dark:text-white">
            {metrics.returnedTickets}
          </div>
          <p className="text-[10px] text-zinc-400 mt-1 font-semibold">Returned from plant</p>
        </div>

        {/* Metric 5: Closed */}
        <div
          onClick={() => { setStatusFilter('Closed'); setCurrentPage(1); }}
          className={`p-4 rounded-3xl border transition-all cursor-pointer ${
            statusFilter === 'Closed'
              ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 ring-2 ring-zinc-500/20'
              : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-600 dark:text-zinc-400 block mb-1">
            Closed
          </span>
          <div className="text-2xl font-black text-zinc-900 dark:text-white">
            {metrics.closedTickets}
          </div>
          <p className="text-[10px] text-zinc-400 mt-1 font-semibold">{metrics.resolutionRate}% resolution</p>
        </div>

        {/* Metric 6: Repeat Recurrence */}
        <div
          onClick={() => { setStatusFilter('repeat'); setViewMode('issues'); setCurrentPage(1); }}
          className={`p-4 rounded-3xl border transition-all cursor-pointer ${
            statusFilter === 'repeat'
              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 ring-2 ring-amber-500/20'
              : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-amber-300'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 block mb-1">
            Repeat Recurrence
          </span>
          <div className="text-2xl font-black text-zinc-900 dark:text-white">
            {metrics.repeatBatteries}
          </div>
          <p className="text-[10px] text-zinc-400 mt-1 font-semibold">Multiple faults</p>
        </div>
      </div>

      {/* Filters Bar & View Navigation */}
      <div className="space-y-4">
        {/* Status Navigation Tabs (Top Tab Style) */}
        <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-1 overflow-x-auto scrollbar-hide whitespace-nowrap">
          {[
            {
              id: 'all',
              label: 'All Statuses',
              count: issues.length,
              icon: TableCellsIcon,
              activeColor: 'border-indigo-500 text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400',
              activeBadge: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
            },
            {
              id: 'Open',
              label: 'Open',
              count: metrics.openTickets,
              icon: ExclamationCircleIcon,
              activeColor: 'border-rose-500 text-rose-600 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400',
              activeBadge: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
            },
            {
              id: 'Closed',
              label: 'Closed',
              count: metrics.closedTickets,
              icon: CheckBadgeIcon,
              activeColor: 'border-zinc-600 text-zinc-800 bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-200',
              activeBadge: 'bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200'
            },
            {
              id: 'RTF',
              label: 'RTF',
              count: metrics.rtfTickets,
              icon: TruckIcon,
              activeColor: 'border-purple-500 text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400',
              activeBadge: 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
            },
            {
              id: 'In Plant',
              label: 'In Plant',
              count: metrics.inPlantTickets,
              icon: BuildingOffice2Icon,
              activeColor: 'border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400',
              activeBadge: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
            },
            {
              id: 'Returned',
              label: 'Returned',
              count: metrics.returnedTickets,
              icon: ArrowUturnLeftIcon,
              activeColor: 'border-teal-500 text-teal-600 bg-teal-50 dark:bg-teal-900/20 dark:text-teal-400',
              activeBadge: 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'
            },
            {
              id: 'Issue Resolved Automatically',
              label: 'Auto Resolved',
              count: issues.filter(i => i.status === 'Issue Resolved Automatically').length,
              icon: SparklesIcon,
              activeColor: 'border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400',
              activeBadge: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
            },
            {
              id: 'repeat',
              label: 'Repeat Issues Only',
              count: metrics.repeatBatteries,
              icon: ArrowPathIcon,
              activeColor: 'border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400',
              activeBadge: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
            }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setStatusFilter(tab.id);
                setViewMode('issues');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-2 px-5 py-3 rounded-t-xl text-xs font-bold transition-all border-b-2 flex-shrink-0 whitespace-nowrap ${
                statusFilter === tab.id
                  ? tab.activeColor
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/40'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="whitespace-nowrap">{tab.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black whitespace-nowrap ${
                statusFilter === tab.id
                  ? tab.activeBadge
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search and Secondary Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="relative md:col-span-6">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search Battery ID, Mfr Sr No, IoT ID, Issue, Complaint ID, Zone, FSE Comments..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-11 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-zinc-100 font-bold shadow-sm whitespace-nowrap"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="md:col-span-3">
            <CustomSelect
              searchable
              options={zoneFilterOptions}
              value={zoneFilter}
              onChange={(val) => { setZoneFilter(val as string); setCurrentPage(1); }}
              placeholder="Select Zone"
              className="!py-2 !text-xs font-bold"
              footer={
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowManageZonesModal(true);
                  }}
                  className="w-full py-2 px-3 text-left text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-1.5"
                >
                  <PlusIcon className="w-3.5 h-3.5" /> + Add / Manage Zones
                </button>
              }
            />
          </div>

          <div className="md:col-span-3 flex items-center gap-2">
            <div className="flex-1">
              <CustomSelect
                multiple
                options={availableIssueTypes}
                value={issueTypeFilter}
                onChange={(val) => { setIssueTypeFilter(val as string[]); setCurrentPage(1); }}
                placeholder="Filter by Issue Types"
                className="!py-2 !text-xs font-bold"
              />
            </div>
            {(statusFilter !== 'all' || zoneFilter || issueTypeFilter.length > 0 || searchQuery) && (
              <button
                onClick={() => {
                  setStatusFilter('all');
                  setZoneFilter('');
                  setIssueTypeFilter([]);
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition-all whitespace-nowrap shrink-0"
                title="Reset Filters"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Table: The Full Battery Issues Specification */}
      {viewMode === 'issues' && (
        <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 text-sm">
              <WrenchScrewdriverIcon className="w-4 h-4 text-indigo-500" />
              Battery Defect Logs ({filteredIssues.length} Records)
            </h3>
          </div>

          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
            <table className="w-full text-left min-w-[1350px] border-collapse text-xs">
              <thead className="bg-zinc-50/95 dark:bg-zinc-900/95 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <SortableHeader label="Battery ID" sortKey="batteryId" currentSort={sortConfig} onSort={handleSort} />
                  <SortableHeader label="Mfr Sr. No." sortKey="mfr" currentSort={sortConfig} onSort={handleSort} />
                  <SortableHeader label="IoT ID" sortKey="iot" currentSort={sortConfig} onSort={handleSort} />
                  <SortableHeader label="Issue" sortKey="issue" currentSort={sortConfig} onSort={handleSort} />
                  <SortableHeader label="Raise Date & Time" sortKey="createdAt" currentSort={sortConfig} onSort={handleSort} />
                  <SortableHeader label="Complaint ID" sortKey="complaintId" currentSort={sortConfig} onSort={handleSort} />
                  <SortableHeader label="Zone" sortKey="zone" currentSort={sortConfig} onSort={handleSort} />
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap min-w-max">
                    FSE Comments
                  </th>
                  <SortableHeader label="FSE Visit Date" sortKey="fseVisitDate" currentSort={sortConfig} onSort={handleSort} />
                  <SortableHeader label="Status" sortKey="status" currentSort={sortConfig} onSort={handleSort} />
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 text-right whitespace-nowrap min-w-max">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={11} />)
                ) : paginatedIssues.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-16 font-bold text-zinc-400">
                      No battery issues matching the filter criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedIssues.map(issue => {
                    const agg = batteryAggregates.find(b => b.batteryId === issue.batteryId);
                    const iotIdDisplay = issue.iotId || getBatteryIotId(issue.batteryId, issue.iotId);
                    const mfrDisplay = issue.manufacturerSrNo || getBatteryMfrSrNo(issue.batteryId, issue.manufacturerSrNo);

                    return (
                      <tr
                        key={issue.id}
                        onClick={() => handleOpenHistory(issue.batteryId)}
                        className="group hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
                      >
                        {/* 1. Battery ID */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className="font-black text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 transition-colors underline decoration-dotted decoration-zinc-300 font-mono">
                              {issue.batteryId}
                            </span>
                            <CopyButton text={issue.batteryId} />
                            {agg?.isRepeatIssue && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 text-[9px] font-black uppercase">
                                Repeat ({agg.totalIssues}x)
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 2. Manufacturer Sr. No. */}
                        <td className="px-5 py-3.5 font-mono text-zinc-600 dark:text-zinc-400">
                          {mfrDisplay !== '--' ? (
                            <span className="font-semibold">{mfrDisplay}</span>
                          ) : (
                            <span className="text-zinc-400 italic">--</span>
                          )}
                        </td>

                        {/* 3. IoT ID (captured automatically) */}
                        <td className="px-5 py-3.5 font-mono">
                          {iotIdDisplay !== '--' ? (
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-zinc-800 dark:text-zinc-200">{iotIdDisplay}</span>
                              <CopyButton text={iotIdDisplay} />
                            </div>
                          ) : (
                            <span className="text-zinc-400 italic">Not Captured</span>
                          )}
                        </td>

                        {/* 4. Issue */}
                        <td className="px-5 py-3.5">
                          <div className="flex flex-col max-w-[200px]">
                            <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate">
                              {issue.issue || issue.mainDescription || issue.issueType || 'Defect'}
                            </span>
                            {issue.subDescription && (
                              <span className="text-[10px] text-zinc-400 font-medium truncate">
                                {cleanDescription(issue.subDescription)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 5. Issue Raise Date and Time */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-bold text-zinc-800 dark:text-zinc-200">
                              {formatDisplayDate(issue.issueRaiseDateTime || issue.createdAt)}
                            </span>
                            {issue.raisedByName && (
                              <span className="text-[10px] text-zinc-400">
                                By {issue.raisedByName}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 6. Complaint ID */}
                        <td className="px-5 py-3.5 whitespace-nowrap font-mono">
                          {issue.complaintId ? (
                            <span className="px-2 py-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 font-bold text-zinc-700 dark:text-zinc-300">
                              {issue.complaintId}
                            </span>
                          ) : (
                            <span className="text-zinc-400 italic">--</span>
                          )}
                        </td>

                        {/* 7. Zone */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {issue.zone ? (
                            <span className="px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/50 font-bold text-[10px]">
                              {issue.zone}
                            </span>
                          ) : (
                            <span className="text-zinc-400 italic">--</span>
                          )}
                        </td>

                        {/* 8. FSE Comments */}
                        <td className="px-5 py-3.5">
                          <div className="max-w-[220px] truncate">
                            {issue.fseComments || issue.actionTaken ? (
                              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                {issue.fseComments || issue.actionTaken}
                              </span>
                            ) : (
                              <span className="text-zinc-400 italic">No notes</span>
                            )}
                          </div>
                        </td>

                        {/* 9. FSE visit Date */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {issue.fseVisitDate || issue.resolutionDate ? (
                            <span className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                              <CalendarDaysIcon className="w-3.5 h-3.5 text-zinc-400" />
                              {issue.fseVisitDate || issue.resolutionDate}
                            </span>
                          ) : (
                            <span className="text-zinc-400 italic">--</span>
                          )}
                        </td>

                        {/* 10. Status */}
                        <td className="px-5 py-3.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <TableStatusSelect
                            status={issue.status || 'Open'}
                            onChange={(newStatus) => handleQuickStatusChange(issue, newStatus)}
                          />
                        </td>

                        {/* 11. Actions */}
                        <td className="px-5 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setEditingIssue(issue)}
                              title="Edit Issue & FSE Notes"
                              className="p-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-all"
                            >
                              <PencilSquareIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOpenHistory(issue.batteryId)}
                              title="View Battery History & Live Status"
                              className="p-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-400 transition-all"
                            >
                              <EyeIcon className="w-4 h-4" />
                            </button>
                            {role === UserRole.ADMIN && (
                              <button
                                onClick={(e) => handleDeleteIssue(e, issue.id)}
                                disabled={actionLoading === issue.id}
                                title="Delete Record"
                                className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900 text-rose-600 dark:text-rose-400 transition-all disabled:opacity-50"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <PaginationFooter
            currentPage={currentPage}
            totalPages={Math.ceil(filteredIssues.length / itemsPerPage)}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(val) => {
              setItemsPerPage(val);
              setCurrentPage(1);
            }}
            dataLength={filteredIssues.length}
          />
        </div>
      )}

      {/* Recurrence Matrix View */}
      {viewMode === 'recurrence' && (
        <div className="space-y-6">
          <div className="bg-amber-50/50 dark:bg-amber-950/20 p-5 rounded-3xl border border-amber-200 dark:border-amber-900/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-2xl">
                <ArrowPathIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-zinc-900 dark:text-white text-base">
                  Repeat Recurrence Matrix ({repeatAnalysisBatteries.length} Batteries)
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                  These battery packs experienced repeat faults after previous resolution or have active multi-incident loops.
                </p>
              </div>
            </div>
            <button
              onClick={() => { setViewMode('issues'); setStatusFilter('all'); }}
              className="px-4 py-2 rounded-xl bg-white dark:bg-zinc-900 text-xs font-bold text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800"
            >
              Back to Full Grid
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {repeatAnalysisBatteries.map(bat => (
              <div
                key={bat.batteryId}
                onClick={() => handleOpenHistory(bat.batteryId)}
                className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-amber-400 transition-all cursor-pointer flex flex-col justify-between space-y-4 group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-black text-zinc-900 dark:text-white group-hover:text-indigo-600 transition-colors">
                        {bat.batteryId}
                      </span>
                      <CopyButton text={bat.batteryId} />
                    </div>
                    <span className="px-2.5 py-1 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 text-xs font-black">
                      {bat.totalIssues} Incidents
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-zinc-500">
                      <span>IoT ID:</span>
                      <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">
                        {bat.iotId || getBatteryIotId(bat.batteryId, bat.iotId)}
                      </span>
                    </div>
                    <div className="flex justify-between text-zinc-500">
                      <span>Latest Status:</span>
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase border ${getStatusBadgeStyle(bat.latestIssue?.status || 'Open')}`}>
                        {bat.latestIssue?.status || 'Open'}
                      </span>
                    </div>
                    <div className="flex justify-between text-zinc-500">
                      <span>Latest Issue:</span>
                      <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[170px]">
                        {bat.latestIssue?.issue || bat.latestIssue?.mainDescription || bat.latestIssue?.issueType}
                      </span>
                    </div>
                    <div className="flex justify-between text-zinc-500">
                      <span>First Reported:</span>
                      <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                        {formatShortDate(bat.firstIssueDate)}
                      </span>
                    </div>
                    <div className="flex justify-between text-zinc-500">
                      <span>Latest Reported:</span>
                      <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                        {formatShortDate(bat.latestIssueDate)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1">
                    View Complete History ({bat.totalIssues}) &rarr;
                  </span>
                  <span className="text-[10px] text-zinc-400 font-medium">
                    {bat.closedIssuesCount} resolved
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: LIVE QR CODE SCANNER MODAL */}
      {/* ========================================================================= */}
      <BatteryQrScannerModal
        isOpen={showQrScanner}
        onClose={() => setShowQrScanner(false)}
        onScanSuccess={handleQrScanSuccess}
        allBatteryIds={batteryAggregates.map(b => b.batteryId)}
      />

      {/* ========================================================================= */}
      {/* MODAL 2: BATTERY COMPLETE HISTORY & LIVE STATUS MODAL */}
      {/* ========================================================================= */}
      {showHistoryModal && selectedBatteryId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowHistoryModal(false)}
        >
          <div
            className="relative w-full max-w-4xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <WrenchScrewdriverIcon className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black font-mono text-zinc-900 dark:text-white">
                      {selectedBatteryId}
                    </h2>
                    <CopyButton text={selectedBatteryId} />
                    {selectedBatteryAggregate?.isRepeatIssue && (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 text-[10px] font-black uppercase">
                        Recurrence Loop ({selectedBatteryAggregate.totalIssues}x)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 font-medium">
                    Comprehensive Telemetry & Chronological Defect Lifecycle
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-2 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
              {/* SECTION A: Current Live Status & Telemetry */}
              <div className="bg-zinc-50 dark:bg-zinc-950/50 p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                    <BoltIcon className="w-4 h-4 text-amber-500" /> Current Telemetry & Operational State
                  </h4>
                  {selectedBatteryLive ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Telemetry Connected
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-400 font-medium">
                      Telemetry data from operational database
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">IoT ID</span>
                    <p className="font-mono text-sm font-black text-zinc-900 dark:text-white truncate">
                      {selectedBatteryAggregate?.iotId || getBatteryIotId(selectedBatteryId)}
                    </p>
                  </div>
                  <div className="p-3 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Manufacturer Sr No</span>
                    <p className="font-mono text-sm font-black text-zinc-900 dark:text-white truncate">
                      {selectedBatteryAggregate?.manufacturerSrNo || getBatteryMfrSrNo(selectedBatteryId)}
                    </p>
                  </div>
                  <div className="p-3 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">SoC / SoH</span>
                    <p className="text-sm font-black text-zinc-900 dark:text-white">
                      {selectedBatteryLive ? `${selectedBatteryLive.soc ?? '--'}% / ${selectedBatteryLive.soh ?? '--'}%` : '--'}
                    </p>
                  </div>
                  <div className="p-3 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Location / Hub</span>
                    <p className="text-sm font-black text-zinc-900 dark:text-white truncate">
                      {selectedBatteryLive?.dealer_name || selectedBatteryAggregate?.latestIssue?.zone || 'Central'}
                    </p>
                  </div>
                </div>

                {selectedBatteryLive?.driverData && (
                  <div className="p-3.5 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <UserCircleIcon className="w-5 h-5 text-indigo-500" />
                      <div>
                        <span className="font-bold text-zinc-800 dark:text-zinc-200">
                          Assigned to: {selectedBatteryLive.driverData.name}
                        </span>
                        <span className="text-zinc-500 ml-2">({selectedBatteryLive.driverData.phone})</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION B: Chronological Issues History Timeline */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                    <ClockIcon className="w-4 h-4 text-indigo-500" />
                    Issue History Timeline ({selectedBatteryAggregate?.allIssues.length || 0} Records)
                  </h4>
                  <button
                    onClick={() => {
                      setShowHistoryModal(false);
                      setNewIssueBatteryId(selectedBatteryId);
                      setShowReportModal(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all flex items-center gap-1"
                  >
                    <PlusIcon className="w-3.5 h-3.5" /> Log Issue for this Battery
                  </button>
                </div>

                {(!selectedBatteryAggregate || selectedBatteryAggregate.allIssues.length === 0) ? (
                  <div className="p-8 text-center bg-zinc-50 dark:bg-zinc-950/30 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800">
                    <CheckBadgeIcon className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                    <p className="font-bold text-zinc-700 dark:text-zinc-300 text-sm">No historical defects logged</p>
                    <p className="text-xs text-zinc-400 mt-1">This battery has a clean service record.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedBatteryAggregate.allIssues.map((iss, index) => (
                      <div
                        key={iss.id}
                        className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
                      >
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-600 dark:text-zinc-400">
                              #{selectedBatteryAggregate.allIssues.length - index}
                            </span>
                            <h5 className="font-bold text-sm text-zinc-900 dark:text-white">
                              {iss.issue || iss.mainDescription || iss.issueType || 'Defect'}
                            </h5>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-0.5 rounded-xl text-[10px] font-black uppercase border ${getStatusBadgeStyle(iss.status || 'Open')}`}>
                              {iss.status || 'Open'}
                            </span>
                            <button
                              onClick={() => {
                                setShowHistoryModal(false);
                                setEditingIssue(iss);
                              }}
                              className="px-2.5 py-1 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300"
                            >
                              Edit
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-zinc-50/50 dark:bg-zinc-950/20 p-3 rounded-xl">
                          <div>
                            <span className="text-[10px] text-zinc-400 font-bold block">Raised On</span>
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                              {formatDisplayDate(iss.issueRaiseDateTime || iss.createdAt)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-400 font-bold block">Complaint ID</span>
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                              {iss.complaintId || '--'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-400 font-bold block">Zone</span>
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                              {iss.zone || '--'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-400 font-bold block">FSE Visit Date</span>
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                              {iss.fseVisitDate || iss.resolutionDate || '--'}
                            </span>
                          </div>
                        </div>

                        {iss.fseComments && (
                          <div className="text-xs bg-amber-50/30 dark:bg-amber-950/10 p-3 rounded-xl border border-amber-100 dark:border-amber-950 text-zinc-700 dark:text-zinc-300">
                            <span className="font-bold text-amber-600 dark:text-amber-400 block mb-0.5">FSE Comments:</span>
                            {iss.fseComments}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 flex justify-end">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-5 py-2.5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: EDIT ISSUE / FSE COMMENTS MODAL */}
      {/* ========================================================================= */}
      {editingIssue && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setEditingIssue(null)}
        >
          <div
            className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-600">
                  <PencilSquareIcon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-black text-zinc-900 dark:text-white">
                    Update Issue & FSE Details
                  </h2>
                  <p className="text-xs font-mono text-zinc-500">
                    Battery: {editingIssue.batteryId}
                  </p>
                </div>
              </div>
              <button onClick={() => setEditingIssue(null)}>
                <XMarkIcon className="w-5 h-5 text-zinc-400 hover:text-zinc-600" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedIssue} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">Status</label>
                  <CustomSelect
                    options={ISSUE_STATUS_OPTIONS}
                    value={editingIssue.status}
                    onChange={(val) => setEditingIssue({ ...editingIssue, status: val as BatteryIssueStatus })}
                    placeholder="Select Status"
                  />
                </div>
                <div>
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">Zone</label>
                  <CustomSelect
                    searchable
                    options={zoneSelectOptions}
                    value={editingIssue.zone || ''}
                    onChange={(val) => setEditingIssue({ ...editingIssue, zone: val as string })}
                    placeholder="Select Zone"
                    footer={
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowManageZonesModal(true);
                        }}
                        className="w-full py-2 px-3 text-left text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-1.5"
                      >
                        <PlusIcon className="w-3.5 h-3.5" /> + Add / Manage Zones
                      </button>
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">Manufacturer Sr No (Optional)</label>
                  <input
                    type="text"
                    value={editingIssue.manufacturerSrNo || ''}
                    onChange={(e) => setEditingIssue({ ...editingIssue, manufacturerSrNo: e.target.value })}
                    placeholder="MFR-SN-XXXX"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl font-bold font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">IoT ID</label>
                  <input
                    type="text"
                    value={editingIssue.iotId || ''}
                    onChange={(e) => setEditingIssue({ ...editingIssue, iotId: e.target.value })}
                    placeholder="IOT-XXXX"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl font-bold font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">Complaint ID (Optional)</label>
                <input
                  type="text"
                  value={editingIssue.complaintId || ''}
                  onChange={(e) => setEditingIssue({ ...editingIssue, complaintId: e.target.value })}
                  placeholder="e.g. CMP-8921"
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl font-bold font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-zinc-700 dark:text-zinc-300">FSE Comments / Action Notes</label>
                  <span className="text-[10px] text-zinc-400 font-medium">Logged when FSE is aligned</span>
                </div>
                <textarea
                  rows={3}
                  value={editingIssue.fseComments || editingIssue.actionTaken || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const todayStr = format(new Date(), 'yyyy-MM-dd');
                    setEditingIssue({ 
                      ...editingIssue, 
                      fseComments: val,
                      // Automatically set FSE visit date to comment date if comment is present
                      fseVisitDate: val.trim() ? (editingIssue.fseVisitDate || todayStr) : editingIssue.fseVisitDate
                    });
                  }}
                  placeholder="Enter notes when Field Service Engineer is aligned / service performed..."
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl font-medium"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-zinc-700 dark:text-zinc-300">FSE Visit Date</label>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">Defaults to comment date</span>
                </div>
                <input
                  type="date"
                  value={editingIssue.fseVisitDate || (editingIssue.fseComments?.trim() ? format(new Date(), 'yyyy-MM-dd') : '') || editingIssue.resolutionDate || ''}
                  onChange={(e) => setEditingIssue({ ...editingIssue, fseVisitDate: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingIssue(null)}
                  className="px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 font-bold text-zinc-600 dark:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingIssue}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50"
                >
                  {isUpdatingIssue ? 'Saving...' : 'Save Updates'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: REPORT NEW ISSUE MODAL */}
      {/* ========================================================================= */}
      {showReportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowReportModal(false)}
        >
          <div
            className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-600">
                  <PlusIcon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-black text-zinc-900 dark:text-white">
                    Report Battery Issue
                  </h2>
                  <p className="text-xs text-zinc-500 font-medium">
                    Automatically retrieves IoT ID and tracks recurrence
                  </p>
                </div>
              </div>
              <button onClick={() => setShowReportModal(false)}>
                <XMarkIcon className="w-5 h-5 text-zinc-400 hover:text-zinc-600" />
              </button>
            </div>

            <form onSubmit={handleReportNewIssue} className="p-6 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                    Battery ID <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BD-BAT-1049"
                    value={newIssueBatteryId}
                    onChange={(e) => setNewIssueBatteryId(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl font-mono font-black uppercase"
                  />
                </div>
                <div>
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                    Manufacturer Sr No (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. MFR-SN-00192"
                    value={newIssueMfrSrNo}
                    onChange={(e) => setNewIssueMfrSrNo(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                    IoT ID (Auto-captured)
                  </label>
                  <input
                    type="text"
                    placeholder="Auto-detected from report"
                    value={newIssueIotId}
                    onChange={(e) => setNewIssueIotId(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                    Complaint ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CMP-10293"
                    value={newIssueComplaintId}
                    onChange={(e) => setNewIssueComplaintId(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                    Issue <span className="text-rose-500">*</span>
                  </label>
                  <CustomSelect
                    options={[
                      { value: "Select Issue", label: "Select Issue" },
                      ...ISSUE_TYPES.map(t => ({ value: t, label: t }))
                    ]}
                    value={newIssueType || "Select Issue"}
                    onChange={(val) => setNewIssueType(val as string)}
                    placeholder="Select Issue"
                  />
                </div>
                <div>
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                    Initial Status
                  </label>
                  <CustomSelect
                    options={ISSUE_STATUS_OPTIONS}
                    value={newIssueStatus}
                    onChange={(val) => setNewIssueStatus(val as BatteryIssueStatus)}
                    placeholder="Select Status"
                  />
                </div>
              </div>

              {newIssueType === 'Other' && (
                <div>
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                    Custom Issue Description
                  </label>
                  <input
                    type="text"
                    placeholder="Describe the defect..."
                    value={newIssueCustomText}
                    onChange={(e) => setNewIssueCustomText(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl font-bold"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                    Issue Raise Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={newIssueRaiseDateTime}
                    onChange={(e) => setNewIssueRaiseDateTime(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                    Zone
                  </label>
                  <CustomSelect
                    searchable
                    options={zoneSelectOptions}
                    value={newIssueZone}
                    onChange={(val) => setNewIssueZone(val as string)}
                    placeholder="Select Zone"
                    footer={
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowManageZonesModal(true);
                        }}
                        className="w-full py-2 px-3 text-left text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-1.5"
                      >
                        <PlusIcon className="w-3.5 h-3.5" /> + Add / Manage Zones
                      </button>
                    }
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 font-bold text-zinc-600 dark:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNewIssue}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50"
                >
                  {isSubmittingNewIssue ? 'Logging Issue...' : 'Log Battery Issue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: BULK UPDATE / RESOLVE MODAL */}
      {/* ========================================================================= */}
      {showBulkResolve && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowBulkResolve(false)}
        >
          <div
            className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600">
                  <CheckCircleIcon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-black text-zinc-900 dark:text-white">
                    Bulk Status Update & Resolution
                  </h2>
                  <p className="text-xs text-zinc-500 font-medium">
                    Batch update status & FSE notes across multiple batteries
                  </p>
                </div>
              </div>
              <button onClick={() => setShowBulkResolve(false)}>
                <XMarkIcon className="w-5 h-5 text-zinc-400 hover:text-zinc-600" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <div>
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">Target Status</label>
                  <CustomSelect
                    options={ISSUE_STATUS_OPTIONS}
                    value={bulkTargetStatus}
                    onChange={(val) => setBulkTargetStatus(val as BatteryIssueStatus)}
                    placeholder="Select Status"
                  />
                </div>
                <div>
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">Common FSE Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. Field verification complete"
                    value={bulkFseComments}
                    onChange={(e) => setBulkFseComments(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl font-medium"
                  />
                </div>
                <div>
                  <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">FSE Visit Date</label>
                  <input
                    type="date"
                    value={bulkFseVisitDate}
                    onChange={(e) => setBulkFseVisitDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-700 dark:text-zinc-300">
                    Battery List (Paste multiple IDs below)
                  </span>
                  <button
                    onClick={addBulkRow}
                    className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold rounded-lg text-[11px]"
                  >
                    + Add Row
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {bulkRows.map((row, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Paste or type Battery ID (or multi-line list)"
                        value={row.batteryId}
                        onChange={(e) => updateBulkRow(idx, 'batteryId', e.target.value)}
                        className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl font-mono font-bold uppercase"
                      />
                      <input
                        type="text"
                        placeholder="Individual FSE comment (optional)"
                        value={row.fseComments}
                        onChange={(e) => updateBulkRow(idx, 'fseComments', e.target.value)}
                        className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl font-medium"
                      />
                      {bulkRows.length > 1 && (
                        <button
                          onClick={() => removeBulkRow(idx)}
                          className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBulkResolve(false)}
                className="px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 font-bold text-zinc-600 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkSubmit}
                disabled={isBulkResolving}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50"
              >
                {isBulkResolving ? 'Updating...' : `Apply Bulk Status (${bulkTargetStatus})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: DYNAMIC ZONE MANAGEMENT MODAL */}
      {/* ========================================================================= */}
      {showManageZonesModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowManageZonesModal(false)}
        >
          <div
            className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-600">
                  <MapPinIcon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-black text-zinc-900 dark:text-white">
                    Operational Zones
                  </h2>
                  <p className="text-xs text-zinc-500 font-medium">
                    Add and manage your operational zones
                  </p>
                </div>
              </div>
              <button onClick={() => setShowManageZonesModal(false)}>
                <XMarkIcon className="w-5 h-5 text-zinc-400 hover:text-zinc-600" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs overflow-y-auto">
              {/* Add Zone Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddZone(newZoneInput);
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  placeholder="Enter new zone name (e.g. North Zone)"
                  value={newZoneInput}
                  onChange={(e) => setNewZoneInput(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl font-bold text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <button
                  type="submit"
                  disabled={!newZoneInput.trim()}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-2xl transition-all shadow-sm flex items-center gap-1"
                >
                  <PlusIcon className="w-4 h-4" /> Add
                </button>
              </form>

              {/* Current Zones List */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 font-bold text-[11px] uppercase tracking-wider">
                  <span>Current Zones ({availableZones.length})</span>
                </div>

                {availableZones.length === 0 ? (
                  <div className="p-8 text-center bg-zinc-50 dark:bg-zinc-950/40 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 text-zinc-400 font-medium">
                    No zones added yet. Type a name above to add your first zone.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {availableZones.map(zone => {
                      const count = issues.filter(i => i.zone === zone).length;
                      return (
                        <div
                          key={zone}
                          className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800/80 group hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-2 h-2 rounded-full bg-indigo-500" />
                            <span className="font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                              {zone}
                            </span>
                            {count > 0 && (
                              <span className="px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-[10px] font-semibold">
                                {count} {count === 1 ? 'issue' : 'issues'}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteZone(zone)}
                            title={`Remove Zone ${zone}`}
                            className="p-1.5 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition-all"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 flex justify-end">
              <button
                type="button"
                onClick={() => setShowManageZonesModal(false)}
                className="px-5 py-2.5 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BatteryIssuesPage;
