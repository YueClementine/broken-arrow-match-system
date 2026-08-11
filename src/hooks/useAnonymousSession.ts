import { useEffect, useState } from 'react';
import { ensureAnonymousSession } from '../lib/supabase';

export function useAnonymousSession() {
  const [state, setState] = useState<{
    userId: string | null;
    loading: boolean;
    error: Error | null;
  }>({ userId: null, loading: true, error: null });

  useEffect(() => {
    let active = true;
    void ensureAnonymousSession().then(
      (userId) => active && setState({ userId, loading: false, error: null }),
      (error: unknown) => active && setState({
        userId: null,
        loading: false,
        error: error instanceof Error ? error : new Error('AUTH_REQUIRED'),
      }),
    );
    return () => { active = false; };
  }, []);

  return state;
}
