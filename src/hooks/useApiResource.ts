import { useState, useEffect, useCallback, useRef } from 'react';

const CACHE_TTL = 5 * 60 * 1000;

interface CacheState<T> {
  data: T[];
  timestamp: number;
}

export type ApiResourceMutation<T> = T[] | ((currentData: T[]) => T[]);

// Global maps for registry (to keep static state in the module scope)
const cacheRegistry = new Map<string, CacheState<unknown>>();
const promiseRegistry = new Map<string, Promise<unknown[]>>();
const subscriberRegistry = new Map<string, Set<() => void>>();
let sessionGeneration = 0;

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
  sessionGeneration += 1;
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
  const [lastUpdated, setLastUpdated] = useState<number | null>(() => cacheRegistry.get(key)?.timestamp ?? null);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const hookGeneration = sessionGeneration;

  const syncFromCache = useCallback(() => {
    if (mountedRef.current) {
      setData(getCacheData());
      setLastUpdated(cacheRegistry.get(key)?.timestamp ?? null);
      setError(null);
      setIsLoading(false);
    }
  }, [getCacheData, key]);

  const loadData = useCallback(async (): Promise<T[]> => {
    const generation = sessionGeneration;
    // Deduplicate: if a request is already in-flight, reuse it
    let pendingPromise = promiseRegistry.get(key) as Promise<T[]> | undefined;
    if (pendingPromise) return pendingPromise;

    pendingPromise = fetchFn()
      .then((fetchedData) => {
        if (generation !== sessionGeneration) return [];
        cacheRegistry.set(key, { data: fetchedData, timestamp: Date.now() });
        promiseRegistry.delete(key);
        notifySubscribers(key);
        return fetchedData;
      })
      .catch((err) => {
        if (generation !== sessionGeneration) return [];
        promiseRegistry.delete(key);
        throw err;
      });

    promiseRegistry.set(key, pendingPromise);
    return pendingPromise;
  }, [key, fetchFn]);

  useEffect(() => {
    const generation = sessionGeneration;
    let active = true;
    mountedRef.current = true;
    const subs = getSubscribers(key);
    subs.add(syncFromCache);

    if (!isCacheValid(key)) {
      setIsLoading(true);
      loadData()
        .then((fetchedData) => {
          if (active && mountedRef.current && generation === sessionGeneration) {
            setData(fetchedData);
            setIsLoading(false);
            setError(null);
          }
        })
        .catch((err) => {
          if (active && mountedRef.current && generation === sessionGeneration) {
            setError(err instanceof Error ? err : new Error(String(err)));
            setIsLoading(false);
          }
        });
    } else {
      syncFromCache();
    }

    return () => {
      active = false;
      mountedRef.current = false;
      subs.delete(syncFromCache);
    };
  }, [key, syncFromCache, loadData]);

  const refetch = useCallback(async () => {
    const generation = sessionGeneration;
    if (hookGeneration !== sessionGeneration) return;
    setIsLoading(true);
    setError(null);
    try {
      const fetchedData = await loadData();
      if (mountedRef.current && generation === sessionGeneration) {
        setData(fetchedData);
        setIsLoading(false);
      }
    } catch (err) {
      if (mountedRef.current && generation === sessionGeneration) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      }
    }
  }, [hookGeneration, loadData]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const refreshStale = () => {
      if (document.visibilityState === 'visible' && !isCacheValid(key)) void refetch();
    };
    document.addEventListener('visibilitychange', refreshStale);
    return () => document.removeEventListener('visibilitychange', refreshStale);
  }, [key, refetch]);

  const mutate = useCallback((mutation: ApiResourceMutation<T>) => {
    if (hookGeneration !== sessionGeneration) return;
    const currentData = (cacheRegistry.get(key)?.data as T[] | undefined) ?? [];
    const newData = typeof mutation === 'function' ? mutation(currentData) : mutation;
    cacheRegistry.set(key, { data: newData, timestamp: Date.now() });
    notifySubscribers(key);
  }, [key, hookGeneration]);

  return { data, isLoading, error, lastUpdated, refetch, mutate };
}
