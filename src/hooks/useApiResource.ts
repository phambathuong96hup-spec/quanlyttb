import { useState, useEffect, useCallback, useRef } from 'react';

const CACHE_TTL = 5 * 60 * 1000;

interface CacheState<T> {
  data: T[];
  timestamp: number;
}

// Global maps for registry (to keep static state in the module scope)
const cacheRegistry = new Map<string, CacheState<unknown>>();
const promiseRegistry = new Map<string, Promise<unknown[]>>();
const subscriberRegistry = new Map<string, Set<() => void>>();

function getSubscribers(key: string): Set<() => void> {
  if (!subscriberRegistry.has(key)) {
    subscriberRegistry.set(key, new Set());
  }
  return subscriberRegistry.get(key)!;
}

function notifySubscribers(key: string) {
  getSubscribers(key).forEach((cb) => cb());
}

function isCacheValid(key: string): boolean {
  const cache = cacheRegistry.get(key);
  return cache !== undefined && Date.now() - cache.timestamp < CACHE_TTL;
}

export function clearApiResourceCache() {
  cacheRegistry.clear();
  promiseRegistry.clear();
  subscriberRegistry.forEach((subs) => {
    subs.forEach((cb) => cb());
  });
}


export function useApiResource<T>(
  key: string,
  fetchFn: () => Promise<T[]>
) {
  const getCacheData = useCallback((): T[] => {
    return (cacheRegistry.get(key)?.data as T[] | undefined) ?? [];
  }, [key]);

  const [data, setData] = useState<T[]>(getCacheData);
  const [isLoading, setIsLoading] = useState(!isCacheValid(key));
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const syncFromCache = useCallback(() => {
    if (mountedRef.current) {
      setData(getCacheData());
      setIsLoading(false);
    }
  }, [getCacheData]);

  const loadData = useCallback(async (): Promise<T[]> => {
    // Deduplicate: if a request is already in-flight, reuse it
    let pendingPromise = promiseRegistry.get(key) as Promise<T[]> | undefined;
    if (pendingPromise) return pendingPromise;

    pendingPromise = fetchFn()
      .then((fetchedData) => {
        cacheRegistry.set(key, { data: fetchedData, timestamp: Date.now() });
        promiseRegistry.delete(key);
        notifySubscribers(key);
        return fetchedData;
      })
      .catch((err) => {
        promiseRegistry.delete(key);
        throw err;
      });

    promiseRegistry.set(key, pendingPromise);
    return pendingPromise;
  }, [key, fetchFn]);

  useEffect(() => {
    mountedRef.current = true;
    const subs = getSubscribers(key);
    subs.add(syncFromCache);

    if (!isCacheValid(key)) {
      setIsLoading(true);
      loadData()
        .then((fetchedData) => {
          if (mountedRef.current) {
            setData(fetchedData);
            setIsLoading(false);
            setError(null);
          }
        })
        .catch((err) => {
          if (mountedRef.current) {
            setError(err instanceof Error ? err : new Error(String(err)));
            setIsLoading(false);
          }
        });
    } else {
      syncFromCache();
    }

    return () => {
      mountedRef.current = false;
      subs.delete(syncFromCache);
    };
  }, [key, syncFromCache, loadData]);

  const refetch = useCallback(async () => {
    cacheRegistry.delete(key);
    setIsLoading(true);
    setError(null);
    try {
      const fetchedData = await loadData();
      if (mountedRef.current) {
        setData(fetchedData);
        setIsLoading(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      }
    }
  }, [key, loadData]);

  const mutate = useCallback((newData: T[]) => {
    cacheRegistry.set(key, { data: newData, timestamp: Date.now() });
    notifySubscribers(key);
  }, [key]);

  return { data, isLoading, error, refetch, mutate };
}
