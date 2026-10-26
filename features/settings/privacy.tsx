"use client";
import { useState } from "react";
import { useSession } from "@/components/session";
import {
  PageHeading,
  Notice,
  Toggle,
  ActionLink,
  ConfirmDelete,
} from "@/components/ui";
import { downloadJson } from "@/services/export";
export function PrivacyControls() {
  const { state, dispatch } = useSession();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="Settings"
        description="Everything here lives in this browser tab. Export it, delete it, or turn suggestions off."
      >
        Your data
      </PageHeading>
      <div className="prose">
        <p>
          What you type is not saved to browser storage, cookies or a server,
          and reloading clears it. No AI provider, advertising or analytics
          receives it. Files you export and text you copy are yours; deleting
          this session can&apos;t erase them.
        </p>
        <Toggle
          label="Suggestions on"
          checked={state.providerEnabled}
          onChange={(value) => dispatch({ type: "provider", value })}
        />
        <Toggle
          label="Temporary mode: don't keep or use memory cards"
          checked={state.temporary}
          onChange={(value) => dispatch({ type: "temporary", value })}
        />
        <div className="actions">
          <button
            onClick={() =>
              downloadJson("koe-synthetic-session.json", {
                kind: "synthetic-private-review",
                data: state,
              })
            }
          >
            Export session (JSON)
          </button>
          <button
            className="secondary"
            id="review-deletion"
            onClick={() => {
              setConfirm(true);
              requestAnimationFrame(() =>
                document.getElementById("deletion-heading")?.focus(),
              );
            }}
          >
            Delete session data
          </button>
        </div>
        {confirm && (
          <section className="panel" aria-label="Confirm deletion">
            <h2 id="deletion-heading" tabIndex={-1}>
              Delete everything in this session?
            </h2>
            <p>
              This deletes your steps, drafts, notes, memory cards and reminder
              previews, and turns suggestions off. Help & support stays
              available. Export first if you want a copy.
            </p>
            <div className="actions">
              <button
                className="danger secondary"
                onClick={() => {
                  dispatch({ type: "deleteData" });
                  setConfirm(false);
                  requestAnimationFrame(() =>
                    document.getElementById("privacy-feedback")?.focus(),
                  );
                }}
              >
                Yes, delete everything
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setConfirm(false);
                  requestAnimationFrame(() =>
                    document.getElementById("review-deletion")?.focus(),
                  );
                }}
              >
                Keep it
              </button>
            </div>
          </section>
        )}
        {state.notice && <Notice id="privacy-feedback">{state.notice}</Notice>}
        <hr className="divider" />
        <p className="hint">
          Starting over clears this session and brings back the demo with
          suggestions on.
        </p>
        <ConfirmDelete
          label="Start over"
          question="Start this session over?"
          detail="This deletes your steps, drafts, notes, memory cards and reminder previews, and turns suggestions back on."
          onConfirm={() => {
            dispatch({ type: "reset" });
            setConfirm(false);
          }}
        />
        <div className="actions">
          <ActionLink href="/settings/memory" secondary>
            Memory
          </ActionLink>
          <ActionLink href="/help/report" secondary>
            Report a problem
          </ActionLink>
        </div>
        <p className="meta">
          A real service would need verified retention, deletion, security and
          incident processes. This build doesn&apos;t provide them.
        </p>
      </div>
    </>
  );
}
