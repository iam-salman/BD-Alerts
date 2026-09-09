import { Battery, GeofenceAlert } from '../types';

const BATTERIES_CACHE_KEY = "bd_ops_batteries_cache_v3";
const GEOFENCE_ALERTS_CACHE_KEY = "bd_ops_geofence_alerts_cache_v1";

export interface GeofenceResponseData {
  alerts: GeofenceAlert[];
  counts: {
    total: number;
    active: number;
    resolved: number;
  };
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    total: number;
  };
}

export const getBatteries = async (_org: string = 'Battery_Dost'): Promise<{ success: boolean; data: Battery[]; error?: string }> => {
  try {
    const cached = localStorage.getItem(BATTERIES_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as Battery[];
      return { success: true, data: parsed };
    }
    return { success: true, data: [] };
  } catch (err: any) {
    return { success: false, data: [], error: err.message || 'Failed to load batteries from cache' };
  }
};

export const getGeofenceAlerts = async (
  page: number = 1,
  limit: number = 10,
  status?: string,
  alertType?: string
): Promise<{ success: boolean; data?: GeofenceResponseData; error?: string }> => {
  try {
    const cached = localStorage.getItem(GEOFENCE_ALERTS_CACHE_KEY);
    let alerts: GeofenceAlert[] = [];
    if (cached) {
      alerts = JSON.parse(cached);
    }

    // Filter by status if specified
    if (status && status !== 'all') {
      if (status.toLowerCase() === 'resolved') {
        alerts = alerts.filter(a => a.isResolved);
      } else if (status.toLowerCase() === 'active') {
        alerts = alerts.filter(a => !a.isResolved);
      }
    }

    // Filter by alertType if specified
    if (alertType && alertType !== 'all') {
      alerts = alerts.filter(a => a.alertType === alertType);
    }

    const total = alerts.length;
    const startIndex = (page - 1) * limit;
    const paginatedAlerts = alerts.slice(startIndex, startIndex + limit);

    return {
      success: true,
      data: {
        alerts: paginatedAlerts,
        counts: {
          total,
          active: alerts.filter(a => !a.isResolved).length,
          resolved: alerts.filter(a => a.isResolved).length
        },
        pagination: {
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
          total
        }
      }
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to load geofence alerts' };
  }
};

export const saveAlertHistory = async (
  alertId: string,
  _notes: string,
  _performedBy: string = 'current_user'
): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const cached = localStorage.getItem(GEOFENCE_ALERTS_CACHE_KEY);
    let alerts: GeofenceAlert[] = cached ? JSON.parse(cached) : [];
    
    alerts = alerts.map(a => {
      if (a._id === alertId || a.id === alertId || a.alertId === alertId) {
        return {
          ...a,
          isResolved: true
        };
      }
      return a;
    });

    localStorage.setItem(GEOFENCE_ALERTS_CACHE_KEY, JSON.stringify(alerts));
    return { success: true, message: 'Alert resolved successfully' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};
