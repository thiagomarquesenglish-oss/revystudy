import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { invalidateCache } from '@/lib/storage';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_TIMEOUT_MS = 12_000;

function withAuthTimeout<T>(operation: Promise<T>, message: string): Promise<T> {
  return Promise.race([
    operation,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), AUTH_TIMEOUT_MS);
    }),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    // Never let the app sit on "Carregando..." forever if the network or
    // storage is misbehaving (happened on the installed PWA).
    const failsafe = setTimeout(() => setLoading(false), 8000);

    withAuthTimeout(
      supabase.auth.getSession(),
      'Não foi possível verificar sua sessão. Confira a conexão e tente novamente.',
    )
      .then(({ data: { session } }) => {
        setSession(session);
      })
      .catch((err) => {
        console.error('[Auth] getSession failed:', err);
      })
      .finally(() => {
        clearTimeout(failsafe);
        setLoading(false);
      });

    return () => {
      clearTimeout(failsafe);
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string) => {
    try {
      const { error } = await withAuthTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        }),
        'O cadastro demorou demais. Confira a conexão e tente novamente.',
      );
      return { error: error as Error | null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Não foi possível criar a conta.') };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await withAuthTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        'O login demorou demais. Confira a conexão e tente novamente.',
      );
      return { error: error as Error | null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Não foi possível entrar.') };
    }
  };

  const signOut = async () => {
    invalidateCache();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
