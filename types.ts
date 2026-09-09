
import React from 'react';

export enum UserRole {
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
  OPERATIONS = 'OPERATIONS'
}

export type BatteryStatusLabel = 'Available' | 'Assigned' | 'Error' | 'Low SoC' | 'Charging' | 'Offline' | 'Plant' | 'Office' | 'Warehouse';

export interface Battery {
  _id: string;
  id: string; // Asset ID
  iot_id?: string;
  bms_id?: string;
  make: string;
  model: string;
  status: number; // 0, 2, 3, 4
  soc: number;
  soh: number;
  cycles?: number;
  charge_cycles?: number;
  discharge_cycles?: number;
  voltage: number;
  temperature: number;
  network: boolean;
  odometer: number;
  dealer_name: string;
  dealer_id?: string; // Added Station ID
  charge_state?: number; // Added for precise charging status
  driver_id?: string; // Root level driver ID
  driverData?: {
    id?: string; // Kept for backward compatibility if needed
    name: string;
    phone: string;
  };
  mosfet?: {
    charging: number;
    discharging: number;
  };
  last_updated_on: number | string; // Support both unix timestamp and ISO string
  last_swap_on?: number; // Added for swap tracking
  total_swaps?: number; // Added for battery report total swaps
  batteryHistory?: {
    timestamp: number;
    txn_id?: string;
  }; 
  location: {
    coordinates: [number, number];
  };
}

export type KazamBattery = Battery;

// --- Driver Interfaces ---

export interface Driver {
  driver_id: string;
  name: string;
  phone: string;
  wallet_balance: number;
  onboarded_on: number;
  onboardingStatus: string;
  is_active: boolean;
  assigned: boolean;
  city: string;
  total_swaps: number;
  alt_phone?: string;
  onboarding_station?: { id: string; name: string };
  
  // Nested Data Structures from API
  planData?: { plan_name: string; deposit_amount?: number; free_swaps?: number }[];
  vehicle_info?: { 
    vehicle_number: string | null; 
    chassis_number?: string | null;
    make?: string;
    model?: string;
  };
  vehicleData?: { vehicle_number: string | null; chassis_number?: string | null }[];
  latest_swap?: { vehicle_number: string | null; last_swap_date?: number };
  
  // Optional / UI fields
  _id?: string; // Keeping optional for compatibility
  email?: string;
  profile_pic?: string;
  kyc_status?: boolean;
  activePenalty?: string;
  penalty_info?: {
    total_penalty_amount: number;
    paid_penalty_amount: number;
    pending_penalty_amount: number;
    paid_penalties: number;
    pending_penalties: number;
    total_penalties: number;
  };
}

export type KazamDriver = Driver;

export interface DriverOnboardingItem {
  installed: boolean;
  date?: string;
  remarks?: string;
}

export interface DriverMasterRecord {
  additional_phones: string[];
  onboarding: {
    harness: DriverOnboardingItem;
    soc_meter: DriverOnboardingItem;
    mcb: DriverOnboardingItem;
    extension_cable: DriverOnboardingItem;
  };
  id_card: {
    generated: boolean;
    delivered: boolean;
    photo_url?: string;
  };
  gift_kit: {
    eligible: boolean;
    status: 'Pending' | 'Given' | 'Delivered Later';
    photo_url?: string;
    delivered_date?: string;
  };
}

export interface DriverComment {
  id: string;
  driverId: string;
  text: string;
  author: string;
  timestamp: string;
}

export interface DriverRepairLog {
  id: string;
  driverId: string;
  item: string; // e.g., Harness, Meter
  reason: string;
  status: 'Pending' | 'Completed';
  timestamp: string;
  technician: string;
  photo_url?: string;
}

// -------------------------

export interface AssetChangeLog {
  id?: string;
  batteryId: string;
  timestamp: string; // ISO string
  field: 'iot_id' | 'bms_id';
  oldValue: string;
  newValue: string;
}

export const ISSUE_TYPES = [
  'UV issue',
  'UV issue observed again',
  'IoT offline',
  'BMS not connected',
  'E5 Error',
  'CE Error',
  'E3 Error',
  'Buzzer is beeping',
  'Buzzer Beeping',
  'FOTA',
  'UV + OV',
  'Other'
] as const;

export type IssueType = typeof ISSUE_TYPES[number];

export const ISSUE_STATUSES = [
  'Open',
  'Closed',
  'RTF',
  'Issue Resolved Automatically',
  'In Plant',
  'Returned'
] as const;

export type BatteryIssueStatus = typeof ISSUE_STATUSES[number] | 'Pending';

export interface BatteryIssue {
  id: string;
  batteryId: string;
  manufacturerSrNo?: string; // Manufacturer Sr, No. (optional)
  iotId?: string; // IoT ID (captured automatically and saved from battery Report)
  issue?: string; // Issue title / description
  issueRaiseDateTime?: string; // Formatted date and time
  complaintId?: string; // Complaint ID (optional)
  zone?: string; // Operational Zone
  fseComments?: string; // Field Service Engineer Comments
  fseVisitDate?: string; // FSE visit Date (YYYY-MM-DD)
  status: BatteryIssueStatus; // Open, Closed, RTF, Issue Resolved Automatically, In Plant, Returned
  
