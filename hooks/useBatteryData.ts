import { useState, useCallback } from 'react';
import { Driver, Battery, Station } from '../types';
import { getStoredBatteries, saveBatteryReport } from '../lib/batteryReportStorage';

export const useBatteryData = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to load batteries from cache
  const getCachedBatteries = (): Battery[] => {
    return getStoredBatteries() as any as Battery[];
  };

  // Helper to save batteries to cache
  const saveCachedBatteries = (bats: Battery[]) => {
    saveBatteryReport(bats as any);
  };

  const getAllDrivers = useCallback(async (_org: string = 'Battery_Dost') => {
    setLoading(true);
    setError(null);
    try {
      const bats = getCachedBatteries();
      const driversMap = new Map<string, Driver>();
      
      bats.forEach(b => {
        if (b.driver_id && b.driverData) {
          driversMap.set(b.driver_id, {
            driver_id: b.driver_id,
            name: b.driverData.name || "Unknown Driver",
            phone: b.driverData.phone || "--",
            is_active: true,
            wallet_balance: 0,
            onboarded_on: Date.now(),
            onboardingStatus: "Active",
            assigned: true,
            city: "Gurugram",
            total_swaps: b.cycles || 0
          } as any);
        }
      });

      return Array.from(driversMap.values());
    } catch (err: any) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const getAllBatteries = useCallback(async (_org: string = 'Battery_Dost', _filter: any = {}, _isReport: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      return getCachedBatteries();
    } catch (err: any) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const getAllDealers = useCallback(async (_org: string = 'Battery_Dost') => {
    setLoading(true);
    setError(null);
    try {
      const bats = getCachedBatteries();
      const stationsMap = new Map<string, Station>();
      
      bats.forEach(b => {
        if (b.dealer_id && b.dealer_name) {
          stationsMap.set(b.dealer_id, {
            _id: b.dealer_id,
            id: b.dealer_id,
            dealer_id: b.dealer_id,
            name: b.dealer_name,
            location: b.location?.coordinates ? [b.location.coordinates[1], b.location.coordinates[0]] : [28.43, 77.03],
            active: true,
            total_battries: 1,
            battery_status: { available: 0, charging: 0, assigned: 0, lowsoc: 0, error: 0, all: 1 },
            total_swaps: b.cycles || 0,
            total_revenue: 0,
            cash_revenue: 0,
            wallet_revenue: 0,
            last_active: Date.now()
          });
        }
      });
      return Array.from(stationsMap.values());
    } catch (err: any) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const assignBatteryDealer = useCallback(async (batteryId: string, dealerId: string) => {
    const bats = getCachedBatteries();
    const updated = bats.map(b => {
      if (b.id === batteryId) {
        return { ...b, dealer_id: dealerId };
      }
      return b;
    });
    saveCachedBatteries(updated);
    return { success: true };
  }, []);

  const updateBatteryStatus = useCallback(async (batteryId: string, status: number) => {
    const bats = getCachedBatteries();
    const updated = bats.map(b => {
      if (b.id === batteryId) {
        return { 
          ...b, 
          status,
          mosfet: {
            charging: status === 4 ? 1 : b.mosfet?.charging || 0,
            discharging: status === 2 ? 1 : b.mosfet?.discharging || 0
          }
        };
      }
      return b;
    });
    saveCachedBatteries(updated);
    window.dispatchEvent(new Event('storage'));
    return { success: true, status: "success" };
  }, []);

  const getDriverLeaveAndPenaltyDetails = useCallback(async (driverId: string) => {
    const key = `penalty_history_${driverId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    
    const defaultData = {
      success: true,
      data: {
        penalties: [
          {
            date: new Date().toISOString(),
            detail: {
              is_paid: false,
              amount: 250,
              paid_at: null
            }
          }
        ]
      }
    };
    localStorage.setItem(key, JSON.stringify(defaultData));
    return defaultData;
  }, []);

  const getAllPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      return [
        { id: "plan_lite", name: "Lite Daily Lease Plan", cost: 150 },
        { id: "plan_standard", name: "Standard Lease Plan", cost: 200 },
        { id: "plan_unlimited", name: "Premium Unlimited Swaps Plan", cost: 350 }
      ];
    } catch (err: any) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const updateDriver = useCallback(async (_payload: { 
    driver_id: string; 
    plan_id?: string; 
    is_active?: boolean; 
    kyc_status?: boolean;
  }) => {
    return { success: true };
  }, []);

  const walletUpdate = useCallback(async (payload: {
    driver_id: string;
    amount: number;
    reason: string;
  }) => {
    const key = `wallet_history_${payload.driver_id}`;
    let history: any[] = [];
    const saved = localStorage.getItem(key);
    if (saved) {
      try { history = JSON.parse(saved); } catch (e) {}
    }
    const newTx = {
      timestamp: new Date().toISOString(),
      amount: payload.amount,
      reason: payload.reason,
      status: "Success",
      reference: `TX-${Math.floor(100000 + Math.random() * 900000)}`
    };
    history.unshift(newTx);
    localStorage.setItem(key, JSON.stringify(history));

    return { success: true, message: "Wallet updated successfully" };
  }, []);

  const saveAlertHistory = useCallback(async (_alertId: string, _notes: string, _performedBy: string = 'current_user') => {
    return { success: true };
  }, []);

  const getAllSwappingSessions = useCallback(async (_filter: any = {}, _org: string = 'Battery_Dost') => {
    setLoading(true);
    setError(null);
    try {
      return {
        result: [],
        totalCount: 0
      };
    } catch (err: any) {
      setError(err.message);
      return { result: [], totalCount: 0 };
    } finally {
      setLoading(false);
    }
  }, []);

  const getDriverSwappingSessions = useCallback(async (_driverId: string, _org: string = 'Battery_Dost') => {
    return {
      success: true,
      data: {
        result: [
          {
            id: `swap-${Date.now()}-1`,
            timestamp: Date.now() - 3600000,
            stationName: "Jharsa Sector 39",
            batteryIn: "BI260500721",
            batteryOut: "BI260300685"
          }
        ]
      }
    };
  }, []);

  const getDriverWalletHistory = useCallback(async (driverId: string, _fromDateISO: string, _toDateISO: string) => {
    const key = `wallet_history_${driverId}`;
    const saved = localStorage.getItem(key);
    let history = [];
    if (saved) {
      try { history = JSON.parse(saved); } catch (e) {}
    } else {
      history = [
        {
          timestamp: new Date().toISOString(),
          amount: 500,
          reason: "Initial Balance",
          status: "Success",
          reference: "TX-998273"
        }
      ];
      localStorage.setItem(key, JSON.stringify(history));
    }
    return {
      success: true,
      data: {
        result: history
      }
    };
  }, []);

  return {
    loading,
    error,
    getAllDrivers,
    getAllBatteries,
    getAllDealers,
    assignBatteryDealer,
    updateBatteryStatus,
    getDriverLeaveAndPenaltyDetails,
    getAllPlans,
    updateDriver,
    walletUpdate,
    saveAlertHistory,
    getAllSwappingSessions,
    getDriverSwappingSessions,
    getDriverWalletHistory,
  };
};
