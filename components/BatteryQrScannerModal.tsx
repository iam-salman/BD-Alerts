import React, { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  XMarkIcon,
  CameraIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  MagnifyingGlassIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

interface BatteryQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (batteryId: string) => void;
  allBatteryIds?: string[];
}

export const parseBatteryIdFromQr = (qrText: string): string => {
  if (!qrText) return '';
  const trimmed = qrText.trim();

  // 1. Try parsing JSON
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const possibleId = parsed.id || parsed.batteryId || parsed.battery_id || parsed.asset_id || parsed.assetId || parsed.battery;
      if (possibleId) return String(possibleId).trim().toUpperCase();
    } catch {
      // Not valid JSON, continue
    }
  }

  // 2. Try parsing URL
  if (trimmed.includes('://') || trimmed.includes('www.') || trimmed.includes('/battery/')) {
    try {
      const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      const idParam = urlObj.searchParams.get('id') ||
                      urlObj.searchParams.get('batteryId') ||
                      urlObj.searchParams.get('battery_id') ||
                      urlObj.searchParams.get('batId') ||
                      urlObj.searchParams.get('asset_id');
      if (idParam) return idParam.trim().toUpperCase();

      // Check path segments (e.g., /battery/BD-BAT-001)
      const pathSegments = urlObj.pathname.split('/').filter(Boolean);
      const batIdx = pathSegments.findIndex(s => s.toLowerCase() === 'battery' || s.toLowerCase() === 'batteries');
      if (batIdx !== -1 && pathSegments[batIdx + 1]) {
        return pathSegments[batIdx + 1].trim().toUpperCase();
      }
      if (pathSegments.length > 0) {
        return pathSegments[pathSegments.length - 1].trim().toUpperCase();
      }
    } catch {
      // Continue
    }
  }

  // 3. Delimited string (e.g., "BD-BAT-1234|IOT-999")
  if (trimmed.includes('|')) {
    const parts = trimmed.split('|').map(p => p.trim()).filter(Boolean);
    return parts[0].toUpperCase();
  }

  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map(p => p.trim()).filter(Boolean);
    return parts[0].toUpperCase();
  }

  return trimmed.toUpperCase();
};

