'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
const FeedbackContext = createContext<(message: string) => void>(() => {});
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState(''),
    notify = useCallback((value: string) => setMessage(value), [setMessage]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 4500);
    return () => clearTimeout(timer);
  }, [message]);
  return (
    <FeedbackContext.Provider value={notify}>
      {children}
      <div id="toast" className={message ? 'visible' : ''} role="status" aria-live="polite">
        {message}
      </div>
    </FeedbackContext.Provider>
  );
}
export const useNotify = () => useContext(FeedbackContext);
