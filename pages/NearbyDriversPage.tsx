
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  PhoneIcon, 
  ChatBubbleOvalLeftEllipsisIcon, 
  ArrowPathIcon,
  MagnifyingGlassIcon,
  Battery50Icon,
  CursorArrowRaysIcon,
  UserIcon,
  GlobeAltIcon,
  ArrowsPointingOutIcon,
  HandRaisedIcon,
  SignalSlashIcon,
  CheckCircleIcon,
  MapPinIcon,
  ArrowUpOnSquareIcon,
  BuildingStorefrontIcon
} from '@heroicons/react/24/outline';
import { KazamBattery, Station } from '../types';
import { useBatteryData } from '../hooks/useBatteryData';
import CustomSelect from '../components/CustomSelect';

// Distance calculation using Haversine formula
function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            // Fixed typo: Math.sin(dLon/2) * Math.sin(dLon/2)
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

const parseBatteryDate = (input: string | number | undefined): Date => { 
  if (!input) return new Date(); 
  if (typeof input === 'number') { 
    if (input === 0) return new Date(); 
    return new Date(input > 100000000000 ? input : input * 1000); 
  } 
  const d = new Date(input); 
  return isNaN(d.getTime()) ? new Date() : d; 
};

const isOnline = (bat: KazamBattery) => { 
  const lastSeen = parseBatteryDate(bat.last_updated_on); 
  const diff = Date.now() - lastSeen.getTime(); 
  return diff < 5 * 60 * 1000; 
};

import { collection, onSnapshot, Firestore } from "firebase/firestore";

interface GeofenceZone {
  id: string;
  name: string;
  center: { lat: number; lng: number };
  radius: number;
  stationIds: string[];
  createdAt: string;
}

