"use client";

import { useEffect } from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/app/supabase-provider';

export default function AuthPage() {
  const { supabase, session } = useSupabase();
  const router = useRouter();


  useEffect(() => {
    if (session) {
      router.push('/dashboard'); 
    }
  }, [session, router]);


  if (!supabase) {
    return <div className="flex justify-center items-center min-h-screen">Loading authentication...</div>;
  }
  

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-xl">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to InScribe AI
          </h2>
        </div>
        {/* 
          The Auth component handles various authentication flows.
          - supabaseClient: The Supabase client instance.
          - appearance: Allows customization of the UI elements. ThemeSupa is a good default.
          - providers: Specify OAuth providers you've enabled in Supabase (e.g., ['google', 'github']).
          - redirectTo: Where to redirect after successful sign-in/sign-up if not handled by onAuthStateChange.
                       However, onAuthStateChange in SupabaseProvider is usually better for this.
          - onlyThirdPartyProviders: Set to true if you only want to show OAuth buttons.
        */}
        <Auth
          supabaseClient={supabase}
          appearance={{ 
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: 'hsl(252 75% 60%)',
                  brandAccent: 'hsl(252 85% 65%)',
                },
              },
            },
          }}
          providers={['google']}
          localization={{
            variables: {
              sign_in: {
                email_label: 'Email address',
                password_label: 'Password',
              },
              sign_up: {
                email_label: 'Email address',
                password_label: 'Create a password',
              }
            }
          }}
          theme="light" // Or "dark"
        />
      </div>
    </div>
  );
}
