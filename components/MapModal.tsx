import React, { useEffect, useState, useRef } from 'react';
import { X, MapPin, AlertTriangle } from 'lucide-react';

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  coordinates?: [number, number]; // [lng, lat] GeoJSON format
  title: string;
  subtitle?: string;
  stationCoordinates?: [number, number]; // [lat, lng] format (from stations)
  stationName?: string;
  geofenceRadius?: number; // Geofence radius in meters, default 200m
}

const MapModal: React.FC<MapModalProps> = ({ 
  isOpen, 
  onClose, 
  coordinates, 
  title, 
  subtitle,
  stationCoordinates,
  stationName,
  geofenceRadius = 200
}) => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef<any>(null);
  const mountRef = useRef<HTMLDivElement>(null);

  // Check if we have valid coordinates
  const hasCoords = 
    coordinates && 
    coordinates.length === 2 && 
    !(coordinates[0] === 0 && coordinates[1] === 0) &&
    !isNaN(coordinates[0]) && 
    !isNaN(coordinates[1]);

  // Load Leaflet dynamically on open
  useEffect(() => {
    if (!isOpen || !hasCoords) return;

    // Direct check if Leaflet is already loaded on window
    if ((window as any).L) {
      setMapLoaded(true);
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setMapLoaded(true);
    document.head.appendChild(script);

    return () => {
      // We don't remove L from window so other views can reuse it, but we can clean up if needed
    };
  }, [isOpen, hasCoords]);

  // Initialize and update Map instance
  useEffect(() => {
    if (!isOpen || !mapLoaded || !hasCoords || !mountRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    const [lng, lat] = coordinates!;
    const hasStationNode = stationCoordinates && stationCoordinates.length === 2 && !(stationCoordinates[0] === 0 && stationCoordinates[1] === 0);

    // Clean up previous map instance to prevent "Map container is already initialized" error
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    try {
      // Check dark mode
      const isDarkMode = document.documentElement.classList.contains('dark');

      // Create map
      mapRef.current = L.map(mountRef.current, {
        zoomControl: true,
        attributionControl: false
      }).setView([lat, lng], 15);

      // Choose tile layers
      const tileUrl = isDarkMode
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

      L.tileLayer(tileUrl, {
        maxZoom: 19
      }).addTo(mapRef.current);

      // Create an elegant styled battery marker icon using inline SVG
      const batteryCustomIcon = L.divIcon({
        html: `<div class="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600 border-4 border-white shadow-lg animate-bounce duration-1000" title="Battery Location"><svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" class="w-4 h-4 text-white"><path d="M17 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2m-1 10H8V7h8v8M14 3h-4v2h4V3z"/></svg></div>`,
        className: 'custom-leaflet-marker-battery',
        iconSize: [32, 32],
        iconAnchor: [16, 32]
      });

      L.marker([lat, lng], { icon: batteryCustomIcon }).addTo(mapRef.current)
        .bindPopup(`<b>Battery Location</b><br/>Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`);

      if (hasStationNode) {
        const [stationLat, stationLng] = stationCoordinates!;
        
        // Custom elegant station icon using Home/Dock SVG
        const stationCustomIcon = L.divIcon({
          html: `<div class="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-600 border-4 border-white shadow-lg" title="Station Location"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="white" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 0 1 3.75-2.898l6.75 2.25A3 3 0 0 1 18 11.601V21M4.5 9.35h13.5" /></svg></div>`,
          className: 'custom-leaflet-marker-station',
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        });

        // Add station marker
        L.marker([stationLat, stationLng], { icon: stationCustomIcon }).addTo(mapRef.current)
          .bindPopup(`<b>${stationName || 'Assigned Hub/Station'}</b><br/>Lat: ${stationLat.toFixed(6)}, Lng: ${stationLng.toFixed(6)}`);

        // Add Geofence circle
        L.circle([stationLat, stationLng], {
          color: '#10b981', // emerald-500
          fillColor: '#10b981',
          fillOpacity: 0.15,
          radius: geofenceRadius
        }).addTo(mapRef.current);

        // Fit bounds to fit both battery and station
        const bounds = L.latLngBounds([
          [lat, lng],
          [stationLat, stationLng]
        ]);
        mapRef.current.fitBounds(bounds, { padding: [60, 60] });
      }
    } catch (e) {
      console.error("Leaflet initialization failed: ", e);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isOpen, mapLoaded, coordinates, hasCoords, stationCoordinates, stationName, geofenceRadius]);

  if (!isOpen) return null;

  // Extract clean battery ID only - no extra labels or texts
  const cleanSubtitle = (() => {
    const combined = `${title || ""} ${subtitle || ""}`;
    const matches = combined.match(/BI\d+/gi);
    if (matches && matches.length > 0) {
      const uniqueMatches = Array.from(new Set(matches.map(m => m.toUpperCase())));
      return uniqueMatches.join(" • ");
    }
    return subtitle || title;
  })();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" id="map-modal-backdrop">
      <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] w-full max-w-3xl overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col animate-in zoom-in-95 duration-200 max-h-[85vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-950/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/40 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight leading-none">
                Location Map
              </h3>
              <p className="text-xs font-bold text-zinc-500 mt-1 dark:text-zinc-400 font-mono tracking-wider">
                {cleanSubtitle}
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-1 cursor-pointer flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-350 transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 p-6 flex flex-col min-h-[350px]">
          {hasCoords ? (
            <div className="flex-1 relative rounded-2xl overflow-hidden border border-zinc-250 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950 shadow-inner">
              {!mapLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-900 z-[10]">
                  <div className="w-8 h-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin mb-3"></div>
                  <span className="text-sm font-bold text-zinc-500 dark:text-zinc-400">Loading Map Engine...</span>
                </div>
              )}
              {/* Map Mount Point */}
              <div ref={mountRef} className="w-full h-full min-h-[350px] z-0"></div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-800">
              <div className="w-16 h-16 bg-amber-50 dark:bg-amber-950/20 rounded-full flex items-center justify-center text-amber-500 mb-4 animate-pulse">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-tight">Coordinates Unavailable</h4>
              <p className="text-sm text-zinc-550 dark:text-zinc-400 max-w-sm mt-2 font-semibold">
                This asset does not have valid GPS coordinates at the moment.
              </p>
              {coordinates && (
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest mt-4">
                  Raw GPS: [{coordinates.join(', ')}]
                </span>
              )}
            </div>
          )}

          {hasCoords && (
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-zinc-100 dark:border-zinc-850 pt-4 px-2">
              <div className="text-[10.5px] font-bold text-zinc-400 uppercase tracking-wider font-mono flex flex-col gap-1">
                <span>Lat: {coordinates![1].toFixed(6)} • Lng: {coordinates![0].toFixed(6)}</span>
                {stationCoordinates && (
                  <span className="text-emerald-500 text-[9.5px]">Assigned Hub: Lat: {stationCoordinates[0].toFixed(6)} • Lng: {stationCoordinates[1].toFixed(6)}</span>
                )}
              </div>
              
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${coordinates![1]},${coordinates![0]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 animate-in fade-in duration-350"
                >
                  <MapPin className="w-4 h-4 text-indigo-200" />
                  <span>Google Maps</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MapModal;
