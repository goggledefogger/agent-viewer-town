import { useTick } from '../hooks/useTick';

/**
 * Formats a timestamp as a relative time string (e.g., "5m ago").
 */
export function relativeTime(timestamp: number): string {
  const delta = Math.floor((Date.now() - timestamp) / 1000);
  if (delta < 5) return 'just now';
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

interface RelativeTimeProps {
  timestamp: number;
  className?: string;
}

/**
 * A component that displays a relative time and updates every 5 seconds.
 * By using this component, periodic updates are isolated and do not cause
 * parent components to re-render.
 */
export function RelativeTime({ timestamp, className }: RelativeTimeProps) {
  useTick();
  return <span className={className}>{relativeTime(timestamp)}</span>;
}
