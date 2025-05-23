"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase/client'; // Using the import alias '@/'

type SupabaseContextType = {
  supabase: SupabaseClient | null;
  session: Awaited<ReturnType<SupabaseClient['auth']['getSession']>>['data']['session'] | null;
};

// Create the context with a default undefined value
const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined);

// Define the props for the provider component
interface SupabaseProviderProps {
  children: ReactNode;
}

export const SupabaseProvider = ({ children }: SupabaseProviderProps) => {
  // Initialize the Supabase client for browser interactions.
  // useState ensures the client is created only once per component instance.
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [session, setSession] = useState<SupabaseContextType['session']>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch the initial session.
    const getInitialSession = async () => {
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      setSession(initialSession);
      setLoading(false);
    };

    getInitialSession();

    // Listen for changes in authentication state (e.g., user logs in or out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, [supabase]); 

  const value: SupabaseContextType = {
    supabase,
    session,
  };

  return (
    <SupabaseContext.Provider value={value}>
      {!loading ? children : null /* a global loading indicator */}
    </SupabaseContext.Provider>
  );
};

export const useSupabase = (): SupabaseContextType => {
  const context = useContext(SupabaseContext);
  if (context === undefined) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return context;
};

