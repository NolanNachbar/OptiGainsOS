import { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Dev-only escape hatch. Never honored in production builds.
    // Real login against the local Supabase stack as the seeded test athlete,
    // so RLS, auth.uid() and real persistence all behave exactly like prod.
    const isBypass = import.meta.env.DEV &&
      (localStorage.getItem('bypass_auth') === 'true' || window.location.search.includes('bypass_auth=true'));

    const init = async () => {
      if (isBypass) {
        localStorage.setItem('bypass_auth', 'true');
        const { error } = await supabase.auth.signInWithPassword({
          email: 'athlete@local.test',
          password: 'localpassword123',
        });
        if (error) console.error('[dev auto-login] failed, is the seeded test user present?', error.message);
      }
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
    };
    init();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const u = session?.user ?? null;
        setUser(u);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL || '/'}`,
      },
    });
    if (error) throw error;
    return data;
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      // Provide clearer error messages
      if (error.message === 'Invalid login credentials') {
        throw new Error('Invalid email or password. If you just signed up, please confirm your email first.');
      }
      if (error.message.includes('Email not confirmed')) {
        throw new Error('Please confirm your email before signing in. Check your inbox for a confirmation link.');
      }
      throw error;
    }
    return data;
  };

  const signOut = async () => {
    localStorage.removeItem('bypass_auth');
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) throw error;
    queryClient.clear();
  };

  const resetPassword = async (email) => {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${baseUrl}reset-password`,
    });
    if (error) throw error;
    return data;
  };

  const deleteAccount = async () => {
    if (!user) throw new Error('No user logged in');

    // Single transactional RPC — all deletes happen in one Postgres transaction.
    // If anything fails, the entire operation is rolled back (no orphaned data).
    const { error } = await supabase.rpc('delete_user_data');
    if (error) {
      console.error('Error deleting account:', error);
      throw new Error('Failed to delete account. Please try again or contact support.');
    }

    // Invalidate all sessions across all devices, not just the current one
    await supabase.auth.signOut({ scope: 'global' });
  };

  const value = {
    user,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    deleteAccount,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
