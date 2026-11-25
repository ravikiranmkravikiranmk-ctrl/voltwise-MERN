import { useCallback, useRef, useState } from 'react';

/** Minimal toast queue: push({ kind, text }) — auto-dismisses. */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((text, kind = 'info', ms = 3800) => {
    seq.current += 1;
    const id = seq.current;
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    if (ms) setTimeout(() => dismiss(id), ms);
  }, [dismiss]);
  return { toasts, push, dismiss };
}
