"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** The caller must supply checked UTF-8 bytes, never an unchecked model stream. */
export type CheckedStreamSource = (
  signal: AbortSignal,
) => Promise<ReadableStream<Uint8Array>>;

/** Explicit start/cancel; no fetching or automatic rendering. A new start cancels the old one. */
export function useStream() {
  const current = useRef<{
    controller: AbortController;
    reader?: ReadableStreamDefaultReader<Uint8Array>;
  } | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useCallback(() => {
    const active = current.current;
    current.current = null;
    active?.controller.abort();
    void active?.reader?.cancel().catch(() => {});
  }, []);
  const cancel = useCallback(() => {
    stop();
    setLoading(false);
  }, [stop]);
  useEffect(() => stop, [stop]);

  const start = useCallback(
    async (source: CheckedStreamSource) => {
      stop();
      const active: NonNullable<typeof current.current> = {
        controller: new AbortController(),
      };
      current.current = active;
      setText("");
      setError(null);
      setLoading(true);
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let result = "";
      try {
        const stream = await source(active.controller.signal);
        if (current.current !== active) {
          await stream.cancel();
          return;
        }
        active.reader = stream.getReader();
        while (true) {
          const chunk = await active.reader.read();
          if (current.current !== active) return;
          result += chunk.done
            ? decoder.decode()
            : decoder.decode(chunk.value, { stream: true });
          setText(result);
          if (chunk.done) break;
        }
      } catch {
        if (current.current === active) {
          setText("");
          setError("Your reply could not load. Try again.");
          void active.reader?.cancel().catch(() => {});
        }
      } finally {
        // A stream implementation can throw during cleanup; never leak that
        // rejection to event handlers that start or cancel without awaiting.
        try {
          active.reader?.releaseLock();
        } catch {}
        if (current.current === active) {
          current.current = null;
          setLoading(false);
        }
      }
    },
    [stop],
  );
  return { text, loading, error, start, cancel };
}
