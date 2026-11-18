import { useEffect, useState } from 'react';
import { startOfDay } from './milestones';

/** 返回"今天";跨过零点或页面重新可见时自动刷新 */
export function useToday(): Date {
  const [today, setToday] = useState(() => startOfDay(new Date()));
  useEffect(() => {
    const refresh = () => {
      const now = startOfDay(new Date());
      setToday((prev) => (prev.getTime() === now.getTime() ? prev : now));
    };
    const timer = setInterval(refresh, 60 * 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return today;
}