export const BatteryQrScannerModal: React.FC<BatteryQrScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  allBatteryIds = []
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [manualInput, setManualInput] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const [isScanningFile, setIsScanningFile] = useState<boolean>(false);
  const animationFrameId = useRef<number | null>(null);

  // Stop camera helper
  const stopCamera = useCallback(() => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setCameraActive(false);
  }, [stream]);

  // Start camera
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      setStream(newStream);
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
      }
    } catch (err: any) {
      console.warn("Camera access failed:", err);
      setCameraError(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Camera permission denied. Please allow camera access in browser settings or use manual entry / file upload.'
          : 'Unable to start camera. Please ensure no other app is using it or upload a QR image.'
      );
      setCameraActive(false);
    }
  }, [facingMode, stream]);

  // Continuous frame scanning loop
  useEffect(() => {
    if (!isOpen || !cameraActive || !videoRef.current || !canvasRef.current) return;

    let isScanning = true;

    const scanFrame = () => {
      if (!isScanning) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert"
          });

          if (code && code.data) {
            const parsedId = parseBatteryIdFromQr(code.data);
            if (parsedId) {
              setScannedResult(parsedId);
              isScanning = false;
              stopCamera();
              setTimeout(() => {
                onScanSuccess(parsedId);
              }, 400);
              return;
            }
          }
        }
      }

      animationFrameId.current = requestAnimationFrame(scanFrame);
    };

    animationFrameId.current = requestAnimationFrame(scanFrame);

    return () => {
      isScanning = false;
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isOpen, cameraActive, onScanSuccess, stopCamera]);

  // Manage camera on modal open/close
  useEffect(() => {
    if (isOpen) {
      setScannedResult(null);
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  // Handle QR image file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanningFile(true);
    setCameraError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "attemptBoth"
          });

          setIsScanningFile(false);
          if (code && code.data) {
            const parsedId = parseBatteryIdFromQr(code.data);
            setScannedResult(parsedId);
            stopCamera();
            setTimeout(() => {
              onScanSuccess(parsedId);
            }, 300);
          } else {
            setCameraError("No readable QR code found in the uploaded image. Please try a clearer photo or enter Battery ID manually.");
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    if (e.target) e.target.value = '';
  };

  // Manual submit
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    const parsedId = parseBatteryIdFromQr(manualInput);
    stopCamera();
    onScanSuccess(parsedId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700/80 rounded-3xl shadow-2xl overflow-hidden text-white flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <CameraIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-white">
                Scan Battery QR Code
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Video / Camera Scanner View */}
        <div className="relative bg-black flex-1 min-h-[300px] max-h-[360px] flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            className={`w-full h-full object-cover ${scannedResult ? 'opacity-40 filter blur-sm' : ''}`}
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Scanner Overlay Box & Laser */}
          {cameraActive && !scannedResult && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-64 h-64 border-2 border-indigo-500/80 rounded-3xl shadow-[0_0_40px_rgba(99,102,241,0.25)] flex items-center justify-center overflow-hidden">
                {/* Corner Markers */}
                <div className="absolute top-2 left-2 w-6 h-6 border-t-4 border-l-4 border-indigo-400 rounded-tl-lg" />
                <div className="absolute top-2 right-2 w-6 h-6 border-t-4 border-r-4 border-indigo-400 rounded-tr-lg" />
                <div className="absolute bottom-2 left-2 w-6 h-6 border-b-4 border-l-4 border-indigo-400 rounded-bl-lg" />
                <div className="absolute bottom-2 right-2 w-6 h-6 border-b-4 border-r-4 border-indigo-400 rounded-br-lg" />
                
                {/* Animated laser line */}
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_12px_#818cf8] animate-pulse" />

                <div className="bg-black/60 px-3 py-1 rounded-full text-[10px] font-bold text-zinc-300 tracking-wider uppercase border border-white/10">
                  Align QR in box
                </div>
              </div>
            </div>
          )}

          {/* Scanned Success Overlay */}
          {scannedResult && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95 duration-200">
              <div className="p-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 mb-3 animate-bounce">
                <CheckCircleIcon className="w-10 h-10" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">QR Code Detected!</span>
              <h3 className="text-2xl font-black text-white mt-1 mb-2 font-mono tracking-wider">{scannedResult}</h3>
              <p className="text-xs text-zinc-400">Loading battery telemetry and service history...</p>
            </div>
          )}

          {/* Camera Error Message */}
          {cameraError && !cameraActive && (
            <div className="absolute inset-0 bg-zinc-950 p-6 flex flex-col items-center justify-center text-center">
              <ExclamationCircleIcon className="w-10 h-10 text-amber-400 mb-2" />
              <p className="text-xs text-zinc-300 max-w-sm mb-4 font-medium">{cameraError}</p>
              <button
                onClick={startCamera}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <ArrowPathIcon className="w-4 h-4" /> Try Camera Again
              </button>
            </div>
          )}

          {/* Camera Switch Button */}
          {cameraActive && !scannedResult && (
            <button
              onClick={() => {
                setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
              }}
              className="absolute top-4 right-4 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 backdrop-blur-sm transition-all"
              title="Switch Camera"
            >
              <ArrowPathIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Action Controls & Manual Options */}
        <div className="p-5 bg-zinc-900 space-y-4 border-t border-zinc-800">
          {/* File Upload Option */}
          <div className="flex items-center justify-between gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanningFile}
              className="flex-1 py-2.5 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center justify-center gap-2 border border-zinc-700 transition-all disabled:opacity-50"
            >
              <ArrowUpTrayIcon className="w-4 h-4 text-indigo-400" />
              {isScanningFile ? 'Scanning Image...' : 'Upload QR Image'}
            </button>
          </div>

          {/* Manual Battery ID Input Fallback */}
          <form onSubmit={handleManualSubmit} className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-zinc-400 block">
              Or Enter Battery ID Manually
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="e.g. BD-BAT-1049, BAT001..."
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-800/80 border border-zinc-700 rounded-xl text-xs text-white placeholder-zinc-500 font-bold focus:outline-none focus:border-indigo-500 font-mono uppercase"
                  list="battery-quick-suggestions"
                />
                <datalist id="battery-quick-suggestions">
                  {allBatteryIds.slice(0, 15).map(id => (
                    <option key={id} value={id} />
                  ))}
                </datalist>
              </div>
              <button
                type="submit"
                disabled={!manualInput.trim()}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all disabled:opacity-40 whitespace-nowrap"
              >
                Inspect
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BatteryQrScannerModal;