const NearbyDriversPage: React.FC<{ isDarkMode: boolean; db?: Firestore }> = ({ isDarkMode, db }) => {
  const [allBatteries, setAllBatteries] = useState<KazamBattery[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [geofenceZones, setGeofenceZones] = useState<GeofenceZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [center, setCenter] = useState<[number, number]>([28.6139, 77.2090]); // Lat, Lng
  const [manualCoords, setManualCoords] = useState({ lat: '28.6139', lng: '77.2090' });
  const [radius, setRadius] = useState(1000); // 1km default
  const [searchQuery, setSearchQuery] = useState('');
  const [mapLoaded, setMapLoaded] = useState(false);

  // Modular proximity anchor controls
  const [anchorSource, setAnchorSource] = useState<'station' | 'battery' | 'coords'>('station');
  const [selectedStationId, setSelectedStationId] = useState<string>('');
  const [showAllStationsOnMap, setShowAllStationsOnMap] = useState(true);
  const [showDriversOnMap, setShowDriversOnMap] = useState(true);
  const [isControlsExpanded, setIsControlsExpanded] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'drivers' | 'stations'>('drivers');
  const [expandedCities, setExpandedCities] = useState<{ [key: string]: boolean }>({});

  const [batterySearchId, setBatterySearchId] = useState('');
  const [batteryScanning, setBatteryScanning] = useState(false);

  const { getAllDealers, getAllBatteries } = useBatteryData();
  
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const stationMarkersRef = useRef<any[]>([]);
  const circleRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);

  const fetchBatteries = async () => {
    setLoading(true);
    try {
      const bats = await getAllBatteries();
      if (bats && bats.length > 0) {
        setAllBatteries(bats);
      }
    } catch (err) {
      console.error("Failed to fetch batteries", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, "geofence_zones"), (snap) => {
      setGeofenceZones(snap.docs.map(d => ({ id: d.id, ...d.data() } as GeofenceZone)));
    });
    return () => unsub();
  }, [db]);

  useEffect(() => {
    fetchBatteries();

    const fetchStations = async () => {
      try {
        const data = await getAllDealers();
        if (data && data.length > 0) {
          setStations(data);
          // Set initial map center to the first station, but do not pre-select selectedStationId
          if (data[0] && data[0].location && data[0].location.length >= 2) {
            const [sLat, sLng] = data[0].location;
            setCenter([sLat, sLng]);
            setManualCoords({ lat: sLat.toFixed(6), lng: sLng.toFixed(6) });
          }
        }
      } catch (err) {
        console.error("Failed to load stations in Proximity map:", err);
      }
    };
    fetchStations();
    
    // Load Leaflet dynamically
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setMapLoaded(true);
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(link)) document.head.removeChild(link);
      if (document.head.contains(script)) document.head.removeChild(script);
    };
  }, [getAllDealers]);

  const nearbyDrivers = useMemo(() => {
    return allBatteries
      .filter(b => b.driverData && b.location?.coordinates && isOnline(b)) // Added isOnline filter
      .map(b => {
        const [lng, lat] = b.location.coordinates;
        const dist = getDistanceInMeters(center[0], center[1], lat, lng);
        return { ...b, distance: dist, lat, lng };
      })
      .filter(b => b.distance <= radius)
      .filter(b => {
          if (!searchQuery) return true;
          const q = searchQuery.trim().toLowerCase();
          return (b.driverData?.name || '').toLowerCase().includes(q) || b.id.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const idA = String(a.driver_id || '').trim();
        const idB = String(b.driver_id || '').trim();
        return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [allBatteries, center, radius, searchQuery]);

  const stationsGroupedByCity = useMemo(() => {
    if (!geofenceZones || geofenceZones.length === 0) {
      // Fallback to grouping by city/district if geofence zones are empty
      const groups: { [key: string]: Station[] } = {};
      stations.forEach(st => {
        const city = st.city ? st.city.trim() : 'Unassigned Zone';
        if (!groups[city]) groups[city] = [];
        groups[city].push(st);
      });
      return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
    }

    // Grouping by Geofence Zones
    const groups: { [key: string]: Station[] } = {};
    
    // Initialize groups for all geofence zones
    geofenceZones.forEach(zone => {
      groups[zone.name] = [];
    });
    
    // Default group for unassigned stations
    const unassignedGroupKey = 'Other Areas';
    groups[unassignedGroupKey] = [];

    stations.forEach(st => {
      let assigned = false;
      geofenceZones.forEach(zone => {
        const sIds = zone.stationIds || [];
        if (sIds.includes(st.id) || sIds.includes(st.dealer_id || '') || (st._id && sIds.includes(st._id))) {
          groups[zone.name].push(st);
          assigned = true;
        }
      });
      if (!assigned) {
        groups[unassignedGroupKey].push(st);
      }
    });

    // Remove empty groups but keep populated ones
    const result = Object.entries(groups).filter(([_, stList]) => stList.length > 0);
    return result.sort((a, b) => {
      if (a[0] === unassignedGroupKey) return 1;
      if (b[0] === unassignedGroupKey) return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [stations, geofenceZones]);

  // 1. Map Initialization and TileLayer adjustment
  useEffect(() => {
    if (!mapLoaded || !(window as any).L) return;
    const L = (window as any).L;

    if (!mapRef.current) {
      mapRef.current = L.map('nearby-map', { 
        zoomControl: false,
        attributionControl: false 
      }).setView(center, 13);
    }

    if (mapRef.current.tileLayerRef) {
      mapRef.current.tileLayerRef.remove();
    }
    
    mapRef.current.tileLayerRef = L.tileLayer(isDarkMode 
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    ).addTo(mapRef.current);

  }, [mapLoaded, isDarkMode]);

  // 2. Synchronize Proximity Circle and Center Marker without recreation
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !(window as any).L) return;
    const L = (window as any).L;

    // Update or Create Circle in-place
    if (!circleRef.current) {
      circleRef.current = L.circle(center, {
        radius: radius,
        color: '#6366f1',
        fillColor: '#6366f1',
        fillOpacity: 0.08,
        weight: 1.5,
        dashArray: '5, 10'
      }).addTo(mapRef.current);
    } else {
      circleRef.current.setLatLng(center);
      circleRef.current.setRadius(radius);
    }

    // Update or Create Origin Marker in-place
    const userIcon = L.divIcon({
      className: 'origin-marker',
      html: `
        <div class="relative w-12 h-12 flex items-center justify-center">
          <div class="absolute inset-0 bg-indigo-500 rounded-full animate-ping opacity-20"></div>
          <div class="absolute inset-2 bg-indigo-500/20 rounded-full blur-sm"></div>
          <div class="w-5 h-5 bg-indigo-600 rounded-full border-2 border-white shadow-xl flex items-center justify-center text-white">
             <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
          </div>
        </div>`,
      iconSize: [48, 48],
      iconAnchor: [24, 24]
    });

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker(center, { icon: userIcon, draggable: true }).addTo(mapRef.current);
      userMarkerRef.current.on('dragend', (e: any) => {
        const { lat, lng } = e.target.getLatLng();
        setCenter([lat, lng]);
        setManualCoords({ lat: lat.toFixed(6), lng: lng.toFixed(6) });
        setSelectedStationId('');
      });
    } else {
      userMarkerRef.current.setLatLng(center);
    }

  }, [mapLoaded, center, radius]);

  // 3. Update Driver Markers when list of nearby drivers changes
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !(window as any).L) return;
    const L = (window as any).L;

    // Clear old driver markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Add new driver markers if enabled
    if (showDriversOnMap) {
      nearbyDrivers.forEach(driver => {
        const markerIcon = L.divIcon({
          className: 'driver-marker',
          html: `
            <div class="relative flex flex-col items-center group cursor-pointer">
              <div class="px-2 py-1 bg-zinc-900 text-white rounded-lg text-[9px] font-bold mb-1 opacity-100 transition-opacity whitespace-nowrap shadow-xl">
                 ${driver.driverData!.name}
              </div>
              <div class="w-10 h-10 bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl flex items-center justify-center border-2 ${driver.soc < 20 ? 'border-red-500' : 'border-indigo-500'} transition-transform group-hover:scale-110">
                <div class="flex flex-col items-center justify-center leading-none">
                  <span class="text-[10px] font-bold ${driver.soc < 20 ? 'text-red-500' : 'text-zinc-900 dark:text-zinc-100'}">${driver.soc}%</span>
                  <div class="w-5 h-1 bg-zinc-100 dark:bg-zinc-700 rounded-full mt-0.5 overflow-hidden">
                     <div class="h-full ${driver.soc < 20 ? 'bg-red-500' : 'bg-emerald-500'}" style="width: ${driver.soc}%"></div>
                  </div>
                </div>
              </div>
            </div>
          `,
          iconSize: [40, 60],
          iconAnchor: [20, 45]
        });
        const m = L.marker([driver.lat, driver.lng], { icon: markerIcon })
          .on('click', () => focusOnDriver(driver.lat, driver.lng))
          .addTo(mapRef.current);
        markersRef.current.push(m);
      });
    }
  }, [mapLoaded, nearbyDrivers, showDriversOnMap]);

  // 4. Update Station Markers when stations list or station toggle changes (Completely decoupled from Scanning Radius)
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !(window as any).L) return;
    const L = (window as any).L;

    // Handle stations markers
    stationMarkersRef.current.forEach(sm => sm.remove());
    stationMarkersRef.current = [];

    if (showAllStationsOnMap) {
      stations.forEach(st => {
        if (st.location && st.location.length >= 2) {
          const [stLat, stLng] = st.location;
          if (stLat === 0 && stLng === 0) return;

          const sMarkerIcon = L.divIcon({
            className: 'station-marker',
            html: `
              <div class="relative flex flex-col items-center group cursor-pointer">
                <div class="px-2 py-0.5 bg-emerald-600 text-white rounded-md text-[8px] font-black uppercase mb-0.5 tracking-wide transition-opacity whitespace-nowrap shadow-md">
                   ${st.name}
                </div>
                <div class="w-7 h-7 bg-emerald-500 rounded-full shadow-lg border-2 border-white flex items-center justify-center text-white transition-all transform hover:scale-110">
                   <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                   </svg>
                </div>
              </div>
            `,
            iconSize: [36, 44],
            iconAnchor: [18, 36]
          });

          const sm = L.marker([stLat, stLng], { icon: sMarkerIcon })
            .on('click', () => {
              setCenter([stLat, stLng]);
              setManualCoords({ lat: stLat.toFixed(6), lng: stLng.toFixed(6) });
              setSelectedStationId(st.id || st._id);
              setAnchorSource('station');
              mapRef.current?.flyTo([stLat, stLng], 15);
            })
            .addTo(mapRef.current);
          
          stationMarkersRef.current.push(sm);
        }
      });
    }
  }, [mapLoaded, stations, showAllStationsOnMap]);

  const handleLocateMe = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newCenter: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setCenter(newCenter);
          setManualCoords({ lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) });
          mapRef.current?.flyTo(newCenter, 15);
        },
        () => alert("Unable to retrieve your location.")
      );
    }
  };

  const handleManualCoordsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(manualCoords.lat);
    const lng = parseFloat(manualCoords.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      const newCenter: [number, number] = [lat, lng];
      setCenter(newCenter);
      mapRef.current?.flyTo(newCenter, 15);
    }
  };

  const handleBatteryProximityScan = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!batterySearchId.trim()) return;
    
    setBatteryScanning(true);
    const found = allBatteries.find(b => b.id.trim().toLowerCase() === batterySearchId.trim().toLowerCase());
    
    if (found && found.location?.coordinates) {
      const [bLng, bLat] = found.location.coordinates;
      setCenter([bLat, bLng]);
      setManualCoords({ lat: bLat.toFixed(6), lng: bLng.toFixed(6) });
      mapRef.current?.flyTo([bLat, bLng], 15);
      setSelectedStationId('');
    } else {
      alert(`Battery ID "${batterySearchId}" was not found or has missing coordinates in our online database.`);
    }
    setBatteryScanning(false);
  };

  const focusOnDriver = (lat: number, lng: number) => {
      mapRef.current?.flyTo([lat, lng], 17);
  };

  return (
    <div className="h-auto lg:h-[calc(100vh-116px)] flex flex-col gap-6 animate-in fade-in duration-500 min-h-0 overflow-hidden">
      <style>{`
        .leaflet-container { border-radius: 2.5rem; background: transparent; }
        .origin-marker { pointer-events: auto !important; }
        #nearby-map {
          perspective: 1000px;
        }
        .realistic-map-container {
          filter: drop-shadow(0 20px 50px rgba(0,0,0,0.1));
          border: 1px solid rgba(0,0,0,0.05);
        }
        .dark .realistic-map-container {
           border: 1px solid rgba(255,255,255,0.05);
        }
      `}</style>

      {/* Realistic Top Control Bar (Battery Lookup Style) */}
      <div className="flex flex-col gap-6 bg-white dark:bg-zinc-900 p-6 md:p-8 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 shadow-sm shrink-0">
        
        {/* Title and Top Level Actions Row */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="space-y-1 bg-transparent">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-200 dark:shadow-none animate-in zoom-in-50 duration-300">
                <GlobeAltIcon className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold font-heading text-zinc-900 dark:text-white">Proximity Hub</h2>
            </div>
          </div>
          
          <div className="flex items-center gap-2.5 self-stretch sm:self-auto shrink-0 justify-end">
            <button 
              onClick={handleLocateMe} 
              className="flex items-center gap-2 px-5 py-3.5 bg-indigo-55 dark:bg-indigo-950/25 text-indigo-600 dark:text-indigo-400 rounded-2xl hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-all font-bold text-xs cursor-pointer shadow-sm active:scale-95 duration-100"
              title="Locate Me"
            >
              <HandRaisedIcon className="w-4 h-4" />
              <span>Locate Me</span>
            </button>
            <button 
              onClick={fetchBatteries} 
              disabled={loading}
              className="p-3.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-2xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all cursor-pointer shadow-sm border border-transparent dark:border-zinc-700 active:scale-95 duration-100"
              title="Refresh Data"
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filters and Context Inputs Grid Row */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-end pt-6 border-t border-zinc-100 dark:border-zinc-800">
          
          {/* Target Mode Tabs Selector (LG: Col span 4) */}
          <div className="sm:col-span-12 lg:col-span-4 space-y-2 relative">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block ml-1">
              Proximity Anchor
            </span>
            <div className="flex bg-zinc-50 dark:bg-zinc-950/40 p-1 rounded-2xl border border-zinc-150 dark:border-zinc-800 h-12 items-center shadow-inner">
              {[
                { id: 'station', label: 'Station' },
                { id: 'battery', label: 'Battery' },
                { id: 'coords', label: 'Coords' }
              ].map(sourceItem => (
                <button
                  key={sourceItem.id}
                  type="button"
                  onClick={() => {
                    setAnchorSource(sourceItem.id as any);
                    if (sourceItem.id !== 'station') setSelectedStationId('');
                  }}
                  className={`flex-1 py-1 px-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer text-center whitespace-nowrap h-full flex items-center justify-center ${anchorSource === sourceItem.id ? 'bg-indigo-600 text-white shadow-md font-black' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-350'}`}
                >
                  {sourceItem.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contextual Input Field (LG: Col span 5 - More room to prevent congestion) */}
          <div className="sm:col-span-12 lg:col-span-5 flex flex-col justify-end w-full">
            {anchorSource === 'station' && (
              <div className="w-full relative">
                <CustomSelect
                  label="Center Station"
                  options={stations.map(st => ({
                    value: st.id || st._id,
                    label: st.name || st.id
                  }))}
                  value={selectedStationId}
                  placeholder="Choose Swapping Station..."
                  searchable={true}
                  onChange={(sId: string) => {
                    setSelectedStationId(sId);
                    if (!sId) return;
                    const selected = stations.find(s => s.id === sId || s._id === sId || s.dealer_id === sId);
                    if (selected && selected.location && selected.location.length >= 2) {
                      const [sLat, sLng] = selected.location;
                      setCenter([sLat, sLng]);
                      setManualCoords({ lat: sLat.toFixed(6), lng: sLng.toFixed(6) });
                      mapRef.current?.flyTo([sLat, sLng], 15);
                    }
                  }}
                />
              </div>
            )}

            {anchorSource === 'battery' && (
              <div className="space-y-2 w-full">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block ml-1">
                  Battery Proximity
                </span>
                <form onSubmit={handleBatteryProximityScan} className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 p-1 px-2 rounded-xl border border-transparent dark:border-zinc-850 shadow-inner h-12 w-full">
                  <Battery50Icon className="w-4 h-4 text-zinc-400 shrink-0 ml-1" />
                  <input
                    type="text"
                    placeholder="Battery ID, e.g. BI26"
                    value={batterySearchId}
                    onChange={(e) => setBatterySearchId(e.target.value)}
                    className="bg-transparent border-none outline-none py-1.5 px-0.5 font-bold text-xs text-zinc-700 dark:text-zinc-200 w-full"
                  />
                  <button
                    type="submit"
                    disabled={batteryScanning}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shadow-sm shrink-0 cursor-pointer h-8 flex items-center justify-center"
                  >
                    {batteryScanning ? '...' : 'Scan'}
                  </button>
                </form>
              </div>
            )}

            {anchorSource === 'coords' && (
              <div className="space-y-2 w-full font-sans">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block ml-1">
                  Coordinates Center
                </span>
                <form 
                  onSubmit={handleManualCoordsSubmit} 
                  className="flex items-center justify-between w-full bg-zinc-50 dark:bg-zinc-900 p-1 px-2 rounded-xl border border-transparent dark:border-zinc-850 shadow-inner h-12"
                >
                  <div className="flex items-center flex-1 min-w-0">
                    <div className="flex px-1 items-center gap-1 flex-1">
                      <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest shrink-0">Lat</span>
                      <input 
                        type="text" 
                        value={manualCoords.lat}
                        onChange={(e) => setManualCoords({...manualCoords, lat: e.target.value})}
                        className="bg-transparent border-none w-full text-xs font-semibold outline-none text-zinc-700 dark:text-zinc-200 p-0"
                      />
                    </div>
                    <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 shrink-0 mx-1"></div>
                    <div className="flex px-1 items-center gap-1 flex-1">
                      <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest shrink-0">Lng</span>
                      <input 
                        type="text" 
                        value={manualCoords.lng}
                        onChange={(e) => setManualCoords({...manualCoords, lng: e.target.value})}
                        className="bg-transparent border-none w-full text-xs font-semibold outline-none text-zinc-700 dark:text-zinc-200 p-0"
                      />
                    </div>
                  </div>
                  <button 
                    type="submit" 
                    className="flex items-center justify-center w-8 h-8 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90 transition-all shrink-0 cursor-pointer"
                  >
                    <CursorArrowRaysIcon className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            )}
          </div>



          {/* Search/Filter Drivers Field (LG: Col span 3 - Plentiful breathing room) */}
          <div className="sm:col-span-12 lg:col-span-3 space-y-2 w-full">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block ml-1">
              Filter List
            </span>
            <div className="relative group w-full">
              <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Search list..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-900 border border-transparent dark:border-zinc-800 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm h-12"
              />
            </div>
          </div>

        </div>
      </div>

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col lg:flex-row gap-8 min-h-0 overflow-hidden">
        
        {/* Map Side */}
        <div className="flex-1 relative realistic-map-container overflow-hidden rounded-[2.5rem] bg-zinc-100 dark:bg-zinc-950 min-h-[400px] lg:h-full">
          <div id="nearby-map" className="absolute inset-0 z-0"></div>
          
          {/* Interactive Floating Indicators */}
          {!isControlsExpanded ? (
            <button
              type="button"
              onClick={() => setIsControlsExpanded(true)}
              className="absolute top-6 left-6 z-10 flex items-center justify-center w-11 h-11 rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-100/80 dark:border-zinc-800/80 shadow-2xl text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer hover:scale-105 transition-all animate-in fade-in duration-200"
              title="Expand Map Controls"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
              </svg>
            </button>
          ) : (
            <div className="absolute top-6 left-6 z-10 flex flex-col gap-2.5 p-3.5 rounded-[1.25rem] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-100/80 dark:border-zinc-800/80 shadow-2xl w-48 font-sans select-none animate-in fade-in duration-200">
               <div className="flex items-center justify-between">
                  <div className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest ml-0.5">Map Controls</div>
                  <button 
                    onClick={() => setIsControlsExpanded(false)}
                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
                    title="Collapse Controls"
                  >
                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.3} stroke="currentColor" className="w-3.5 h-3.5">
                       <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                     </svg>
                  </button>
               </div>
               
               <button
                  type="button"
                  className={`flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-xl border text-left transition-all cursor-pointer ${showDriversOnMap ? 'bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border-indigo-200/50 dark:border-indigo-900/40' : 'bg-transparent text-zinc-400 dark:text-zinc-500 border-zinc-105 dark:border-zinc-800/60'}`}
                  onClick={() => setShowDriversOnMap(!showDriversOnMap)}
                  title="Toggle Live Drivers"
               >
                  <div className="flex items-center gap-1.5 min-w-0">
                     <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${showDriversOnMap ? 'bg-indigo-500 animate-pulse' : 'bg-zinc-300 dark:bg-zinc-700'}`}></div>
                     <span className="text-[9px] font-extrabold uppercase tracking-wide truncate">Drivers</span>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-wider bg-white/80 dark:bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-100 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 shrink-0">{nearbyDrivers.length}</span>
               </button>

               <button
                  type="button"
                  className={`flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-xl border text-left transition-all cursor-pointer ${showAllStationsOnMap ? 'bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-900/40' : 'bg-transparent text-zinc-400 dark:text-zinc-500 border-zinc-105 dark:border-zinc-800/60'}`}
                  onClick={() => setShowAllStationsOnMap(!showAllStationsOnMap)}
                  title="Toggle Stations"
               >
                  <div className="flex items-center gap-1.5 min-w-0">
                     <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${showAllStationsOnMap ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-300 dark:bg-zinc-700'}`}></div>
                     <span className="text-[9px] font-extrabold uppercase tracking-wide truncate">Stations</span>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-wider bg-white/80 dark:bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-100 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 shrink-0">{stations.length}</span>
               </button>

               <div className="h-px bg-zinc-150/80 dark:bg-zinc-800/80 my-0.5"></div>
               
               <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest ml-0.5">Scanning Radius</span>
                  <div className="flex bg-zinc-50 dark:bg-zinc-950 p-0.5 rounded-xl border border-zinc-150 dark:border-zinc-800/80 uppercase">
                    {[
                      { key: 1000, label: '1K' },
                      { key: 3000, label: '3K' },
                      { key: 5000, label: '5K' },
                      { key: 10000, label: '10K' },
                    ].map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        className={`flex-1 py-1 rounded-lg text-[8px] text-center transition-all cursor-pointer ${radius === opt.key ? 'bg-indigo-600 text-white shadow-sm font-black' : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 font-bold'}`}
                        onClick={() => setRadius(opt.key)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
               </div>
            </div>
          )}

          {/* Map Compass/Instruction */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md px-6 py-2 rounded-full border border-zinc-100 dark:border-zinc-800 shadow-2xl flex items-center gap-4">
             <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase">Origin Point (Drag to Move)</span>
             </div>
          </div>
        </div>

        {/* List Side Panel */}
        <div className="w-full lg:w-[420px] flex flex-col bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 overflow-hidden shadow-sm shrink-0 h-[600px] lg:h-full max-h-[85vh] lg:max-h-none">
           
           {/* Twin Sidebar Tabs */}
           <div className="flex border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/20 dark:bg-zinc-950/10 p-2 gap-2">
             <button
               onClick={() => setSidebarTab('drivers')}
               className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${sidebarTab === 'drivers' ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'}`}
             >
               Nearby Drivers ({nearbyDrivers.length})
             </button>
             <button
               onClick={() => setSidebarTab('stations')}
               className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${sidebarTab === 'stations' ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'}`}
             >
               Stations Hub ({stations.length})
             </button>
           </div>

           {sidebarTab === 'drivers' ? (
             <>
               <div className="p-6 border-b border-zinc-50 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-950/20 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-base text-zinc-900 dark:text-white">Scanning Scope</h3>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">{nearbyDrivers.length} online in {radius/1000}km range</p>
                  </div>
                  <div className="flex flex-col items-end">
                     <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-full animate-pulse">LIVE TRACK</span>
                  </div>
               </div>

               <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
                  {nearbyDrivers.length === 0 ? (
                    <div className="py-24 text-center flex flex-col items-center justify-center opacity-40 px-10">
                       <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-6">
                          <SignalSlashIcon className="w-10 h-10 text-zinc-300" />
                       </div>
                       <p className="text-sm font-bold text-zinc-600 dark:text-zinc-400 leading-relaxed">No active drivers identified in this vicinity. Try expanding the scanning radius in the Map Controls.</p>
                       <button onClick={() => setRadius(r => r === 1000 ? 3000 : r === 3000 ? 5000 : 10000)} className="mt-6 text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-2 cursor-pointer">
                          <ArrowsPointingOutIcon className="w-4 h-4" /> Expand Radius
                       </button>
                    </div>
                  ) : (
                    nearbyDrivers.map(driver => (
                      <div 
                        key={driver.id} 
                        onClick={() => focusOnDriver(driver.lat, driver.lng)}
                        className="p-5 rounded-3xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50/50 dark:hover:bg-zinc-850 transition-all cursor-pointer group relative overflow-hidden"
                      >
                        <div className="flex justify-between items-start relative z-10">
                           <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 border border-indigo-100 dark:border-indigo-800 transition-transform group-hover:scale-105">
                                 <UserIcon className="w-6 h-6" />
                              </div>
                              <div className="min-w-0 font-sans">
                                 <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate pr-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors uppercase">{driver.driverData!.name}</h4>
                                 <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter mt-0.5">{driver.driver_id}</p>
                              </div>
                           </div>
                           <div className="text-right font-sans">
                              <p className="text-[11px] font-black text-indigo-600 dark:text-indigo-400">
                                 {driver.distance < 1000 ? `${Math.round(driver.distance)}m` : `${(driver.distance/1000).toFixed(2)}km`}
                              </p>
                              <div className="flex items-center justify-end gap-1.5 mt-1">
                                 <Battery50Icon className={`w-3.5 h-3.5 ${driver.soc < 20 ? 'text-red-500 animate-pulse' : 'text-emerald-500'}`} />
                                 <span className={`text-xs font-bold ${driver.soc < 20 ? 'text-red-500' : 'text-zinc-700 dark:text-zinc-300'}`}>{driver.soc}%</span>
                              </div>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-zinc-100/60 dark:border-zinc-800/65 relative z-10">
                           <button 
                             onClick={(e) => { e.stopPropagation(); window.open(`tel:${driver.driverData!.phone}`); }}
                             className="flex items-center justify-center gap-2 py-2 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-300 border border-zinc-150 dark:border-zinc-700/80 rounded-2xl text-[10px] font-bold hover:bg-zinc-100 dark:hover:bg-zinc-750 transition-all cursor-pointer shadow-sm active:scale-95 duration-100"
                           >
                              <PhoneIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" /> Voice Call
                           </button>
                           <button 
                             onClick={async (e) => { 
                               e.stopPropagation(); 
                               const msg = `Hello ${driver.driverData!.name}, we are checking your battery status.`;
                               if (navigator.share) {
                                 try {
                                   await navigator.share({
                                     title: 'Driver Contact',
                                     text: msg,
                                   });
                                 } catch (err) {
                                   console.error("Error sharing:", err);
                                 }
                               } else {
                                 window.open(`https://wa.me/${driver.driverData!.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                               }
                             }}
                             className="flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded-2xl text-[10px] font-bold hover:bg-indigo-700 transition-all shadow-md active:scale-95 duration-100 cursor-pointer"
                           >
                              <ArrowUpOnSquareIcon className="w-3.5 h-3.5 shrink-0" /> Share
                           </button>
                        </div>
                      </div>
                    ))
                  )}
               </div>
             </>
           ) : (
             <>
               <div className="p-6 border-b border-zinc-50 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-950/20 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-base text-zinc-900 dark:text-white">Zone-Wise Stations</h3>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">Click station to scan its vicinity</p>
                  </div>
                  <div className="flex flex-col items-end">
                     <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 px-2.5 py-1 rounded-full">GEOLOCATED</span>
                  </div>
               </div>

               <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
                  {stationsGroupedByCity.length === 0 ? (
                    <div className="py-24 text-center text-zinc-400 max-w-xs mx-auto text-xs leading-relaxed">
                      Loading stations telemetry... Make sure swap station database is synchronized.
                    </div>
                  ) : (
                    stationsGroupedByCity.map(([city, stList]) => {
                      const isExpanded = !!expandedCities[city];
                      return (
                        <div key={city} className="border border-zinc-100 dark:border-zinc-800 rounded-2xl overflow-hidden bg-zinc-50/10 dark:bg-zinc-950/5">
                          <button
                            type="button"
                            onClick={() => setExpandedCities(prev => ({ ...prev, [city]: !isExpanded }))}
                            className="w-full flex justify-between items-center p-4 font-black text-[10px] uppercase tracking-wider text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/40 dark:hover:bg-zinc-805/10 transition-all text-left cursor-pointer"
                          >
                            <span className="flex items-center gap-2 font-black">
                              <MapPinIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                              {city}
                            </span>
                            <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[9px] px-2.5 py-0.5 rounded-full font-black font-mono">
                              {stList.length} Station{stList.length !== 1 ? 's' : ''}
                            </span>
                          </button>
                          
                          {isExpanded && (
                            <div className="p-2 space-y-1.5 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800/60 font-sans">
                              {stList.map(st => {
                                const isActive = st.active !== false;
                                return (
                                  <div
                                    key={st.id || st._id}
                                    onClick={() => {
                                      if (st.location && st.location.length >= 2) {
                                        const [lat, lng] = st.location;
                                        setCenter([lat, lng]);
                                        setManualCoords({ lat: lat.toFixed(6), lng: lng.toFixed(6) });
                                        setSelectedStationId(st.id || st._id);
                                        setAnchorSource('station');
                                        mapRef.current?.flyTo([lat, lng], 15);
                                        setSidebarTab('drivers'); // Teleport back to drivers tab!
                                      }
                                    }}
                                    className="p-3 rounded-xl border border-zinc-50 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-zinc-805 hover:border-indigo-150/50 cursor-pointer transition-all flex justify-between items-center group/item"
                                  >
                                    <div className="min-w-0 pr-2">
                                      <h5 className="font-bold text-xs text-zinc-800 dark:text-zinc-200 group-hover/item:text-indigo-600 dark:group-hover/item:text-indigo-400 transition-colors truncate">
                                        {st.name}
                                      </h5>
                                      <p className="text-[9px] text-zinc-400 font-bold font-mono mt-0.5">ID: {st.dealer_id || st.id}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-red-400'}`}></span>
                                      <span className="text-[9px] font-black uppercase text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 px-1.5 py-0.5 rounded font-mono">
                                        {st.total_battries || 0} Bats
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
               </div>
             </>
           )}

           {/* Status Bar */}
           <div className="p-6 bg-zinc-50 dark:bg-zinc-950/50 border-t border-zinc-100 dark:border-zinc-800 shrink-0">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                       <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div>
                       <span className="text-[9px] font-black text-zinc-500 uppercase">Focal Origin</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                       <span className="text-[9px] font-black text-zinc-500 uppercase">Swapping Hub</span>
                    </div>
                 </div>
                 <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-[9px] font-black text-zinc-400 uppercase">Synced</span>
                 </div>
              </div>
           </div>
        </div>

      </div>
    </div>
  );
};

export default NearbyDriversPage;
