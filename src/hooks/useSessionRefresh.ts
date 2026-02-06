import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { usePageVisibility } from './usePageVisibility';

/**
 * Hook to refresh and validate the Supabase session when the page becomes visible
 * This ensures that expired sessions are renewed and the user is still authenticated
 * 
 * @param onSessionExpired - Callback function if session has expired
 * @param enabled - Whether the hook is enabled (default: true)
 */
export const useSessionRefresh = (
  onSessionExpired?: () => void,
  enabled: boolean = true
) => {
  const handleRefreshSession = async () => {
    try {
      // Attempt to refresh the current session
      const { data: { session }, error } = await supabase.auth.refreshSession();

      if (error || !session) {
        console.warn('Session refresh failed:', error?.message);
        // Session expired or invalid
        onSessionExpired?.();
        return false;
      }

      // Verify session is still valid
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        console.warn('User validation failed:', userError?.message);
        onSessionExpired?.();
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error refreshing session:', error);
      return false;
    }
  };

  usePageVisibility(
    handleRefreshSession, // Called when page becomes visible
    undefined, // Called when page becomes hidden
    enabled
  );

  return { handleRefreshSession };
};

export default useSessionRefresh;
