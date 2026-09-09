
import React from 'react';
import { 
  MagnifyingGlassIcon, 
  BellIcon, 
  EnvelopeIcon, 
  ChevronDownIcon, 
  Bars3Icon,
  SunIcon,
  MoonIcon
} from '@heroicons/react/24/outline';
import { UserRole } from '../types';
import { User } from "firebase/auth";

interface HeaderProps {
  role: UserRole;
  onMenuClick: () => void;
  isDarkMode: boolean;
  onThemeToggle: () => void;
  user: User;
  onRoleChange?: (newRole: UserRole) => void;
}

const Header: React.FC<HeaderProps> = ({ role, onMenuClick, isDarkMode, onThemeToggle, user, onRoleChange }) => {
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [showPwaModal, setShowPwaModal] = React.useState(false);
  const [isAppInstalled, setIsAppInstalled] = React.useState(false);
  const [showRoleMenu, setShowRoleMenu] = React.useState(false);
  const roleMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (roleMenuRef.current && !roleMenuRef.current.contains(event.target as Node)) {
        setShowRoleMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  React.useEffect(() => {
    // 1. Listen for standard browser PWA install event
    const handleBeforePrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforePrompt);

    // 2. Check if already operating in web app custom mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    if (isStandalone) {
      setIsAppInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforePrompt);
    };
  }, []);

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      // Trigger native browser install prompt for Android/Desktop
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] User response:', outcome);
      if (outcome === 'accepted') {
        setIsAppInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      // Show manual instructions dialog for iOS, other browsers, or when prompt isn't fired yet
      setShowPwaModal(true);
    }
  };

  return (
    <header className="h-20 border-b px-4 lg:px-8 flex items-center justify-between sticky top-0 z-30 transition-all bg-white dark:bg-dark-surface border-gray-50 dark:border-dark-border">
      <div className="flex items-center gap-4 flex-1">
        <button 
          onClick={onMenuClick}
          className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-bg rounded-xl transition-colors"
        >
          <Bars3Icon className="w-6 h-6" />
        </button>

        <div className="flex-1 max-w-xl hidden sm:block">
          <div className="relative group">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 group-focus-within:text-indigo-500 transition-colors w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search assets..."
              className="w-full pl-12 pr-4 py-2.5 bg-gray-50 dark:bg-dark-bg border border-transparent dark:border-dark-border rounded-2xl text-sm focus:bg-white dark:focus:bg-dark-surface focus:border-indigo-100 dark:focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/20 outline-none transition-all dark:text-zinc-100"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 lg:gap-6">
        <div className="flex items-center gap-1.5 lg:gap-2">
          <button 
            onClick={onThemeToggle}
            className="p-2.5 rounded-xl transition-all text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-dark-bg dark:hover:text-indigo-400"
          >
            {isDarkMode ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
          </button>
          
          <button className="p-2.5 rounded-xl transition-all relative text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-dark-bg dark:hover:text-indigo-400">
            <EnvelopeIcon className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full border-2 border-white dark:border-dark-surface"></span>
          </button>
          <button className="hidden sm:flex p-2.5 rounded-xl transition-all text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-dark-bg dark:hover:text-indigo-400">
            <BellIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="h-8 w-[1px] bg-gray-100 dark:bg-dark-border"></div>

        <div className="relative" ref={roleMenuRef}>
          <button 
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            className="flex items-center gap-2 lg:gap-3 pl-2 pr-1 py-1 rounded-2xl transition-all hover:bg-gray-50 dark:hover:bg-dark-bg cursor-pointer"
          >
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold leading-tight font-heading text-zinc-900 dark:text-zinc-50">
                {user.displayName || user.email?.split('@')[0] || 'User'}
              </p>
              <div className="flex items-center justify-end gap-1 mt-0.5">
                <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded-md ${
                  role === UserRole.ADMIN 
                    ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' 
                    : role === UserRole.OPERATIONS
                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}>
                  {role === UserRole.OPERATIONS ? 'Operations' : role}
                </span>
              </div>
            </div>
            <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 border-2 border-white dark:border-dark-surface shadow-sm flex items-center justify-center text-white overflow-hidden text-xs font-bold">
               {user.photoURL ? (
                 <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
               ) : (
                 <span>{user.email?.charAt(0).toUpperCase() || 'U'}</span>
               )}
            </div>
            <ChevronDownIcon className="w-4 h-4 text-gray-400" />
          </button>

          {/* Role switcher & Profile Menu */}
          {showRoleMenu && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-slate-100 dark:border-zinc-800 p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-zinc-800">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{user.displayName || user.email}</p>
                <p className="text-[10px] text-slate-400 font-mono truncate">{user.email}</p>
              </div>

              {onRoleChange && (
                <div className="p-2 space-y-1">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
                    Preview As Role:
                  </span>
                  <button
                    type="button"
                    onClick={() => { onRoleChange(UserRole.ADMIN); setShowRoleMenu(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-between ${
                      role === UserRole.ADMIN 
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span>System Admin</span>
                    {role === UserRole.ADMIN && <span className="text-[10px] font-bold text-indigo-600">Active</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => { onRoleChange(UserRole.OPERATIONS); setShowRoleMenu(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-between ${
                      role === UserRole.OPERATIONS 
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <div>
                      <div>Operations Role</div>
                      <div className="text-[9px] text-slate-400 font-normal">7 Dedicated Pages</div>
                    </div>
                    {role === UserRole.OPERATIONS && <span className="text-[10px] font-bold text-emerald-600">Active</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => { onRoleChange(UserRole.OPERATOR); setShowRoleMenu(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-between ${
                      role === UserRole.OPERATOR 
                        ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span>Station Operator</span>
                    {role === UserRole.OPERATOR && <span className="text-[10px] font-bold text-slate-500">Active</span>}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showPwaModal && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-zinc-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-zinc-150 dark:border-zinc-800 animate-in zoom-in-95 duration-150 text-left">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                </svg>
                <span className="text-xs font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                  Install Application
                </span>
              </div>
              <button 
                type="button" 
                onClick={() => setShowPwaModal(false)}
                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400 dark:text-zinc-500 transition-colors"
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-zinc-550 dark:text-zinc-400 leading-relaxed">
                Add this operations dashboard directly to your Android or iOS device home screen to access it like a mobile app:
              </p>

              <div className="space-y-3">
                <div className="p-3 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl border border-zinc-100 dark:border-zinc-800/60 space-y-1">
                  <span className="block text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest leading-none">
                    Android (Chrome / edge / Firefox)
                  </span>
                  <p className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 leading-normal">
                    Tap the option menu <strong className="text-zinc-800 dark:text-zinc-100">(⋮ or ☰)</strong> next to the address bar, then click <strong className="text-indigo-600 dark:text-indigo-400">"Install app"</strong> or <strong className="text-indigo-600 dark:text-indigo-400">"Add to Home Screen"</strong>.
                  </p>
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl border border-zinc-100 dark:border-zinc-800/60 space-y-1">
                  <span className="block text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest leading-none">
                    iOS / iPhone (Safari)
                  </span>
                  <p className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 leading-normal">
                    Tap the <strong className="text-zinc-800 dark:text-zinc-100">Share</strong> button (box with an up arrow) at the bottom, scroll down and select <strong className="text-indigo-600 dark:text-indigo-400">"Add to Home Screen"</strong>.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowPwaModal(false)}
                className="w-full py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors rounded-xl font-black text-xs uppercase tracking-wider text-center"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;