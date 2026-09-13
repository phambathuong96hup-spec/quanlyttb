import { useApiResource, type ApiResourceMutation } from './useApiResource';
import { fetchDevices, type DeviceData } from '../services/api';

export interface UseDevicesReturn {
  devices: DeviceData[];
  isLoading: boolean;
  error: Error | null;
  lastUpdated: number | null;
  /** Force a fresh fetch, ignoring the cache. Updates all consumers. */
  refetch: () => Promise<void>;
  /** Optimistic update: replace cached data without a network call. */
  mutate: (mutation: ApiResourceMutation<DeviceData>) => void;
}

export function useDevices(): UseDevicesReturn {
  const { data, isLoading, error, lastUpdated, refetch, mutate } = useApiResource<DeviceData>(
    'devices',
    fetchDevices
  );

  return {
    devices: data,
    isLoading,
    error,
    lastUpdated,
    refetch,
    mutate,
  };
}
