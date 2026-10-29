"use client";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Conversation } from "@/features/talk/conversation";
import {
  listTalkHistory,
  loadConversation,
  summariseConversation,
} from "@/server/actions/talk";
import { useDialog, useMedia } from "./use-dialog";
import styles from "./talk-panel.module.css";

export type TalkContext = { kind: "thing" | "step" | "day"; id: string };

type Ctx = {
  open: boolean;
  context: TalkContext | undefined;
  /** The conversation the panel is on; kept while it is closed. */
  convoId: string | null;
  setConvoId: (id: string | null) => void;
  getContextConvo: (c: TalkContext) => string | null;
  bindContextConvo: (c: TalkContext, id: string) => void;
  clearContext: () => void;
  openTalk: (context?: TalkContext) => void;
  close: () => void;
};

const TalkCtx = createContext<Ctx | null>(null);

// The takeaways Close asked for, so History waits for them.
let summarising: Promise<unknown> | undefined;

/** Opens the Talk panel from anywhere on the page, with or without React context. */
export function openTalk(context?: TalkContext) {
  window.dispatchEvent(new CustomEvent("koe:open-talk", { detail: context }));
}

/** Closes the Talk panel from anywhere on the page. */
export function closeTalk() {
  window.dispatchEvent(new CustomEvent("koe:close-talk"));
}

/** Whether the Talk panel is currently open (false outside TalkProvider). */
export function useTalkOpen() {
  return useContext(TalkCtx)?.open ?? false;
}

/** Holds the panel's state above the pages, so it survives navigation. */
export function TalkProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<TalkContext>();
  const [convoId, setConvoId] = useState<string | null>(null);
  const contextConvos = useRef(new Map<string, string>());
  const getContextConvo = useCallback(
    (c: TalkContext) => contextConvos.current.get(`${c.kind}:${c.id}`) ?? null,
    [],
  );
  const bindContextConvo = useCallback((c: TalkContext, id: string) => {
    contextConvos.current.set(`${c.kind}:${c.id}`, id);
  }, []);
  const clearContext = useCallback(() => {
    setContext((prev) => {
      if (prev) contextConvos.current.delete(`${prev.kind}:${prev.id}`);
      return undefined;
    });
  }, []);
  const show = useCallback((c?: TalkContext) => {
    setContext((prev) =>
      prev && c && prev.kind === c.kind && prev.id === c.id ? prev : c,
    );
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    setOpen(false);
    setContext(undefined);
  }, []);
  useEffect(() => {
    const onOpen = (e: Event) => show((e as CustomEvent<TalkContext>).detail);
    const onClose = () => hide();
    window.addEventListener("koe:open-talk", onOpen);
    window.addEventListener("koe:close-talk", onClose);
    return () => {
      window.removeEventListener("koe:open-talk", onOpen);
      window.removeEventListener("koe:close-talk", onClose);
    };
  }, [show, hide]);
  const value = useMemo(
    () => ({
      open,
      context,
      convoId,
      setConvoId,
      getContextConvo,
      bindContextConvo,
      clearContext,
      openTalk: show,
      close: hide,
    }),
    [
      open,
      context,
      convoId,
      getContextConvo,
      bindContextConvo,
      clearContext,
      show,
      hide,
    ],
  );
  return <TalkCtx.Provider value={value}>{children}</TalkCtx.Provider>;
}

function useTalk() {
  const c = useContext(TalkCtx);
  if (!c) throw new Error("TalkProvider is missing");
  return c;
}

/** The header button on desktop. */
export function TalkButton() {
  const { open, openTalk: show } = useTalk();
  const path = usePathname();
  if (path === "/intake") return null;
  return (
    <button
      type="button"
      className={styles.opener}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => show()}
    >
      <span className={styles.openerDot} aria-hidden="true" />
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <span>Talk</span>
    </button>
  );
}

type Loaded = Extract<
  Awaited<ReturnType<typeof loadConversation>>,
  { ok: true }
>;
type Row = Awaited<ReturnType<typeof listTalkHistory>>[number];

/** One earlier conversation: its title, first takeaway and when. */
function HistoryRow({ row, onOpen }: { row: Row; onOpen: () => void }) {
  return (
    <li>
      <button type="button" className={styles.row} onClick={onOpen}>
        <span>{row.title}</span>
        {row.takeaway && <span className="meta">{row.takeaway}</span>}
        <span className={`meta ${styles.when}`}>{row.when}</span>
      </button>
    </li>
  );
}

