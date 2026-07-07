import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { authApi } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still loading, null = not logged in, object = logged in

  useEffect(() => {
    let cancelled = false;
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email,
          fullName: session.user.user_metadata?.full_name || '',
        });
      } else {
        setUser(null);
      }
    }).catch(() => {
      if (!cancelled) setUser(null);
    });

    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };
    
    setUser({
      id: data.user.id,
      email: data.user.email,
      fullName: data.user.user_metadata?.full_name || '',
    });
    authApi.login({ email: data.user.email, supabaseUserId: data.user.id }).catch(() => {});
    
    return { success: true };
  }, []);

  const register = useCallback(async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { success: false, error: error.message };

    if (data.user) {
      setUser({
        id: data.user.id,
        email: data.user.email,
        fullName,
      });
      authApi.register({ email: data.user.email, supabaseUserId: data.user.id, fullName }).catch(() => {});
    }
    return { success: true };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading: user === undefined,
      login, register, logout, 
      isAuthenticated: !!user, // Only true when user is an object, false for both null and undefined
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;