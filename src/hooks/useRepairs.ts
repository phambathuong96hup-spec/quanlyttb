import { useApiResource } from './useApiResource';
import { fetchRepairs, type RepairData } from '../services/api';

export interface UseRepairsReturn {
  repairs: RepairData[];
  isLoading: boolean;
  error: Error | null;
  /** Force a fresh fetch, ignoring the cache. Updates all consumers. */
  refetch: () => Promise<void>;
  /** Optimistic update: replace cached data without a network call. */
  mutate: (data: RepairData[]) => void;
}

export function useRepairs(): UseRepairsReturn {
  const { data, isLoading, error, refetch, mutate } = useApiResource<RepairData>(
    'repairs',
    fetchRepairs
  );

  return {
    repairs: data,
    isLoading,
    error,
    refetch,
    mutate,
  };
}
