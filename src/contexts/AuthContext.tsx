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
  cpf?: string;
  metadata?: Record<string, any>;
}

interface AuthContextValue {
  session: Session | null;
  profile: ProfileRow | null;
  loading: boolean;          // initial session restore
  profileError: string | null;
  role: Role | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  resetPasswordForEmail: (email: string) => Promise<{ error?: string }>;
  updatePassword: (password: string) => Promise<{ error?: string }>;
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
  const [profileError, setProfileError] = useState<string | null>(null);
  const fetchingFor = useRef<string | null>(null);
  const sessionUserId = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    fetchingFor.current = userId;
    setProfileError(null);
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (fetchingFor.current !== userId) return; // stale result — user changed mid-flight
      // Keep a previously loaded profile during a transient refresh failure, but
      // expose the error when there is no profile to render yet.
      if (error) {
        setProfileError(error.message || 'Não foi possível carregar seu perfil.');
        return;
      }
      if (data) setProfile(data as ProfileRow);
      else {
        setProfile(null);
        setProfileError('Seu perfil ainda não está disponível.');
      }
    } catch (error: any) {
      if (fetchingFor.current === userId) {
        setProfileError(error?.message || 'Não foi possível carregar seu perfil.');
      }
    }
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
      if (data.session?.user) {
        sessionUserId.current = data.session.user.id;
        await loadProfile(data.session.user.id);
      } else {
        sessionUserId.current = null;
        setProfile(null);
        setProfileError(null);
      }
      setLoading(false);
    }).catch(() => {
      clearTimeout(abort);
      fetchingFor.current = null;
      sessionUserId.current = null;
      setSession(null);
      setProfile(null);
      setProfileError(null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      const nextUserId = newSession?.user?.id ?? null;
      const userChanged = sessionUserId.current !== nextUserId;
      sessionUserId.current = nextUserId;
      setSession(newSession);
      setProfileError(null);
      if (newSession?.user) {
        if (userChanged) setProfile(null);
        // Do not await Supabase work inside onAuthStateChange. Supabase can
        // serialize auth operations and awaiting another query here may stall
        // the whole app during startup or notification resume.
        void loadProfile(newSession.user.id);
      } else {
        fetchingFor.current = null;
        setProfile(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) return { error: error.message };

    // The mobile app is intentionally limited to passengers and drivers.
    // Admins and managers authenticate through their respective web panels.
    const { data: signedProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profileError) {
      await supabase.auth.signOut();
      return { error: profileError.message };
    }
    if (!signedProfile || !['driver', 'passenger'].includes(signedProfile.role)) {
      await supabase.auth.signOut();
      return { error: 'Este acesso é exclusivo para motorista e passageiro. Gerentes e administradores devem entrar pelo site.' };
    }
    return {};
  };
  const resetPasswordForEmail: AuthContextValue['resetPasswordForEmail'] = async (email) => {
    const redirectTo = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL
      || 'rotta-urbana://auth/reset-password';
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo,
    });
    return error ? { error: error.message } : {};
  };

  const updatePassword: AuthContextValue['updatePassword'] = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    return error ? { error: error.message } : {};
  };

  const signUp: AuthContextValue['signUp'] = async (input) => {
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: {
        data: {
          full_name: input.fullName.trim(),
          phone: input.phone.trim(),
          role: input.role,
          ...(input.gender ? { gender: input.gender } : {}),
          ...(input.cpf ? { cpf: input.cpf.replace(/\D/g, '') } : {}),
          ...(input.metadata || {}),
        },
      },
    });
    if (error) return { error: error.message };
    // With e-mail auto-confirm on, signUp returns a session and the navigator
    // routes automatically. As a safety net (e.g. confirmation briefly on), if
    // no session came back, sign in right away so the user isn't left stranded.
    if (!data.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: input.email.trim().toLowerCase(),
        password: input.password,
      });
      if (signInError) return { error: signInError.message };
    }
    return {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    fetchingFor.current = null;
    sessionUserId.current = null;
    setProfile(null);
    setProfileError(null);
  };

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, profileError, role: profile?.role ?? null, signIn, resetPasswordForEmail, updatePassword, signUp, signOut, refreshProfile }}
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
