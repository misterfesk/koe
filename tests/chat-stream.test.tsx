import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { ReadableStream } from "node:stream/web";
import { TextDecoder, TextEncoder } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useStream,
  type CheckedStreamSource,
} from "@/components/chat/use-stream";

beforeEach(() => {
  vi.stubGlobal("TextDecoder", TextDecoder);
  vi.stubGlobal("TextEncoder", TextEncoder);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const source = (stream: ReadableStream<Uint8Array>) =>
  (async () => stream) as unknown as CheckedStreamSource;

describe("checked stream hook", () => {
  it("decodes UTF-8 characters split across chunks and completes", async () => {
    const bytes = new TextEncoder().encode("Café ☕");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    const { result } = renderHook(useStream);
    await act(async () => result.current.start(source(stream)));
    expect(result.current).toMatchObject({
      text: "Café ☕",
      loading: false,
      error: null,
    });
  });
  it("reports errors without displaying provider details or partial text", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("private provider details"));
      },
    });
    const { result } = renderHook(useStream);
    await act(async () => result.current.start(source(stream)));
    expect(result.current).toMatchObject({
      text: "",
      loading: false,
      error: "Your reply could not load. Try again.",
    });
  });
  it("fails closed on invalid UTF-8", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xff]));
        controller.close();
      },
    });
    const { result } = renderHook(useStream);
    await act(async () => result.current.start(source(stream)));
    expect(result.current.text).toBe("");
    expect(result.current.error).toBeTruthy();
  });
  it("cancels the reader and aborts the source on explicit cancel", async () => {
    const cancelled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel: cancelled });
    let signal: AbortSignal | undefined;
    const { result } = renderHook(useStream);
    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.start(async (input) => {
        signal = input;
        return stream as unknown as globalThis.ReadableStream<Uint8Array>;
      });
    });
    expect(result.current.loading).toBe(true);
    await act(async () => {
      result.current.cancel();
      await pending;
    });
    expect(signal?.aborted).toBe(true);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(result.current).toMatchObject({ loading: false, error: null });
  });
  it("cancels a pending source after unmount and prevents stale content replacing a new run", async () => {
    const cancelled = vi.fn();
    let resolve!: (stream: globalThis.ReadableStream<Uint8Array>) => void;
    const { result, unmount } = renderHook(useStream);
    let first!: Promise<void>;
    act(() => {
      first = result.current.start(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
    });
    await act(async () =>
      result.current.start(
        source(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("New reply"));
              controller.close();
            },
          }),
        ),
      ),
    );
    await act(async () => {
      resolve(
        new ReadableStream({
          cancel: cancelled,
        }) as unknown as globalThis.ReadableStream<Uint8Array>,
      );
      await first;
    });
    expect(cancelled).toHaveBeenCalledOnce();
    expect(result.current.text).toBe("New reply");
    let signal: AbortSignal | undefined;
    act(() => {
      void result.current.start(async (input) => {
        signal = input;
        return new ReadableStream({
          cancel: cancelled,
        }) as unknown as globalThis.ReadableStream<Uint8Array>;
      });
    });
    await waitFor(() => expect(result.current.loading).toBe(true));
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
