
import React from 'react';
import { 
  Squares2X2Icon,
  BoltIcon,
  Battery50Icon,
  BuildingStorefrontIcon,
  UsersIcon,
  ClipboardDocumentCheckIcon,
  IdentificationIcon,
  ExclamationTriangleIcon,
  SignalSlashIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  PresentationChartLineIcon,
  ClockIcon,
  DocumentTextIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
  CommandLineIcon,
  MegaphoneIcon,
  CubeIcon,
  BanknotesIcon,
  MagnifyingGlassCircleIcon,
  MapIcon
} from '@heroicons/react/24/outline';
import { NavItem, UserRole } from './types';

export const OPERATIONS_DEFAULT_PAGES: string[] = [
  'swapping-transactions',
  'alert-drivers',
  'daily-inventory',
  'battery-issues',
  'alerts',
  'battery-lookup',
  'ghosts'
];

export const NAVIGATION: NavItem[] = [
  // Core Operations
  { id: 'dashboard', label: 'Dashboard', icon: <Squares2X2Icon className="w-5 h-5" />, category: 'Core Operations', roles: [UserRole.ADMIN, UserRole.OPERATOR] },
  { id: 'swapping-transactions', label: 'Swap Sessions', icon: <DocumentTextIcon className="w-5 h-5" />, category: 'Core Operations', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.OPERATIONS] },
  
  // Daily Operations
  { id: 'alert-drivers/ingestion', label: 'Alert Drivers', icon: <MegaphoneIcon className="w-5 h-5" />, category: 'Daily Operations', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.OPERATIONS] },
  { id: 'daily-inventory', label: 'Daily Inventory', icon: <ClipboardDocumentCheckIcon className="w-5 h-5" />, category: 'Daily Operations', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.OPERATIONS] },

  // Monitoring
  { id: 'battery-issues', label: 'Battery Issues', icon: <WrenchScrewdriverIcon className="w-5 h-5" />, category: 'Monitoring', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.OPERATIONS] },
  { id: 'alerts/swap_anomalies', label: 'Swap Alerts', icon: <ExclamationTriangleIcon className="w-5 h-5" />, category: 'Monitoring', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.OPERATIONS] },
  { id: 'nearby-drivers', label: 'Nearby Drivers', icon: <MapIcon className="w-5 h-5" />, category: 'Monitoring', roles: [UserRole.ADMIN, UserRole.OPERATOR] },
  { id: 'battery-lookup', label: 'Battery Lookup', icon: <MagnifyingGlassCircleIcon className="w-5 h-5" />, category: 'Monitoring', roles: [UserRole.ADMIN, UserRole.OPERATOR, UserRole.OPERATIONS] },
  { id: 'ghosts', label: 'Ghost Batteries', icon: <SignalSlashIcon className="w-5 h-5" />, category: 'Monitoring', roles: [UserRole.ADMIN, UserRole.OPERATIONS] },

  // Analytics
  { id: 'analytics', label: 'Swapping Analytics', icon: <ChartBarIcon className="w-5 h-5" />, category: 'Analytics', roles: [UserRole.ADMIN] },
  { id: 'utilisation', label: 'Battery Utilisation', icon: <ChartBarIcon className="w-5 h-5" />, category: 'Analytics', roles: [UserRole.ADMIN] },
  { id: 'driver-insights', label: 'Driver Insights', icon: <UserGroupIcon className="w-5 h-5" />, category: 'Analytics', roles: [UserRole.ADMIN] },
  { id: 'capacity', label: 'Capacity Planning', icon: <PresentationChartLineIcon className="w-5 h-5" />, category: 'Analytics', roles: [UserRole.ADMIN] },

  // System
  { id: 'users', label: 'User Management', icon: <UserGroupIcon className="w-5 h-5" />, category: 'System', roles: [UserRole.ADMIN] },
  { id: 'settings', label: 'Settings', icon: <Cog6ToothIcon className="w-5 h-5" />, category: 'System', roles: [UserRole.ADMIN] },
];
