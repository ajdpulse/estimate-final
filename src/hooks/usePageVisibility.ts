import { useEffect, useCallback } from 'react';

/**
 * Hook to detect when the page becomes visible or hidden
 * Useful for resuming operations when the user returns to the tab
 * 
 * @param onVisible - Callback function when page becomes visible
 * @param onHidden - Callback function when page becomes hidden
 * @param enabled - Whether the hook is enabled (default: true)
 */
export const usePageVisibility = (
  onVisible?: () => void,
  onHidden?: () => void,
  enabled: boolean = true
) => {
  const handleVisibilityChange = useCallback(() => {
    if (!enabled) return;

    if (document.hidden) {
      onHidden?.();
    } else {
      onVisible?.();
    }
  }, [onVisible, onHidden, enabled]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleVisibilityChange, enabled]);

  return document.hidden;
};

export default usePageVisibility;
