'use client';
import { useState } from 'react';
import { useAdminAction } from '../shared';
import { errorMessage } from '@/lib/api/contracts';
import type { AdminCommand } from '@/lib/domain/types';

/** Runs an admin command outside a Form and keeps the failure message for the caller to show. */
export function useGuardedRun() {
  const action = useAdminAction(),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  return {
    error,
    pending,
    go: async (command: AdminCommand, message: string) => {
      if (pending) return false;
      setError('');
      setPending(true);
      try {
        await action.run(command, message);
        return true;
      } catch (e) {
        setError(errorMessage(e));
        return false;
      } finally {
        setPending(false);
      }
    },
  };
}