  // Additional tracking metadata
  stationId?: string;
  mainDescription?: IssueType | string;
  subDescription?: string;
  occurrenceCount?: number;
  occurrenceDates?: string[]; // Array of ISO strings
  raisedBy?: string; // email
  raisedByName?: string;
  raisedByRole?: UserRole;
  createdAt: string; // ISO (First occurrence)
  lastOccurrenceAt?: string; // ISO (Latest occurrence)
  currentLocationContext?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  actionTaken?: string;
  resolutionDate?: string;
  issueType?: IssueType | string; 
  removalFactor?: number | string;
  isOnlineAtRaise?: boolean;
  removalRecommendation?: string;
  swapAlertSocThreshold?: number;
}

export interface RepairLog {
  id: string;
  issueId: string;
  batteryId: string;
  technician: string;
  action: string;
  location: string; // Station/Office/Plant
  resolved: boolean;
  timestamp: string; // ISO
}

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  category: string;
  roles: UserRole[];
}

// --- Station Types ---

export interface BatteryStatusSummary {
  available: number;
  charging: number;
  assigned: number;
  lowsoc: number;
  error: number;
  all: number;
}

export interface Station {
  _id: string;
  id: string;
  dealer_id: string;
  name: string;
  location: [number, number]; // [lat, lng]
  active: boolean;
  total_battries: number;
  battery_status: BatteryStatusSummary;
  total_swaps: number;
  total_revenue: number;
  cash_revenue: number;
  wallet_revenue: number;
  last_active: number; // Unix timestamp
  address?: string;
  city?: string;
  pincode?: string;
}

export interface StationGroup {
  id: string;
  name: string;
  stationIds?: string[]; // Added for ID-based lookups
  stationNames: string[];
  createdAt: string;
  type?: string; 
}

export interface ColumnGroup {
  id: string;
  name: string;
  columnKeys: string[];
  createdAt: string;
  type?: string;
}

export interface SwappingSession {
  _id: string;
  txn_id: string;
  payee_id: string;
  payer_id: string;
  vehicle_number: string;
  category?: string;
  mode: string;
  start_time: number;
  type: number;
  amount: number;
  dealer_share: number;
  odometer_details: {
    old_odometer: number[];
    new_odometer: number[];
  };
  soc_details: {
    old_soc: number[];
    new_soc: number[];
  };
  driverData: {
    _id: string;
    driver_id: string;
    name: string;
    phone: string;
  };
  end_time: number;
  timestamp: number;
  old_battries: string[];
  new_battries: string[];
  duration: number;
  dealer_name: string;
  penalty_amount?: number;
  penalty_paid_amount?: number;
  total_penalty_paid: number;
  penalty_payment_count: number;
  odometer_range_1: number;
  odometer_range_2: number;
  soc_range_1: number;
  soc_range_2: number;
}

export interface DriverPenaltyReport {
  driver_id: string;
  name: string;
  phone: string;
  vehicle_number: string;
  last_swap_date: number | null;
  pending_penalty: number;
  last_synced_at: string; // ISO
  driver_status: boolean;
  onboarding_status: string;
  battery_assigned: boolean;
  kyc_status: boolean;
  onboarded_on?: number;
}

// --- Financial Management Interfaces ---

export interface GeofenceAlert {
  _id: string;
  id: string;
  alertId: string;
  batteryId: string;
  batteryIotId: string;
  geofenceId: string;
  alertType: 'ENTER' | 'EXIT' | 'INVALID_COORDINATES';
  type: string;
  batteryLocation: {
    latitude: number;
    longitude: number;
  };
  geofenceLocation: {
    latitude: number;
    longitude: number;
  };
  distanceFromGeofence: number;
  geofenceRange: number;
  timestamp: number;
  severity: string;
  message: string;
  isResolved: boolean;
  createdAt: number;
  dealer: {
    dealerName: string;
  };
}

export type KazamGeofenceAlert = GeofenceAlert;

export interface CashDeposit {
  id: string;
  date: string;
  amount: number;
  reference: string;
  notes: string;
  created_at: string; // ISO
}

export interface CoinConversion {
  id: string;
  date_given: string;
  vendor_name: string;
  amount_given: number;
  amount_received: number;
  date_received: string | null;
  status: 'Pending' | 'Converted';
  created_at: string; // ISO
}

export interface DriverPayment {
  id: string;
  driver_id: string;
  driver_name: string;
  amount: number;
  payment_type: 'Cash' | 'Other';
  date: string;
  created_at: string; // ISO
}

export interface CashExpense {
  id: string;
  date: string;
  amount: number;
  purpose: string;
  paid_to: string;
  payment_method: 'Cash';
  created_at: string; // ISO
}
