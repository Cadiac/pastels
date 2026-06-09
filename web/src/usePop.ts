import { useEffect, useRef, useState } from "react";

/**
 * Springy feedback for value changes. Returns a `key` (bump it on the element
 * so the animation restarts on rapid changes) and the animation class.
 * Doesn't fire on the initial render, or when async data first arrives.
 */
export function usePop(value: unknown): { key: number; className: string } {
  const [key, setKey] = useState(0);
  const prev = useRef(value);

  useEffect(() => {
    if (Object.is(prev.current, value)) return;
    const wasUndefined = prev.current === undefined;
    prev.current = value;
    if (!wasUndefined) setKey((k) => k + 1);
  }, [value]);

  return { key, className: key > 0 ? "animate-pop" : "" };
}
