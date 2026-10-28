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
import { listTalkHistory, loadConversation } from "@/server/actions/talk";
import { useDialog, useMedia } from "./use-dialog";
import styles from "./talk-panel.module.css";

export type TalkContext = { kind: "thing" | "day"; id: string };

type Ctx = {
  open: boolean;
  context: TalkContext | undefined;
  /** The conversation the panel is on; kept while it is closed. */
  convoId: string | null;
  setConvoId: (id: string | null) => void;
  openTalk: (context?: TalkContext) => void;
  close: () => void;
};

const TalkCtx = createContext<Ctx | null>(null);

/** Opens the Talk panel from anywhere on the page, with or without React context. */
export function openTalk(context?: TalkContext) {
  window.dispatchEvent(new CustomEvent("koe:open-talk", { detail: context }));
}

/** Holds the panel's state above the pages, so it survives navigation. */
export function TalkProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<TalkContext>();
  const [convoId, setConvoId] = useState<string | null>(null);
  const show = useCallback((c?: TalkContext) => {
    setContext(c);
    setOpen(true);
  }, []);
  useEffect(() => {
    const on = (e: Event) => show((e as CustomEvent<TalkContext>).detail);
    window.addEventListener("koe:open-talk", on);
    return () => window.removeEventListener("koe:open-talk", on);
  }, [show]);
  const value = useMemo(
    () => ({
      open,
      context,
      convoId,
      setConvoId,
      openTalk: show,
      close: () => setOpen(false),
    }),
    [open, context, convoId, show],
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
      Talk
    </button>
  );
}

type Loaded = Extract<
  Awaited<ReturnType<typeof loadConversation>>,
  { ok: true }
>;
type Row = Awaited<ReturnType<typeof listTalkHistory>>[number];

/** One earlier conversation. A4b adds a takeaway line under the title. */
function HistoryRow({ row, onOpen }: { row: Row; onOpen: () => void }) {
  return (
    <li>
      <button type="button" className={styles.row} onClick={onOpen}>
        <span>{row.title}</span>
        <span className="meta">{row.when}</span>
      </button>
    </li>
  );
}

export function TalkPanel() {
  const { open } = useTalk();
  return open ? <PanelBody /> : null;
}

function PanelBody() {
  const { context, convoId, setConvoId, close } = useTalk();
  const router = useRouter();
  const phone = useMedia("(max-width: 1023px)");
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [data, setData] = useState<Loaded | null>(null);
  const [history, setHistory] = useState<Row[] | null>(null);
  // A new key remounts the conversation (New, or one chosen from History).
  const [key, setKey] = useState(0);
  useDialog(ref, { trap: phone, onClose: close });

  const load = useCallback(
    async (id: string | null) => {
      let r = await loadConversation(id);
      if (!r.ok) r = await loadConversation(null);
      if (!r.ok) return null;
      setConvoId(r.id);
      return r;
    },
    [setConvoId],
  );
  // Show a conversation; `fresh` remounts it (New, History, first open).
  const show = useCallback(
    (id: string | null, fresh: boolean) =>
      load(id).then((r) => {
        if (!r) return;
        setData(r);
        if (fresh) setKey((k) => k + 1);
      }),
    [load],
  );
  useEffect(() => {
    // Only on open; later loads are asked for by the buttons.
    let live = true;
    void load(convoId).then((r) => live && r && setData(r));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function showHistory() {
    if (view === "history") return setView("chat");
    setView("history");
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
          onClick={close}
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
              onChanged={(id) => show(id, false)}
            />
          )
        )}
      </div>
    </div>
  );
}
