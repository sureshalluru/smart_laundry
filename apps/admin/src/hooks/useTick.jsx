import { useEffect, useState } from 'react';

export const useTick = (intervalMs = 1000) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);
};
