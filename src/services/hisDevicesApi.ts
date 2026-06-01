const DEFAULT_HIS_DEVICES_API_URL = 'http://127.0.0.1:8997';
const HIS_DEVICES_REQUEST_TIMEOUT_MS = 5000;

type EnvLike = Record<string, string | undefined>;

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

export interface HisDashboardStats {
  patients_using: number;
  machines_total: number;
  machines_in_use: number;
  machines_available: number;
  machines_maintenance: number;
  categories: Array<{ code: string; name: string; count: number }>;
}

export interface HisDepartmentDashboardDevice {
  machine_code: string;
  machine_name: string;
  category_name?: string;
  room_code?: string;
  patient_name?: string;
  his_treatment_code?: string;
  started_at?: string;
}

export interface HisDepartmentDashboardRoom {
  room_code: string;
  total: number;
  in_use: number;
  available: number;
  maintenance: number;
}

export interface HisDepartmentDashboardItem {
  department_code: string;
  department_name: string;
  total: number;
  in_use: number;
  available: number;
  maintenance: number;
  rooms: HisDepartmentDashboardRoom[];
  devices: {
    in_use: HisDepartmentDashboardDevice[];
    available: HisDepartmentDashboardDevice[];
    maintenance: HisDepartmentDashboardDevice[];
  };
}

export interface HisDepartmentDashboard {
  summary: {
    departments: number;
    machines_total: number;
    in_use: number;
    available: number;
    maintenance: number;
  };
  departments: HisDepartmentDashboardItem[];
}

export interface HisDeviceUsage {
  usage_id: string;
  started_at: string;
  service_name: string;
  ordered_by_name: string;
  department_code: string;
  machine_code: string;
  machine_name: string;
  category_name: string;
  category_code: string;
  his_treatment_code: string;
  patient_name?: string;
  patient_code?: string;
  department_name?: string;
}

export interface HisDepartment {
  code: string;
  name: string;
}

export interface HisCategory {
  code: string;
  name: string;
  description?: string;
}

export interface HisSyncStatus {
  started_at?: string;
  finished_at?: string;
  status?: string;
  total_records?: number;
  changed_records?: number;
  error_message?: string;
}

const runtimeEnv = (): EnvLike => {
  const viteEnv = import.meta.env as EnvLike | undefined;
  return viteEnv || {};
};

export const getHisDevicesApiBaseUrl = (env: EnvLike = runtimeEnv()) => {
  return (env.VITE_HIS_DEVICES_API_URL || DEFAULT_HIS_DEVICES_API_URL).replace(/\/+$/, '');
};

export const buildHisDevicesUrl = (
  path: string,
  params: Record<string, string | number | undefined | null> = {},
  baseUrl = getHisDevicesApiBaseUrl()
) => {
  const url = new URL(path, `${baseUrl.replace(/\/+$/, '')}/`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
};

export const unwrapHisDevicesResponse = <T>(body: ApiEnvelope<T> | T): T => {
  if (body && typeof body === 'object' && 'success' in body) {
    const envelope = body as ApiEnvelope<T>;
    if (envelope.success === false) {
      throw new Error(envelope.message || 'HIS devices API returned an error');
    }
    return envelope.data as T;
  }
  return body as T;
};

const fetchHisDevices = async <T>(path: string, params?: Record<string, string | number | undefined | null>) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), HIS_DEVICES_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(buildHisDevicesUrl(path, params), { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HIS devices API HTTP ${response.status}`);
    }
    const body = await response.json();
    return unwrapHisDevicesResponse<T>(body);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('HIS devices API request timed out');
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const fetchHisDashboardStats = (dept?: string) => {
  return fetchHisDevices<HisDashboardStats>('/api/dashboard/stats', { dept });
};

export const fetchHisDepartmentDashboard = (filters: {
  dept?: string;
  category?: string;
} = {}) => {
  return fetchHisDevices<HisDepartmentDashboard>('/api/dashboard/departments', {
    dept: filters.dept,
    category: filters.category,
  });
};

export const fetchHisDeviceUsages = (filters: {
  dept?: string;
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}) => {
  return fetchHisDevices<HisDeviceUsage[]>('/api/devices/in-use', {
    page: filters.page ?? 1,
    limit: filters.limit ?? 100,
    dept: filters.dept,
    category: filters.category,
    search: filters.search,
  });
};

export const fetchHisDepartments = () => {
  return fetchHisDevices<HisDepartment[]>('/api/departments');
};

export const fetchHisCategories = () => {
  return fetchHisDevices<HisCategory[]>('/api/categories');
};

export const fetchHisSyncStatus = () => {
  return fetchHisDevices<HisSyncStatus | null>('/api/sync/status');
};
