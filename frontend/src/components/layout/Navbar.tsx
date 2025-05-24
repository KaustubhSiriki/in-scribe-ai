'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/app/supabase-provider';
import { Sun, Moon } from 'lucide-react';

export default function Navbar({
  isDark,
  toggleDark,
}: {
  isDark: boolean;
  toggleDark: () => void;
}) {
  const { supabase, session } = useSupabase();
  const router = useRouter();

  const handleSignOut = async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Error signing out:', error.message);
      } else {
        router.push('/');
        router.refresh();
      }
    }
  };

  return (
    <nav className='sticky top-0 z-50 w-full bg-black/10 backdrop-blur border-b border-white/10 shadow-lg'>
      <div className='container mx-auto flex items-center justify-between h-16 px-4'>
        <Link
          href='/'
          className='text-2xl font-bold text-accent-primary tracking-tight hover:opacity-80 transition'
        >
          InScribe AI
        </Link>
        <div className='flex items-center gap-4'>
          {session ? (
            <>
              <Link
                href='/dashboard'
                className='text-text-secondary hover:text-accent-primary px-3 py-2 rounded-md text-sm font-medium transition'
              >
                Dashboard
              </Link>
              <span className='text-text-secondary text-sm hidden sm:block'>
                Hi, {session.user?.email?.split('@')[0] || 'User'}!
              </span>
              <button
                onClick={handleSignOut}
                className='bg-accent-primary hover:bg-accent-secondary text-white px-3 py-2 rounded-md text-sm font-medium transition'
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link
              href='/auth'
              className='bg-accent-primary hover:bg-accent-secondary text-white px-3 py-2 rounded-md text-sm font-medium transition'
            >
              Sign In / Register
            </Link>
          )}
          <button
            onClick={toggleDark}
            aria-label='Toggle dark mode'
            className='p-2 rounded hover:bg-accent-primary/10 transition'
          >
            {isDark ? (
              <Sun size={20} className='text-accent-primary' />
            ) : (
              <Moon size={20} />
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}
