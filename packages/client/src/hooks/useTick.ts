import { useState, useEffect } from 'react';

let globalTick = 0;
const subscribers = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function startTimer() {
  if (intervalId) return;
  intervalId = setInterval(() => {
    globalTick++;
    subscribers.forEach((callback) => callback());
  }, 5000);
}

function stopTimer() {
  if (intervalId && subscribers.size === 0) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/**
 * A hook that provides a periodic update every 5 seconds.
 * Multiple components using this hook share a single interval.
 */
export function useTick() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const callback = () => setTick((t) => t + 1);
    subscribers.add(callback);
    startTimer();

    return () => {
      subscribers.delete(callback);
      stopTimer();
    };
  }, []);

  return globalTick;
}
