import { useSyncExternalStore } from 'react';

/**
 * Subscribes to a CSS media query using React's external store primitive.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (onStoreChange: () => void) => {
    if (typeof window === 'undefined') {
      return () => {};
    }
    const media = window.matchMedia(query);
    media.addEventListener('change', onStoreChange);
    return () => media.removeEventListener('change', onStoreChange);
  };

  const getSnapshot = () =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false;

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
