import { useEffect, useState } from 'react';
import type { StoredData } from '../lib/storage';

/** A chrome.storage.local value that re-renders when the service worker changes it. `undefined` until first read. */
export function useStored<K extends keyof StoredData>(key: K): { loaded: boolean; value: StoredData[K] } {
  const [state, setState] = useState<{ loaded: boolean; value: StoredData[K] }>({ loaded: false, value: undefined });
  useEffect(() => {
    let live = true;
    chrome.storage.local.get(key).then((result) => {
      if (live) setState({ loaded: true, value: result[key] as StoredData[K] });
    });
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && key in changes) setState({ loaded: true, value: changes[key].newValue as StoredData[K] });
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      live = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, [key]);
  return state;
}

/** A short-lived message ("Link copied"). */
export function useToast(): [string | undefined, (message: string) => void] {
  const [message, setMessage] = useState<string>();
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(undefined), 1800);
    return () => clearTimeout(timer);
  }, [message]);
  return [message, setMessage];
}
