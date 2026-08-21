import { useEffect, useState } from 'react';

export function usePersistentState(key, initialValue, legacyKeys = []) {
  const [value, setValue] = useState(() => {
    for (const storageKey of [key, ...legacyKeys]) {
      try {
        const stored = window.localStorage.getItem(storageKey);
        if (stored !== null) return JSON.parse(stored);
      } catch {
        // Continue with the next migration key or the default value.
      }
    }
    return initialValue;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The application remains usable when storage is unavailable.
    }
  }, [key, value]);

  return [value, setValue];
}
