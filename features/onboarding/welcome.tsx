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
  const heading = useRef<HTMLHeadingElement>(null);
  // A modal puts focus on its first control, which would be "Close". Start
  // at the heading instead, so the dialog is read from its beginning.
  const show = () => {
    const d = dialog.current;
    if (!d || d.open) return;
    d.showModal();
    heading.current?.focus();
  };
  useEffect(() => {
    if (autoOpen) show();
  }, [autoOpen]);
  return (
    <>
      <button type="button" onClick={show}>
        {children}
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="welcome-title"
      >
        <div className={styles.top}>
          <h2 id="welcome-title" ref={heading} tabIndex={-1}>
            Welcome to Koe
          </h2>
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
