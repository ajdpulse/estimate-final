import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User, AuthContextType } from '../types';
import { initializeAuthReceiver } from '../utils/authReceiver'; // ✅ ADD
import { usePageVisibility } from '../hooks/usePageVisibility'; // ✅ ADD for tab visibility

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          role_id,
          roles (
            id,
            name,
            description
          )
        `)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user role:', error);
        return null;
      }

      if (data && data.roles) {
        const roleData = Array.isArray(data.roles) ? data.roles[0] : data.roles;
        return {
          id: roleData.id,
          name: roleData.name,
          description: roleData.description
        };
      }

      return null;
    } catch (error) {
      console.error('Error in fetchUserRole:', error);
      return null;
    }
  };

  const setUserWithRole = async (authUser: any) => {
    const role = await fetchUserRole(authUser.id);
    const hasFullAccess =
      role?.name === 'developer' || role?.name === 'super_admin';

    setUser({
      ...authUser,
      role,
      hasFullAccess
    } as User);
  };

  // ✅ NEW: Handle page visibility to refresh session when tab becomes active
  const handlePageVisible = async () => {
    console.log('Page became visible, refreshing session...');
    try {
      // Refresh the session to ensure tokens are still valid
      const { data: { session }, error } = await supabase.auth.refreshSession();

      if (error) {
        console.error('Session refresh failed:', error);
        // If refresh fails, try to get current session
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession?.user) {
          await setUserWithRole(currentSession.user);
        }
        return;
      }

      if (session?.user) {
        await setUserWithRole(session.user);
      }
    } catch (error) {
      console.error('Error refreshing session on page visibility:', error);
    }
  };

  // ✅ NEW: Use page visibility hook to refresh session
  usePageVisibility(
    handlePageVisible, // onVisible callback
    undefined, // onHidden callback
    true // enabled
  );

  useEffect(() => {
    let subscription: any;

    const initAuth = async () => {
      try {
        // ✅ 1. VERY IMPORTANT: run auth receiver FIRST
        await initializeAuthReceiver('estimate');

        // ✅ 2. Then read session AFTER receiver sets tokens
        const { data: { session }, error } =
          await supabase.auth.getSession();

        if (error) {
          console.error('Error getting session:', error);
          await supabase.auth.signOut();
        } else if (session?.user) {
          await setUserWithRole(session.user);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        try {
          await supabase.auth.signOut();
        } catch (signOutError) {
          console.error('Error clearing stale session:', signOutError);
        }
      } finally {
        setLoading(false);
      }

      // ✅ 3. Auth state listener (unchanged behavior)
      const { data } = supabase.auth.onAuthStateChange(
        async (_event, session) => {
          try {
            if (session?.user) {
              await setUserWithRole(session.user);
            } else {
              setUser(null);
            }
          } catch (error) {
            console.error('Error in auth state change:', error);
          } finally {
            setLoading(false);
          }
        }
      );

      subscription = data.subscription;
    };

    initAuth();

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      setUser(null);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('Error signing out:', error);
      setUser(null);
      throw error;
    }
  };

  const hasPermission = (_permission: string): boolean => {
    if (user?.hasFullAccess) return true;
    return true;
  };

  const hasFullAccess = (): boolean => {
    return user?.hasFullAccess || false;
  };

  const value: AuthContextType = {
    user,
    loading,
    signIn,
    signOut,
    hasPermission,
    hasFullAccess,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
