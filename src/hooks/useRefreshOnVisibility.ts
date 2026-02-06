import { useCallback } from 'react';
import { usePageVisibility } from './usePageVisibility';

/**
 * Hook to refetch data when the page becomes visible
 * This allows components to refresh their data automatically when the user returns to the tab
 * 
 * @param onRefresh - Callback function to execute when page becomes visible
 * @param dependencies - Optional dependency array (similar to useEffect)
 * @param enabled - Whether the hook is enabled (default: true)
 */
export const useRefreshOnVisibility = (
  onRefresh: () => void | Promise<void>,
  dependencies: any[] = [],
  enabled: boolean = true
) => {
  const handleRefresh = useCallback(async () => {
    try {
      await onRefresh();
    } catch (error) {
      console.error('Error during visibility refresh:', error);
    }
  }, [...dependencies, onRefresh]);

  usePageVisibility(
    handleRefresh, // Called when page becomes visible
    undefined, // Called when page becomes hidden
    enabled
  );
};

export default useRefreshOnVisibility;
