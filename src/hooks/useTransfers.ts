import { useApiResource } from './useApiResource';
import { fetchTransfers, type TransferData } from '../services/api';

export interface UseTransfersReturn {
  transfers: TransferData[];
  isLoading: boolean;
  error: Error | null;
  /** Force a fresh fetch, ignoring the cache. Updates all consumers. */
  refetch: () => Promise<void>;
  /** Optimistic update: replace cached data without a network call. */
  mutate: (data: TransferData[]) => void;
}

export function useTransfers(): UseTransfersReturn {
  const { data, isLoading, error, refetch, mutate } = useApiResource<TransferData>(
    'transfers',
    fetchTransfers
  );

  return {
    transfers: data,
    isLoading,
    error,
    refetch,
    mutate,
  };
}
