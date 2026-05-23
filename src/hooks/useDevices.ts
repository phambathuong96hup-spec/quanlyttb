import { useApiResource } from './useApiResource';
import { fetchDevices, type DeviceData } from '../services/api';

export interface UseDevicesReturn {
  devices: DeviceData[];
  isLoading: boolean;
  error: Error | null;
  /** Force a fresh fetch, ignoring the cache. Updates all consumers. */
  refetch: () => Promise<void>;
  /** Optimistic update: replace cached data without a network call. */
  mutate: (data: DeviceData[]) => void;
}

export function useDevices(): UseDevicesReturn {
  const { data, isLoading, error, refetch, mutate } = useApiResource<DeviceData>(
    'devices',
    fetchDevices
  );

  return {
    devices: data,
    isLoading,
    error,
    refetch,
    mutate,
  };
}
