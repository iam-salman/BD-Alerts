
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { UserRole, KazamBattery, KazamDriver } from '@/types';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Dashboard from '@/pages/Dashboard';
import BatteryLookupPage from '@/pages/BatteryLookupPage';
import AlertsPage from '@/pages/AlertsPage';
import AlertDriversPage from '@/pages/AlertDriversPage';
import SwappingTransactionsPage from '@/pages/SwappingTransactionsPage';
import SwappingAnalyticsPage from '@/pages/SwappingAnalyticsPage';
import BatteryUtilisationPage from '@/pages/BatteryUtilisationPage';
import GhostBatteriesPage from '@/pages/GhostBatteriesPage';
import NearbyDriversPage from '@/pages/NearbyDriversPage';
import SettingsPage from '@/pages/SettingsPage';
import BatteryIssuesPage from '@/pages/BatteryIssuesPage';
import DailyInventoryPage from '@/pages/DailyInventoryPage';
import CapacityPlanningPage from '@/pages/CapacityPlanningPage';
import DriverInsightsPage from '@/pages/DriverInsightsPage';
import Login from '@/components/Login';
import UserManagement from '@/pages/UserManagement';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import ErrorBoundary from '@/components/ErrorBoundary';

const App: React.FC = () => {
  const { user, role, setRole, allowedPages, loading, logout, preferences } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  const handleBatterySelect = (battery: KazamBattery) => {
    console.log('Selected battery:', battery);
  };

  const handleDriverSelect = (driver: KazamDriver) => {
    console.log('Selected driver:', driver);
  };

  // Determine if user can access a page by its tab id
  const canAccessPage = (tabId: string): boolean => {
    if (role === UserRole.ADMIN) return true;
    
    if (role === UserRole.OPERATIONS) {
      if (allowedPages && allowedPages.length > 0) {
        return allowedPages.includes(tabId);
      }
      // Default 7 operations pages
      return [
        'swapping-transactions',
        'alert-drivers',
        'daily-inventory',
        'battery-issues',
        'alerts',
        'battery-lookup',
        'ghosts'
      ].includes(tabId);
    }
    
    if (role === UserRole.OPERATOR) {
      if (allowedPages && allowedPages.length > 0) {
        return allowedPages.includes(tabId);
      }
      return [
        'swapping-transactions',
        'alerts',
        'alert-drivers',
        'battery-lookup',
        'battery-issues',
        'daily-inventory'
      ].includes(tabId);
    }

    return false;
  };

  const defaultLandingPath = role === UserRole.ADMIN 
    ? '/dashboard' 
    : canAccessPage('swapping-transactions') 
    ? '/swapping-transactions' 
    : (allowedPages && allowedPages.length > 0 ? `/${allowedPages[0]}` : '/swapping-transactions');

  if (loading) return <div className="h-screen w-full flex items-center justify-center dark:bg-zinc-950 transition-colors"><div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>;
  if (!user) return <Login isDarkMode={isDarkMode} />;

  const activeTab = location.pathname.split('/')[1] || 'dashboard';

  return (
    <div className="flex h-screen w-full overflow-hidden transition-colors bg-[#F8F9FB] dark:bg-zinc-950">
      <Sidebar 
        role={role} 
        activeTab={activeTab} 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        onLogout={logout} 
        hiddenTabs={preferences?.hiddenTabs || []}
        allowedPages={allowedPages}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header 
          role={role} 
          onMenuClick={() => setIsSidebarOpen(true)} 
          isDarkMode={isDarkMode} 
          onThemeToggle={() => setIsDarkMode(!isDarkMode)} 
          user={user}
        />
        <main className="flex-1 overflow-y-auto p-4 scrollbar-hide">
          <div className="w-full mx-auto">
            <ErrorBoundary>
              <Routes>
                {/* Admin & Full Access Pages */}
                <Route path="/dashboard" element={canAccessPage('dashboard') ? <Dashboard isDarkMode={isDarkMode} /> : <Navigate to={defaultLandingPath} replace />} />
                
                {/* 7 Operations Pages */}
                <Route path="/swapping-transactions" element={canAccessPage('swapping-transactions') ? <SwappingTransactionsPage /> : <Navigate to={defaultLandingPath} replace />} />
                <Route path="/alert-drivers" element={canAccessPage('alert-drivers') ? <AlertDriversPage isDarkMode={isDarkMode} db={db} onBatterySelect={handleBatterySelect} role={role} /> : <Navigate to={defaultLandingPath} replace />} />
                <Route path="/alert-drivers/:tab" element={canAccessPage('alert-drivers') ? <AlertDriversPage isDarkMode={isDarkMode} db={db} onBatterySelect={handleBatterySelect} role={role} /> : <Navigate to={defaultLandingPath} replace />} />
                <Route path="/daily-inventory" element={canAccessPage('daily-inventory') ? <DailyInventoryPage isDarkMode={isDarkMode} db={db} user={user} /> : <Navigate to={defaultLandingPath} replace />} />
                <Route path="/battery-issues" element={canAccessPage('battery-issues') ? <BatteryIssuesPage db={db} isDarkMode={isDarkMode} onBatterySelect={handleBatterySelect} role={role} /> : <Navigate to={defaultLandingPath} replace />} />
                <Route path="/alerts" element={canAccessPage('alerts') ? <AlertsPage db={db} isDarkMode={isDarkMode} onBatterySelect={handleBatterySelect} role={role} /> : <Navigate to={defaultLandingPath} replace />} />
                <Route path="/alerts/:tab" element={canAccessPage('alerts') ? <AlertsPage db={db} isDarkMode={isDarkMode} onBatterySelect={handleBatterySelect} role={role} /> : <Navigate to={defaultLandingPath} replace />} />
                <Route path="/battery-lookup" element={canAccessPage('battery-lookup') ? <BatteryLookupPage db={db} role={role} /> : <Navigate to={defaultLandingPath} replace />} />
                <Route path="/ghosts" element={canAccessPage('ghosts') ? <GhostBatteriesPage isDarkMode={isDarkMode} db={db} /> : <Navigate to={defaultLandingPath} replace />} />

                {/* Additional Admin & Executive Pages */}
                <Route path="/nearby-drivers" element={canAccessPage('nearby-drivers') ? <NearbyDriversPage isDarkMode={isDarkMode} db={db} /> : <Navigate to={defaultLandingPath} replace />} />
                <Route path="/users" element={canAccessPage('users') ? <UserManagement isDarkMode={isDarkMode} db={db} /> : <Navigate to={defaultLandingPath} replace />} />
                <Route path="/settings" element={canAccessPage('settings') ? <SettingsPage db={db} isDarkMode={isDarkMode} onToggleTheme={() => setIsDarkMode(!isDarkMode)} user={user} /> : <Navigate to={defaultLandingPath} replace />} />
                <Route path="/analytics" element={canAccessPage('analytics') ? <SwappingAnalyticsPage /> : <Navigate to={defaultLandingPath} replace />} />
                <Route path="/utilisation" element={canAccessPage('utilisation') ? <BatteryUtilisationPage /> : <Navigate to={defaultLandingPath} replace />} />
                <Route path="/driver-insights" element={canAccessPage('driver-insights') ? <DriverInsightsPage /> : <Navigate to={defaultLandingPath} replace />} />
                <Route path="/capacity" element={canAccessPage('capacity') ? <CapacityPlanningPage /> : <Navigate to={defaultLandingPath} replace />} />

                {/* Fallbacks */}
                <Route path="/" element={<Navigate to={defaultLandingPath} replace />} />
                <Route path="*" element={<Navigate to={defaultLandingPath} replace />} />
              </Routes>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
