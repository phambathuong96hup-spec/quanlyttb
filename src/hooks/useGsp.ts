import { useApiResource } from './useApiResource';
import { fetchGspRecords, type GspRecord } from '../services/api';

export interface UseGspReturn {
  records: GspRecord[];
  isLoading: boolean;
  error: Error | null;
  /** Force a fresh fetch, ignoring the cache. Updates all consumers. */
  refetch: () => Promise<void>;
  /** Optimistic update: replace cached data without a network call. */
  mutate: (data: GspRecord[]) => void;
}

export function useGsp(): UseGspReturn {
  const { data, isLoading, error, refetch, mutate } = useApiResource<GspRecord>(
    'gsp',
    fetchGspRecords
  );

  return {
    records: data,
    isLoading,
    error,
    refetch,
    mutate,
  };
}
