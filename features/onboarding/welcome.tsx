"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { StartForm } from "./start";
import styles from "./welcome.module.css";

/**
 * The start button for the landing page, plus the welcome dialog it opens.
 * A native modal <dialog> traps focus, makes the page behind inert and closes
 * on Esc. It opens by itself once; the button brings it back.
 */
export function Welcome({
  autoOpen,
  children,
}: {
  autoOpen: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (autoOpen && d && !d.open) d.showModal();
  }, [autoOpen]);
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()}>
        {children}
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="welcome-title"
      >
        <div className={styles.top}>
          <h2 id="welcome-title">Welcome to Koe</h2>
          <button
            type="button"
            className="secondary"
            onClick={() => dialog.current?.close()}
          >
            Close
          </button>
        </div>
        <StartForm />
      </dialog>
    </>
  );
}
