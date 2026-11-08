'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { browserSupabase } from '@/lib/supabase/client';

/** Signs out on this device and returns to the sign-in page. */
export function SignOutButton() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'pending' | 'failed'>('idle');

  async function signOut() {
    setState('pending');
    // Local scope clears this browser's session even if the network is down.
    const { error } = await browserSupabase().auth.signOut({ scope: 'local' });
    if (error) {
      setState('failed');
      return;
    }
    router.replace('/login?error=signed_out');
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2">
      {state === 'failed' ? (
        <span role="alert" className="text-sm text-danger">
          Sign-out failed.
        </span>
      ) : null}
      <Button
        variant="ghost"
        className="text-sm"
        pending={state === 'pending'}
        pendingLabel="Signing out…"
        onClick={signOut}
      >
        {state === 'failed' ? 'Try again' : 'Sign out'}
      </Button>
    </span>
  );
}
