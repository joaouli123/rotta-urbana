import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { ProfileRow, Role, Gender } from '../types/db';

interface SignUpInput {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  role: Extract<Role, 'passenger' | 'driver'>;
  gender?: Gender;
}

interface AuthContextValue {
  session: Session | null;
  profile: ProfileRow | null;
  loading: boolean;          // initial session restore
  role: Role | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (input: SignUpInput) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Keep tokens fresh while the app is foregrounded.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchingFor = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    fetchingFor.current = userId;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (fetchingFor.current !== userId) return; // stale result — user changed mid-flight
    // Only update on success. On transient errors keep whatever was loaded before so
    // a network hiccup during token-refresh doesn't flash the auth screen.
    if (!error && data) setProfile(data as ProfileRow);
    else if (!error && !data) setProfile(null); // profile truly absent (new user edge case)
  }, []);

  useEffect(() => {
    // 10-second safety valve: if getSession() hangs (network, token refresh, etc.)
    // we bail out with no session so the app never shows infinite loading.
    const abort = setTimeout(() => {
      setLoading(false);
    }, 10_000);

    supabase.auth.getSession().then(async ({ data }) => {
      clearTimeout(abort);
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    }).catch(() => {
      clearTimeout(abort);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) await loadProfile(newSession.user.id);
      else setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    return error ? { error: error.message } : {};
  };

  const signUp: AuthContextValue['signUp'] = async (input) => {
    const { error } = await supabase.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: {
        data: {
          full_name: input.fullName.trim(),
          phone: input.phone.trim(),
          role: input.role,
          ...(input.gender ? { gender: input.gender } : {}),
        },
      },
    });
    return error ? { error: error.message } : {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, role: profile?.role ?? null, signIn, signUp, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