export function TalkPanel() {
  const { open } = useTalk();
  return open ? <PanelBody /> : null;
}

function PanelBody() {
  const {
    context,
    convoId,
    setConvoId,
    getContextConvo,
    bindContextConvo,
    clearContext,
    close,
  } = useTalk();
  const router = useRouter();
  const phone = useMedia("(max-width: 767px)");
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [data, setData] = useState<Loaded | null>(null);
  const [history, setHistory] = useState<Row[] | null>(null);
  // A new key remounts the conversation (New, or one chosen from History).
  const [key, setKey] = useState(0);
  // Closing makes takeaways for the conversation it was on.
  // (Read through a ref: the Escape handler is set once per open.)
  const current = useRef(convoId);
  useEffect(() => {
    current.current = convoId;
  }, [convoId]);
  const closeAndSummarise = useCallback(() => {
    const id = current.current;
    if (id) summarising = summariseConversation(id).catch(() => {});
    close();
  }, [close]);
  useDialog(ref, { trap: phone, onClose: closeAndSummarise });

  const load = useCallback(
    async (id: string | null, from?: TalkContext) => {
      let r = await loadConversation(
        id,
        from?.kind === "thing" || from?.kind === "step"
          ? { kind: from.kind, id: from.id }
          : undefined,
      );
      if (!r.ok) r = await loadConversation(null);
      if (!r.ok) return null;
      setConvoId(r.id);
      return r;
    },
    [setConvoId],
  );
  // Show a conversation; `fresh` remounts it (New, History, first open).
  const show = useCallback(
    (id: string | null, fresh: boolean, from?: TalkContext) =>
      load(id, from).then((r) => {
        if (!r) return;
        setData(r);
        if (fresh) setKey((k) => k + 1);
      }),
    [load],
  );
  const mounted = useRef(false);
  useEffect(() => {
    // On open, and when Stuck? Ask Koe starts or reopens a conversation about a
    // task; later loads are asked for by the buttons.
    const task =
      context?.kind === "thing" || context?.kind === "step"
        ? context
        : undefined;
    if (mounted.current && !task) return;
    mounted.current = true;
    let live = true;
    const existingId = task ? getContextConvo(task) : convoId;
    void load(existingId, existingId ? undefined : task).then((r) => {
      if (!live || !r) return;
      setData(r);
      if (task) {
        setView("chat");
        setKey((k) => k + 1);
      }
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

  async function showHistory() {
    if (view === "history") return setView("chat");
    setView("history");
    await summarising;
    setHistory(await listTalkHistory());
  }

  return (
    <div
      ref={ref}
      className={styles.panel}
      role="dialog"
      aria-modal={phone ? true : undefined}
      aria-label="Talk"
    >
      <div className={styles.bar}>
        <button
          type="button"
          className="secondary"
          aria-label="Start a new conversation"
          onClick={() => {
            clearContext();
            setView("chat");
            void show(null, true);
          }}
        >
          New
        </button>
        <button
          type="button"
          className="secondary"
          aria-label="Show earlier conversations"
          aria-pressed={view === "history"}
          onClick={showHistory}
        >
          History
        </button>
        <button
          type="button"
          className="secondary"
          aria-label="Open Talk full page"
          onClick={() => {
            router.push(convoId ? "/talk/" + convoId : "/talk");
            close();
          }}
        >
          Expand
        </button>
        <button
          type="button"
          className={styles.closer}
          aria-label="Close Talk"
          onClick={closeAndSummarise}
        >
          Close
        </button>
      </div>
      <div className={styles.body}>
        {view === "history" ? (
          <section aria-labelledby="talk-history">
            <h2 id="talk-history">History</h2>
            {history && history.length === 0 && <p>No conversations yet.</p>}
            <ul className={styles.rows}>
              {history?.map((row) => (
                <HistoryRow
                  key={row.id}
                  row={row}
                  onOpen={() => {
                    clearContext();
                    setView("chat");
                    void show(row.id, true);
                  }}
                />
              ))}
            </ul>
          </section>
        ) : (
          data && (
            <Conversation
              key={key}
              id={data.id}
              mode={data.mode}
              messages={data.messages}
              paused={data.paused}
              region={data.region}
              push={data.push}
              hour12={data.hour12}
              context={context}
              focus={data.focus}
              takeaways={data.takeaways}
              onChanged={(id) => {
                if (context?.kind === "thing" || context?.kind === "step") {
                  bindContextConvo(context, id);
                }
                return show(id, false);
              }}
            />
          )
        )}
      </div>
    </div>
  );
}
