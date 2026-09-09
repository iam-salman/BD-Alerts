import React, { useState, useEffect, useMemo } from 'react';
import { 
  SignalSlashIcon, 
  MapPinIcon, 
  ExclamationTriangleIcon, 
  ArrowPathIcon, 
  AdjustmentsHorizontalIcon, 
  UserGroupIcon, 
  MagnifyingGlassIcon, 
  CheckCircleIcon, 
  EyeIcon, 
  EyeSlashIcon, 
  GlobeAltIcon,
  XMarkIcon,
  TableCellsIcon,
  SignalIcon,
  PhoneIcon,
  TrashIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import { KazamBattery, Station } from '../types';
import CustomSelect from '@/components/CustomSelect';
import { collection, onSnapshot, Firestore, deleteDoc, doc, addDoc } from "firebase/firestore";
import { useBatteryData } from '@/hooks/useBatteryData';
import SortableHeader from '@/components/SortableHeader';
import PaginationFooter from '@/components/PaginationFooter';
import CopyButton from '@/components/CopyButton';
import MapModal from '@/components/MapModal';

const getDistanceFromLatLonInMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const parseBatteryDate = (input: any): Date => {
  if (!input) return new Date();
  if (typeof input === 'number') return new Date(input > 100000000000 ? input : input * 1000);
  return new Date(input);
};

const getBatteryDateAndTime = (ts: any): { dateStr: string; timeStr: string } => {
  if (!ts) return { dateStr: "--", timeStr: "--" };
  const d = parseBatteryDate(ts);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const date = d.getDate();
  const dateStr = `${date}/${month}/${year}`;
  
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const seconds = d.getSeconds().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const timeStr = `${hours}:${minutes}:${seconds} ${ampm}`;
  
  return { dateStr, timeStr };
};

const getBatteryStatus = (bat: any): string => {
  const isInactive = !bat.dealer_name || bat.dealer_name.trim() === '';
  if (bat.status === 3) return 'Error';
  if (isInactive && !bat.driverData) return 'Inactive';
  if (bat.charge_state === 1) return 'Charging'; 
  if (bat.status === 4) return 'Low SoC';
  if (bat.driverData) return 'Assigned';
  return 'Available';
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Available': return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/50';
    case 'Charging': return 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 border-blue-100 dark:border-blue-900/50';
    case 'Assigned': return 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/50';
    case 'Error': return 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border-red-100 dark:border-red-900/50';
    case 'Low SoC': return 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400 border-orange-100 dark:border-orange-900/50';
    case 'Inactive': return 'bg-zinc-150 text-zinc-650 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800';
    default: return 'bg-zinc-50 text-zinc-500 border-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-800';
  }
};

interface GeofenceZone {
  id: string;
  name: string;
  center: { lat: number; lng: number };
  radius: number;
  stationIds: string[];
  createdAt: string;
}

