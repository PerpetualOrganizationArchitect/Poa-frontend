import { useCallback, useEffect, useState } from 'react';
import { fetchLandingInflows } from '@/services/web3/domain/LandingInflowService';

export default function useLandingInflows() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({
    isLoading: true,
    status: 'loading',
    formattedUsd: null,
  });

  useEffect(() => {
    let active = true;
    fetchLandingInflows().then((value) => {
      if (active) setState({ ...value, isLoading: false, status: 'ready' });
    }).catch(() => {
      // Keep failures distinct from a valid zero; never show a partial chain sum.
      if (active) setState({ isLoading: false, status: 'unavailable', formattedUsd: null });
    });
    return () => { active = false; };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ isLoading: true, status: 'loading', formattedUsd: null });
    setAttempt((value) => value + 1);
  }, []);

  return { ...state, retry };
}