const GhostBatteriesPage: React.FC<{ isDarkMode: boolean; db: Firestore }> = ({ isDarkMode, db }) => {
  const { getAllBatteries, getAllDealers } = useBatteryData();
  const [batteries, setBatteries] = useState<KazamBattery[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'zone' | 'ghost' | 'mismatch'>('zone');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [geoFenceThreshold, setGeoFenceThreshold] = useState(500);
  const [mismatchThreshold, setMismatchThreshold] = useState(300);
  const [showOffline, setShowOffline] = useState(false); // Legacy - will replace with statusFilter
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [showZeroCoordinates, setShowZeroCoordinates] = useState(false);
  const [geofenceZones, setGeofenceZones] = useState<GeofenceZone[]>([]);
  const [showGeofenceModal, setShowGeofenceModal] = useState(false);
  const [newZone, setNewZone] = useState({ name: '', lat: '', lng: '', radius: 2000 });
  const [selectedStationsForZone, setSelectedStationsForZone] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('bd_ops_resolved_ghosts');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch (e) { return new Set(); }
  });

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorBatteryId, setErrorBatteryId] = useState('');
  const [errorMainType, setErrorMainType] = useState('Geofence / Zone Violation');
  const [errorDescription, setErrorDescription] = useState('');
  const [submittingError, setSubmittingError] = useState(false);

  // Map Modal State for Leaflet battery/station geofence overlays
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [mapCoordinates, setMapCoordinates] = useState<[number, number] | null>(null);
  const [mapTitle, setMapTitle] = useState("");
  const [mapSubtitle, setMapSubtitle] = useState("");
  const [mapStationCoordinates, setMapStationCoordinates] = useState<[number, number] | null>(null);
  const [mapStationName, setMapStationName] = useState("");
  const [mapGeofenceRadius, setMapGeofenceRadius] = useState<number>(200);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const handleOpenMarkError = (batteryId: string, defaultType: string, defaultComment: string) => {
    setErrorBatteryId(batteryId);
    setErrorMainType(defaultType);
    setErrorDescription(defaultComment);
    setErrorModalOpen(true);
  };

  const handleSubmitMarkError = async () => {
    if (!errorBatteryId || !errorMainType) {
      showToast("Please make sure Battery ID and Issue Type are filled", "error");
      return;
    }
    setSubmittingError(true);
    try {
      await addDoc(collection(db, "battery_issues"), {
        batteryId: errorBatteryId,
        mainDescription: errorMainType,
        subDescription: errorDescription || `Issue reported from Ghost Assets Page`,
        issueType: errorMainType,
        description: errorDescription || `Issue reported from Ghost Assets Page`,
        status: "Pending",
        raisedBy: "system_ghost_detection@bd-ops.com",
        raisedByName: "Ghost Asset Module",
        raisedByRole: "ADMIN",
        createdAt: new Date().toISOString(),
        occurrenceCount: 1,
        occurrenceDates: [new Date().toISOString()],
        lastOccurrenceAt: new Date().toISOString(),
        currentLocationContext: "Ghost Assets & Anomalies Page"
      });
      setErrorModalOpen(false);
      setErrorBatteryId('');
      setErrorDescription('');
      showToast(`Battery ${errorBatteryId} has been successfully marked to error!`);
    } catch (err: any) {
      console.error(err);
      showToast("Failed to submit issue ticket. Please try again.", "error");
    } finally {
      setSubmittingError(false);
    }
  };

  const fetchData = async () => {
    setIsRefetching(true);
    try {
      const [batData, stnData] = await Promise.all([getAllBatteries(), getAllDealers()]);
      if (batData) setBatteries(batData);
      if (stnData) setStations(stnData);
    } catch (err) { console.error(err); } finally { setLoading(false); setIsRefetching(false); }
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    const unsubZones = onSnapshot(collection(db, "geofence_zones"), (snap) => {
      setGeofenceZones(snap.docs.map(d => ({ id: d.id, ...d.data() } as GeofenceZone)));
    });
    return () => unsubZones();
  }, [db]);

  const handleResolve = (id: string) => {
    const newSet = new Set(resolvedIds);
    newSet.add(id);
    setResolvedIds(newSet);
    localStorage.setItem('bd_ops_resolved_ghosts', JSON.stringify(Array.from(newSet)));
  };

  const isOnline = (bat: any) => {
    const ts = bat?.last_updated_on;
    if (!ts) return false;
    const lastUpdatedMs = typeof ts === "number" ? (ts > 100000000000 ? ts : ts * 1000) : new Date(ts).getTime();
    return Date.now() - lastUpdatedMs < 300000;
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const processedData = useMemo(() => {
    if (!batteries.length) return { zones: [], ghosts: [], mismatches: [] };

    // 1. Zone Violations
    const stationIdToZones = new Map<string, GeofenceZone[]>();
    geofenceZones.forEach(z => (z.stationIds || []).forEach(sid => {
      // Index by station ID
      if (!stationIdToZones.has(sid)) stationIdToZones.set(sid, []);
      stationIdToZones.get(sid)!.push(z);
      
      // Also index by dealer_id if we can find it in the stations list
      const matchedStation = stations.find(s => s.id === sid || s.dealer_id === sid);
      if (matchedStation?.dealer_id && matchedStation.dealer_id !== sid) {
        if (!stationIdToZones.has(matchedStation.dealer_id)) stationIdToZones.set(matchedStation.dealer_id, []);
        stationIdToZones.get(matchedStation.dealer_id)!.push(z);
      }
    }));

    const zoneList: any[] = [];
    batteries.forEach(bat => {
      if (resolvedIds.has(`geozone_${bat.id}`)) return;
      
      const online = isOnline(bat);
      if (statusFilter === 'online' && !online) return;
      if (statusFilter === 'offline' && online) return;

      const hasCoordinates = bat.location?.coordinates && (bat.location.coordinates[0] !== 0 || showZeroCoordinates);
      if (!hasCoordinates) return;

      // Get zones for BOTH dealer_id and any other potential station link
      const zones = [
        ...(stationIdToZones.get(bat.dealer_id || '') || []),
        ...((bat as any).station_id ? stationIdToZones.get((bat as any).station_id) || [] : [])
      ];
      
      // De-duplicate zones
      const uniqueZones = Array.from(new Set(zones.map(z => z.id))).map(id => zones.find(z => z.id === id)!);

      uniqueZones.forEach(zone => {
        const dist = getDistanceFromLatLonInMeters(bat.location!.coordinates![1], bat.location!.coordinates![0], zone.center.lat, zone.center.lng);
        if (dist > zone.radius) {
          zoneList.push({ ...bat, _distance: dist, _zone: zone, _online: online });
        }
      });
    });

    // 2. Ghost Assets
    const ghostList = batteries.filter(bat => {
      if (resolvedIds.has(bat.id)) return false;

      const online = isOnline(bat);
      if (statusFilter === 'online' && !online) return false;
      if (statusFilter === 'offline' && online) return false;

      if (!showZeroCoordinates && bat.location?.coordinates?.[0] === 0) return false;
      if (bat.driver_id || !bat.dealer_name) return false;
      const station = stations.find(s => s.name === bat.dealer_name || s.dealer_id === bat.dealer_id);
      if (!station?.location || !bat.location?.coordinates) return false;
      const dist = getDistanceFromLatLonInMeters(bat.location.coordinates[1], bat.location.coordinates[0], station.location[0], station.location[1]);
      (bat as any)._distance = dist;
      (bat as any)._station = station;
      return dist > geoFenceThreshold;
    });

    // 3. Driver Mismatches
    const driverGroups: Record<string, KazamBattery[]> = {};
    batteries.forEach(bat => {
      const online = isOnline(bat);
      if (statusFilter === 'online' && !online) return;
      if (statusFilter === 'offline' && online) return;

      const key = bat.driver_id;
      if (key) {
        if (!driverGroups[key]) driverGroups[key] = [];
        driverGroups[key].push(bat);
      }
    });

    const mismatchList: any[] = [];
    Object.entries(driverGroups).forEach(([driverId, bats]) => {
      if (bats.length < 2) return;
      bats.sort((a, b) => a.id.localeCompare(b.id));
      const b1 = bats[0], b2 = bats[1];
      const mismatchId = `mismatch_${b1.id}_${b2.id}`;
      if (resolvedIds.has(mismatchId)) return;
      if (b1.location?.coordinates && b2.location?.coordinates) {
        const d = getDistanceFromLatLonInMeters(b1.location.coordinates[1], b1.location.coordinates[0], b2.location.coordinates[1], b2.location.coordinates[0]);
        if (d > mismatchThreshold) {
          mismatchList.push({ 
            id: mismatchId, 
            driverName: b1.driverData?.name || "Unknown", 
            driverId: driverId,
            phone: b1.driverData?.phone || "--",
            batteryA: b1, 
            batteryB: b2, 
            _distance: d 
          });
        }
      }
    });

    return { zones: zoneList, ghosts: ghostList, mismatches: mismatchList };
  }, [batteries, stations, geofenceZones, resolvedIds, geoFenceThreshold, mismatchThreshold, statusFilter, showZeroCoordinates]);

  const handleExport = () => {
    const dataToExport = currentList;
    if (dataToExport.length === 0) return;

    let headers: string[] = [];
    let rows: string[][] = [];

    const formatDate = (ts: any) => {
      if (!ts) return "--";
      return parseBatteryDate(ts).toLocaleString();
    };

    // Invisible tab prefix to force Excel to treat as text
    const forceText = (val: string | number) => `\t${val || ''}`;

    if (activeTab === 'zone') {
      headers = ['Battery ID', 'IoT ID', 'SOC', 'Zone', 'Violation Distance (m)', 'Driver ID', 'Driver Name', 'Phone Number', 'Lat', 'Lng', 'Last Updated'];
      rows = dataToExport.map((item: any) => [
        item.id,
        forceText(item.iot_id),
        `${item.soc}%`,
        item._zone?.name || 'Unknown',
        item._distance.toFixed(2),
        item.driver_id || 'Unassigned',
        item.driverData?.name || '--',
        item.driverData?.phone || '--',
        item.location.coordinates[1].toString(),
        item.location.coordinates[0].toString(),
        formatDate(item.last_updated_on)
      ]);
    } else if (activeTab === 'ghost') {
      headers = ['Battery ID', 'IoT ID', 'SOC', 'Assigned Station', 'Off-Station Distance (m)', 'Lat', 'Lng', 'Last Updated'];
      rows = dataToExport.map((item: any) => [
        item.id,
        forceText(item.iot_id),
        `${item.soc}%`,
        item.dealer_name || '',
        item._distance.toFixed(2),
        item.location.coordinates[1].toString(),
        item.location.coordinates[0].toString(),
        formatDate(item.last_updated_on)
      ]);
    } else {
      headers = [
        'Driver ID', 'Driver Name', 
        'Battery A', 'IoT A', 'Lat A', 'Lng A', 'Last Updated A',
        'Battery B', 'IoT B', 'Lat B', 'Lng B', 'Last Updated B',
        'Separation (m)'
      ];
      rows = dataToExport.map((item: any) => [
        item.driverId,
        item.driverName,
        item.batteryA.id,
        forceText(item.batteryA.iot_id),
        item.batteryA.location.coordinates[1].toString(),
        item.batteryA.location.coordinates[0].toString(),
        formatDate(item.batteryA.last_updated_on),
        item.batteryB.id,
        forceText(item.batteryB.iot_id),
        item.batteryB.location.coordinates[1].toString(),
        item.batteryB.location.coordinates[0].toString(),
        formatDate(item.batteryB.last_updated_on),
        item._distance.toFixed(2)
      ]);
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell || ''}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `ghost_assets_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveGeofence = async () => {
    if (!newZone.name || !newZone.lat || !newZone.lng || !newZone.radius || selectedStationsForZone.length === 0) {
      alert("Please fill all fields and select stations");
      return;
    }
    try {
      await addDoc(collection(db, "geofence_zones"), {
        name: newZone.name,
        center: { lat: parseFloat(newZone.lat), lng: parseFloat(newZone.lng) },
        radius: newZone.radius,
        stationIds: selectedStationsForZone,
        createdAt: new Date().toISOString()
      });
      setNewZone({ name: '', lat: '', lng: '', radius: 2000 });
      setSelectedStationsForZone([]);
      alert("Geofence zone activated successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to save geofence zone.");
    }
  };

  const currentList = useMemo(() => {
    let list = activeTab === 'zone' ? processedData.zones : activeTab === 'ghost' ? processedData.ghosts : processedData.mismatches;
    
    // Apply Zone Filter across all tabs
    if (zoneFilter !== 'all') {
      const selectedZone = geofenceZones.find(z => z.id === zoneFilter);
      if (selectedZone) {
        const sIds = selectedZone.stationIds || [];
        if (activeTab === 'zone') {
          list = list.filter((item: any) => item._zone?.id === zoneFilter);
        } else if (activeTab === 'ghost') {
          list = list.filter((item: any) => {
            const station = item._station;
            const dealerId = item.dealer_id;
            const stationId = (item as any).station_id;
            if (sIds.includes(dealerId) || sIds.includes(stationId)) return true;
            if (station && (sIds.includes(station.id) || sIds.includes(station.dealer_id))) return true;
            return false;
          });
        } else if (activeTab === 'mismatch') {
          list = list.filter((item: any) => {
            const bA = item.batteryA;
            const bB = item.batteryB;
            
            const bA_station = stations.find(s => s.name === bA.dealer_name || s.dealer_id === bA.dealer_id);
            const bA_matched = (bA_station && (sIds.includes(bA_station.id) || sIds.includes(bA_station.dealer_id))) ||
                               sIds.includes(bA.dealer_id) || sIds.includes((bA as any).station_id);
                               
            const bB_station = stations.find(s => s.name === bB.dealer_name || s.dealer_id === bB.dealer_id);
            const bB_matched = (bB_station && (sIds.includes(bB_station.id) || sIds.includes(bB_station.dealer_id))) ||
                               sIds.includes(bB.dealer_id) || sIds.includes((bB as any).station_id);
                               
            return bA_matched || bB_matched;
          });
        }
      }
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((item: any) => 
        (item.id?.toLowerCase().includes(q)) || (item.driverName?.toLowerCase().includes(q)) || (item.driverId?.toLowerCase().includes(q))
      );
    }
    if (sortConfig) {
      list = [...list].sort((a, b) => {
        const aVal = a[sortConfig.key] ?? '';
        const bVal = b[sortConfig.key] ?? '';
        return sortConfig.direction === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
      });
    }
    return list;
  }, [activeTab, processedData, searchQuery, sortConfig, zoneFilter, geofenceZones, stations]);

  return (
    <div className="relative animate-in fade-in duration-500 pb-24">
      <div className="space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <h2 className="text-3xl font-bold font-heading text-zinc-900 dark:text-white mb-2">Ghost Assets & Anomalies</h2>
            <p className="font-semibold text-zinc-500 dark:text-zinc-400">Theft prevention and asset synchronization.</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={fetchData} 
              disabled={isRefetching} 
              className="flex items-center justify-center gap-2 px-6 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-95 border border-zinc-200 dark:border-zinc-700"
            >
              <ArrowPathIcon className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search Bar - Spans 2 columns on larger screens to match Alert Drivers Page */}
          <div className="lg:col-span-2 relative group">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search ID, Driver..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              className="w-full pl-12 pr-4 py-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/10 dark:text-zinc-100 font-semibold transition-all shadow-sm" 
            />
          </div>

          {/* Network Status Filter - Matching the specific 1.5 rounded container and xl button style */}
          <div className="flex bg-white dark:bg-zinc-900 p-1.5 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
            {(['all', 'online', 'offline'] as const).map((t) => (
              <button 
                key={t} 
                onClick={() => setStatusFilter(t)} 
                className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase transition-all ${
                  statusFilter === t 
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none' 
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Advanced Filters Button - Matching the border-indigo-500/text-indigo-600 active state */}
          <button 
            onClick={() => setShowSettings(!showSettings)} 
            className={`flex items-center justify-center gap-2 px-4 py-4 bg-white dark:bg-zinc-900 border rounded-2xl text-sm font-bold transition-all shadow-sm ${
              showSettings 
                ? 'border-indigo-500 text-indigo-600 bg-indigo-50/30' 
                : 'border-zinc-100 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300'
            }`}
          >
            <AdjustmentsHorizontalIcon className="w-5 h-5" />
            <span>Filters</span>
          </button>
        </div>

        {showSettings && (
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm p-8 animate-in slide-in-from-top-2 duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-6">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2"><AdjustmentsHorizontalIcon className="w-4 h-4" /> Configuration</h4>
                <div className="space-y-8 p-6 bg-zinc-50 dark:bg-zinc-950/40 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <div className="space-y-4">
                    <div className="flex justify-between font-bold text-xs uppercase text-zinc-500"><label>Station Geofence</label><span className="text-indigo-600">{geoFenceThreshold}m</span></div>
                    <input type="range" min="200" max="1500" step="50" value={geoFenceThreshold} onChange={(e) => setGeoFenceThreshold(Number(e.target.value))} className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between font-bold text-xs uppercase text-zinc-500"><label>Driver Mismatch</label><span className="text-indigo-600">{mismatchThreshold}m</span></div>
                    <input type="range" min="100" max="1000" step="50" value={mismatchThreshold} onChange={(e) => setMismatchThreshold(Number(e.target.value))} className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2"><FunnelIcon className="w-4 h-4" /> Advanced Filters</h4>
                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase ml-1">Zone Filter (Breaches Only)</label>
                    <CustomSelect 
                      options={[{ value: 'all', label: 'All Zones' }, ...geofenceZones.map(z => ({ value: z.id, label: z.name }))]} 
                      value={zoneFilter} 
                      onChange={setZoneFilter}
                      className="!rounded-xl !py-4 !text-sm !font-bold"
                    />
                  </div>
                  <button onClick={() => setShowZeroCoordinates(!showZeroCoordinates)} className={`flex items-center justify-center gap-3 p-4 rounded-2xl font-bold text-xs transition-all border ${showZeroCoordinates ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-transparent' : 'bg-white dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700'}`}>
                    <MapPinIcon className="w-4 h-4" />
                    {showZeroCoordinates ? 'Showing 0,0 Coordinates' : 'Hiding 0,0 Coordinates'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-1 overflow-x-auto scrollbar-hide whitespace-nowrap">
          {[
            { id: 'zone', label: 'Zone Violations', icon: GlobeAltIcon, color: 'indigo', count: processedData.zones.length },
            { id: 'ghost', label: 'Ghost Assets', icon: SignalSlashIcon, color: 'red', count: processedData.ghosts.length },
            { id: 'mismatch', label: 'Driver Mismatches', icon: UserGroupIcon, color: 'orange', count: processedData.mismatches.length },
          ].map((tab) => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id as any); setCurrentPage(1); }} className={`flex items-center gap-2 px-5 py-3 rounded-t-xl text-xs font-bold transition-all border-b-2 flex-shrink-0 ${activeTab === tab.id ? `border-${tab.color}-500 text-${tab.color}-600 bg-${tab.color}-50 dark:bg-${tab.color}-900/10 dark:text-${tab.color}-400` : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}><tab.icon className="w-4 h-4" /> {tab.label}<span className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] ${activeTab === tab.id ? 'bg-white/50 dark:bg-white/10' : 'bg-zinc-100 dark:bg-zinc-800'}`}>{tab.count}</span></button>
          ))}
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-950/20">
            <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 uppercase tracking-tight text-sm">
              {activeTab === 'zone' && <><GlobeAltIcon className="w-5 h-5 text-indigo-500" /> Perimeter Breaches</>}
              {activeTab === 'ghost' && <><SignalSlashIcon className="w-5 h-5 text-red-500" /> Off-Station Assets</>}
              {activeTab === 'mismatch' && <><UserGroupIcon className="w-5 h-5 text-orange-500" /> Asset Location Mismatch</>}
            </h3>
            <button onClick={handleExport} className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-zinc-800 text-zinc-500 border border-zinc-200 dark:border-zinc-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-100 transition-all shadow-sm">
              <ArrowDownTrayIcon className="w-4 h-4" /> 
              <span className="hidden lg:inline">Export CSV</span>
            </button>
          </div>

          <div className="overflow-auto scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
            <table className="w-full text-left whitespace-nowrap min-w-[1000px] border-collapse">
              <thead className="bg-zinc-50/95 dark:bg-zinc-900/95 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10 shadow-sm backdrop-blur-sm">
                <tr>
                  {activeTab === 'mismatch' ? (
                    <>
                      <SortableHeader label="Driver" sortKey="driverName" currentSort={sortConfig} onSort={handleSort} />
                      <th className="px-6 py-4 text-[11px] font-bold uppercase text-zinc-500">Asset 1</th>
                      <th className="px-6 py-4 text-[11px] font-bold uppercase text-zinc-500">Asset 2</th>
                      <SortableHeader label="Separation" sortKey="_distance" currentSort={sortConfig} onSort={handleSort} />
                      <th className="px-6 py-4 text-[11px] font-bold uppercase text-zinc-500">Last Update</th>
                    </>
                  ) : activeTab === 'zone' ? (
                    <>
                      <SortableHeader label="Battery / IoT" sortKey="id" currentSort={sortConfig} onSort={handleSort} />
                      <SortableHeader label="SOC" sortKey="soc" currentSort={sortConfig} onSort={handleSort} />
                      <th className="px-6 py-4 text-[11px] font-bold uppercase text-zinc-500">Status</th>
                      <th className="px-6 py-4 text-[11px] font-bold uppercase text-zinc-500">Hub / Zone</th>
                      <SortableHeader label="Distance" sortKey="_distance" currentSort={sortConfig} onSort={handleSort} />
                      <th className="px-6 py-4 text-[11px] font-bold uppercase text-zinc-500">Driver Info</th>
                      <SortableHeader label="Last Update" sortKey="last_updated_on" currentSort={sortConfig} onSort={handleSort} />
                    </>
                  ) : (
                    <>
                      <SortableHeader label="Battery / IoT" sortKey="id" currentSort={sortConfig} onSort={handleSort} />
                      <SortableHeader label="SOC" sortKey="soc" currentSort={sortConfig} onSort={handleSort} />
                      <th className="px-6 py-4 text-[11px] font-bold uppercase text-zinc-500">Status</th>
                      <SortableHeader label="Station" sortKey="dealer_name" currentSort={sortConfig} onSort={handleSort} />
                      <SortableHeader label="Distance" sortKey="_distance" currentSort={sortConfig} onSort={handleSort} />
                      <SortableHeader label="Last Update" sortKey="last_updated_on" currentSort={sortConfig} onSort={handleSort} />
                    </>
                  )}
                  <th className="px-6 py-4 text-right text-[11px] font-bold uppercase text-zinc-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {currentList.length === 0 ? (
                  <tr><td colSpan={10} className="py-24 text-center"><div className="flex flex-col items-center opacity-30"><CheckCircleIcon className="w-16 h-16 text-emerald-500 mb-4" /><p className="text-sm font-bold text-zinc-500">Perimeter Secure. No anomalies detected.</p></div></td></tr>
                ) : (
                  currentList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((item: any, idx: number) => {
                    if (activeTab === 'mismatch') {
                      const b1Online = isOnline(item.batteryA);
                      const b2Online = isOnline(item.batteryB);
                      const dateInfoA = getBatteryDateAndTime(item.batteryA.last_updated_on);
                      const dateInfoB = getBatteryDateAndTime(item.batteryB.last_updated_on);
                      return (
                        <tr key={item.id} className="group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-sm text-zinc-900 dark:text-zinc-200">{item.driverName}</span>
                              <span className="text-[10px] font-bold text-zinc-500">{item.driverId}</span>
                              <span className="text-[10px] font-bold text-zinc-400 mt-1 flex items-center gap-1"><PhoneIcon className="w-3 h-3" /> {item.phone}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">{item.batteryA.id}</span>
                                <CopyButton text={item.batteryA.id} />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-zinc-400">{item.batteryA.iot_id || '--'}</span>
                                {item.batteryA.iot_id && <CopyButton text={item.batteryA.iot_id} />}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs font-bold text-emerald-500">{item.batteryA.soc}% SOC</span>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${getStatusColor(getBatteryStatus(item.batteryA))}`}>{getBatteryStatus(item.batteryA)}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">{item.batteryB.id}</span>
                                <CopyButton text={item.batteryB.id} />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-zinc-400">{item.batteryB.iot_id || '--'}</span>
                                {item.batteryB.iot_id && <CopyButton text={item.batteryB.iot_id} />}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs font-bold text-emerald-500">{item.batteryB.soc}% SOC</span>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${getStatusColor(getBatteryStatus(item.batteryB))}`}>{getBatteryStatus(item.batteryB)}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-red-600 tracking-tight">{(item._distance / 1000).toFixed(2)} km</span>
                              <ExclamationTriangleIcon className="w-4 h-4 text-red-500 animate-pulse" />
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-2.5 text-[11px] text-zinc-650 dark:text-zinc-300">
                              <div>
                                <span className="text-zinc-400 font-extrabold mr-1">A:</span> 
                                <span className="font-bold text-zinc-900 dark:text-zinc-200">{dateInfoA.dateStr}</span>
                                <span className="text-[10px] font-semibold text-zinc-400 ml-1.5 uppercase">{dateInfoA.timeStr}</span>
                              </div>
                              <div>
                                <span className="text-zinc-400 font-extrabold mr-1">B:</span> 
                                <span className="font-bold text-zinc-900 dark:text-zinc-200">{dateInfoB.dateStr}</span>
                                <span className="text-[10px] font-semibold text-zinc-400 ml-1.5 uppercase">{dateInfoB.timeStr}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => {
                                  if (item.batteryA?.location?.coordinates) {
                                    setMapCoordinates(item.batteryA.location.coordinates);
                                    setMapTitle(`Battery Mismatch Map`);
                                    setMapSubtitle(`Battery A: ${item.batteryA.id} • Battery B: ${item.batteryB?.id || "N/A"}`);
                                    if (item.batteryB?.location?.coordinates) {
                                      setMapStationCoordinates([item.batteryB.location.coordinates[1], item.batteryB.location.coordinates[0]]);
                                      setMapStationName("Battery B Position");
                                    } else {
                                      setMapStationCoordinates(null);
                                      setMapStationName("");
                                    }
                                    setMapGeofenceRadius(200);
                                    setIsMapOpen(true);
                                  }
                                }} 
                                className="p-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-indigo-600 rounded-xl transition-all" 
                                title="View Map"
                              >
                                <MapPinIcon className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleOpenMarkError(item.batteryA.id, "Driver Mismatch / Integrity Issue", `Battery ${item.batteryA.id} matches with Battery ${item.batteryB.id} on Driver ID ${item.driverId} but they are separated by ${(item._distance / 1000).toFixed(2)} km.`)}
                                className="p-2 bg-red-50 dark:bg-red-950/30 text-red-600 hover:bg-red-600 hover:text-white rounded-xl transition-all flex items-center gap-1 text-[10px] font-bold"
                                title={`Mark Battery A (${item.batteryA.id}) to Error`}
                              >
                                <ExclamationTriangleIcon className="w-4 h-4" />
                                <span>A</span>
                              </button>
                              <button 
                                onClick={() => handleOpenMarkError(item.batteryB.id, "Driver Mismatch / Integrity Issue", `Battery ${item.batteryB.id} matches with Battery ${item.batteryA.id} on Driver ID ${item.driverId} but they are separated by ${(item._distance / 1000).toFixed(2)} km.`)}
                                className="p-2 bg-red-50 dark:bg-red-950/30 text-red-600 hover:bg-red-600 hover:text-white rounded-xl transition-all flex items-center gap-1 text-[10px] font-bold"
                                title={`Mark Battery B (${item.batteryB.id}) to Error`}
                              >
                                <ExclamationTriangleIcon className="w-4 h-4" />
                                <span>B</span>
                              </button>
                              <button onClick={() => handleResolve(item.id)} className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl transition-all" title="Resolve Mismatch"><CheckCircleIcon className="w-4 h-4" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    // Zone and Ghost Rows
                    const online = isOnline(item);
                    const dateInfo = getBatteryDateAndTime(item.last_updated_on);
                    return (
                      <tr key={item.id} className="group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold px-2 py-0.5 rounded ${online ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' : 'bg-red-100 text-red-700 dark:bg-red-900/30'}`}>{item.id}</span>
                              <CopyButton text={item.id} />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-zinc-400 uppercase">{item.iot_id || '--'}</span>
                              {item.iot_id && <CopyButton text={item.iot_id} />}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3 animate-in fade-in duration-350">
                            <div className="w-16 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden"><div className={`h-full ${item.soc > 20 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${item.soc}%` }} /></div>
                            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{item.soc}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border shadow-sm ${getStatusColor(getBatteryStatus(item))}`}>
                            {getBatteryStatus(item)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-zinc-900 dark:text-white">{activeTab === 'zone' ? item.dealer_name : (item._station?.name || 'Unmapped')}</span>
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{activeTab === 'zone' ? `Zone: ${item._zone.name}` : 'HUB STATION'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4"><span className="text-sm font-black text-red-600 tracking-tight">{(item._distance / 1000).toFixed(2)} km</span></td>
                        {activeTab === 'zone' && (
                          <td className="px-6 py-4">
                             <div className="flex flex-col">
                              {item.driverData ? (
                                <>
                                  <span className="text-xs font-bold text-zinc-900 dark:text-white">{item.driverData.name}</span>
                                  <span className="text-[10px] font-bold text-zinc-400">{item.driver_id}</span>
                                  <span className="text-[10px] font-bold text-zinc-400">{item.driverData.phone}</span>
                                </>
                              ) : (
                                <span className="text-xs font-bold text-zinc-400 italic">Unassigned</span>
                              )}
                            </div>
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-200">
                              {dateInfo.dateStr}
                            </span>
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">
                              {dateInfo.timeStr}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => {
                                if (item.location?.coordinates) {
                                  setMapCoordinates(item.location.coordinates);
                                  setMapTitle(activeTab === 'zone' ? `Zone Violation Map` : `Ghost Asset Map`);
                                  setMapSubtitle(`Battery ID: ${item.id}`);
                                  
                                  if (activeTab === 'zone' && item._zone) {
                                    setMapStationCoordinates([item._zone.center.lat, item._zone.center.lng]);
                                    setMapStationName(item._zone.name || "Assigned Zone");
                                    setMapGeofenceRadius(200);
                                  } else if (activeTab === 'ghost' && item._station) {
                                    setMapStationCoordinates([item._station.location[0], item._station.location[1]]);
                                    setMapStationName(item._station.name || "Assigned Station");
                                    setMapGeofenceRadius(200);
                                  } else {
                                    setMapStationCoordinates(null);
                                    setMapStationName("");
                                    setMapGeofenceRadius(200);
                                  }
                                  setIsMapOpen(true);
                                }
                              }} 
                              className="p-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-indigo-600 rounded-xl transition-all" 
                              title="View Map"
                            >
                              <MapPinIcon className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => {
                                const issueType = activeTab === 'zone' ? 'Geofence / Zone Violation' : 'Off-Station Asset (Ghost)';
                                const distKm = (item._distance / 1000).toFixed(2);
                                const comment = activeTab === 'zone' 
                                  ? `Zone breach reported on Zone Violations tab. Distance: ${distKm} km from zone boundary.`
                                  : `Off-Station anomaly reported on Ghost Assets tab. Distance: ${distKm} km from assigned dealer ${item.dealer_name}.`;
                                handleOpenMarkError(item.id, issueType, comment);
                              }}
                              className="p-2 bg-red-50 dark:bg-red-950/30 text-red-600 hover:bg-red-600 hover:text-white rounded-xl transition-all"
                              title="Mark to Error"
                            >
                              <ExclamationTriangleIcon className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleResolve(activeTab === 'zone' ? `geozone_${item.id}` : item.id)} className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl transition-all" title="Resolve Anomaly"><CheckCircleIcon className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <PaginationFooter currentPage={currentPage} totalPages={Math.ceil(currentList.length / itemsPerPage)} itemsPerPage={itemsPerPage} onPageChange={setCurrentPage} onItemsPerPageChange={(val) => { setItemsPerPage(val); setCurrentPage(1); }} dataLength={currentList.length} />
        </div>
      </div>

      {/* Geofence Modal remains same as your logic */}
      {showGeofenceModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] w-full max-w-4xl h-[85vh] p-8 shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col animate-in zoom-in-95">
            <div className="flex justify-between items-start mb-8">
              <div><h3 className="text-2xl font-bold font-heading text-zinc-900 dark:text-white">Geofence Hub Manager</h3><p className="text-sm font-bold text-zinc-500">Define multi-station perimeters.</p></div>
              <button onClick={() => setShowGeofenceModal(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"><XMarkIcon className="w-6 h-6 text-zinc-400" /></button>
            </div>
            <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Form Section */}
              <div className="bg-zinc-50 dark:bg-zinc-950/40 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 p-8 space-y-6 overflow-y-auto scrollbar-hide">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Zone Config</label>
                  <input 
                    type="text" 
                    placeholder="Zone Name (e.g., North Hub)" 
                    value={newZone.name}
                    onChange={(e) => setNewZone({...newZone, name: e.target.value})}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500/20" 
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <input 
                      type="number" 
                      placeholder="Latitude" 
                      value={newZone.lat}
                      onChange={(e) => setNewZone({...newZone, lat: e.target.value})}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 font-bold text-sm outline-none" 
                    />
                    <input 
                      type="number" 
                      placeholder="Longitude" 
                      value={newZone.lng}
                      onChange={(e) => setNewZone({...newZone, lng: e.target.value})}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 font-bold text-sm outline-none" 
                    />
                  </div>
                  <div className="pt-2 space-y-2">
                    <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase">
                      <span>Radius</span>
                      <span className="text-indigo-600">{(newZone.radius/1000).toFixed(1)} km</span>
                    </div>
                    <input 
                      type="range" 
                      className="w-full accent-indigo-600" 
                      min="500" 
                      max="10000" 
                      step="500"
                      value={newZone.radius}
                      onChange={(e) => setNewZone({...newZone, radius: parseInt(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Link Stations</label>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-2 scrollbar-thin">
                    {stations.map(s => (
                      <label key={s.id} className="flex items-center gap-3 p-3 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl cursor-pointer hover:border-indigo-200 transition-all">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded accent-indigo-600" 
                          checked={selectedStationsForZone.includes(s.id || s.dealer_id)}
                          onChange={(e) => {
                            const id = s.id || s.dealer_id;
                            if (e.target.checked) setSelectedStationsForZone([...selectedStationsForZone, id]);
                            else setSelectedStationsForZone(selectedStationsForZone.filter(x => x !== id));
                          }}
                        />
                        <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{s.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                
                <button 
                  onClick={handleSaveGeofence}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-100 dark:shadow-none hover:bg-indigo-700 transition-all"
                >
                  Activate Perimeter Zone
                </button>
              </div>

              {/* List Section */}
              <div className="space-y-4 flex flex-col overflow-hidden">
                <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest px-2">Active Hubs</label>
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                  {geofenceZones.length === 0 ? (
                    <div className="py-20 text-center opacity-20"><GlobeAltIcon className="w-12 h-12 mx-auto mb-2"/><p className="text-sm font-bold">No zones defined.</p></div>
                  ) : (
                    geofenceZones.map(zone => (
                      <div key={zone.id} className="p-5 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl flex justify-between items-center group transition-all hover:border-indigo-200">
                        <div className="space-y-1">
                          <h5 className="font-bold text-sm text-zinc-900 dark:text-white">{zone.name}</h5>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded uppercase">{(zone.radius/1000).toFixed(1)} km</span>
                            <span className="text-[9px] font-bold text-zinc-400 uppercase">{zone.stationIds?.length || 0} Stations Linked</span>
                          </div>
                        </div>
                        <button onClick={() => deleteDoc(doc(db, "geofence_zones", zone.id))} className="p-2 text-zinc-300 hover:text-red-500 rounded-xl hover:bg-red-50 transition-all">
                          <TrashIcon className="w-5 h-5" />
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

      {/* Mark to Error Modal */}
      {errorModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col space-y-6 animate-in zoom-in-95 duration-350">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold font-heading text-zinc-900 dark:text-white flex items-center gap-2">
                  <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />
                  Mark to Error
                </h3>
                <p className="text-xs font-semibold text-zinc-500 mt-1">Submit an official issue ticket for this battery.</p>
              </div>
              <button onClick={() => setErrorModalOpen(false)} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-all text-zinc-400">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest block mb-2 ml-1">Battery Asset ID</label>
                <input 
                  type="text" 
                  disabled
                  value={errorBatteryId}
                  className="w-full bg-zinc-150 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-750 rounded-xl p-4 font-bold text-sm text-zinc-650 dark:text-zinc-300 outline-none cursor-not-allowed" 
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest block mb-2 ml-1">Issue</label>
                <select 
                  value={errorMainType}
                  onChange={(e) => setErrorMainType(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 font-bold text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500/20"
                >
                  <option value="Select Issue">Select Issue</option>
                  <option value="Geofence / Zone Violation">Geofence / Zone Violation</option>
                  <option value="Off-Station Asset (Ghost)">Off-Station Asset (Ghost)</option>
                  <option value="Driver Mismatch / Integrity Issue">Driver Mismatch / Integrity Issue</option>
                  <option value="GPS / IoT Anomaly">GPS / IoT Anomaly</option>
                  <option value="BMS Malfunction">BMS Malfunction</option>
                  <option value="Other / Physical Damage">Other / Physical Damage</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest block mb-2 ml-1">Additional description</label>
                <textarea 
                  rows={3}
                  placeholder="Provide precise details of the anomaly..."
                  value={errorDescription}
                  onChange={(e) => setErrorDescription(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 font-bold text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500/20"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setErrorModalOpen(false)}
                className="flex-1 py-3.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-350 rounded-2xl font-bold text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleSubmitMarkError}
                disabled={submittingError}
                className="flex-1 py-3.5 bg-red-600 text-white rounded-2xl font-bold text-sm shadow-md shadow-red-100 dark:shadow-none hover:bg-red-700 transition-all disabled:opacity-50"
              >
                {submittingError ? "Submitting..." : "Confirm Error"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Leaflet Map Dialog */}
      <MapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        coordinates={mapCoordinates}
        title={mapTitle}
        subtitle={mapSubtitle}
        stationCoordinates={mapStationCoordinates}
        stationName={mapStationName}
        geofenceRadius={mapGeofenceRadius}
      />

      {/* Toast Alert Banner */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[120] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-xl border animate-in fade-in slide-in-from-bottom-5 duration-300 ${
          toast.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-200 border-emerald-100 dark:border-emerald-800' 
            : 'bg-red-50 dark:bg-red-950/90 text-red-800 dark:text-red-200 border-red-100 dark:border-red-800'
        }`}>
          {toast.type === 'success' ? (
            <CheckCircleIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <ExclamationTriangleIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
          )}
          <span className="text-sm font-bold">{toast.message}</span>
        </div>
      )}
    </div>
  );
};

export default GhostBatteriesPage;