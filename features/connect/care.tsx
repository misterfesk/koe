"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession, useDraft } from "@/components/session";
import {
  PageHeading,
  Field,
  Toggle,
  Notice,
  ActionLink,
  ConfirmDelete,
  focusFirstInvalid,
} from "@/components/ui";
import { hasPlannerDraft } from "@/domain/state";
import { careTasks, prepareCareExport } from "@/domain/connect";
import { downloadJson, copyText } from "@/services/export";
export function CarePreparation() {
  const { state, dispatch } = useSession();
  const router = useRouter();
  const [original, setOriginal] = useDraft(
    "care.original",
    state.journal
      .map((n) => n.text)
      .filter(Boolean)
      .join("\n"),
  );
  const [summary, setSummary] = useDraft("care.summary");
  const [inquiry, setInquiry] = useDraft(
    "care.inquiry",
    "Hello, I would like information about accessing your service. Could you tell me about eligibility, costs and next steps?",
  );
  const [questions, setQuestions] = useDraft("care.questions");
  const [status, setStatus] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  function exportCare(e: FormEvent) {
    e.preventDefault();
    const result = prepareCareExport({
      originalNotes: original,
      editedSummary: summary,
      inquiryDraft: inquiry,
      questions,
      checklist: state.careChecklist.filter(
        (x): x is (typeof careTasks)[number] =>
          careTasks.includes(x as (typeof careTasks)[number]),
      ),
    });
    if (!result.success) {
      setErrors(
        Object.fromEntries(
          result.error.issues.map((i) => [String(i.path[0]), i.message]),
        ),
      );
      focusFirstInvalid(e);
      return;
    }
    setErrors({});
    downloadJson("koe-care-preparation.json", result.data);
    setStatus("Download requested. Nothing was shared.");
  }
  return (
    <>
      <PageHeading
        eyebrow="Connect"
        description={
          state.journal.length
            ? "Use your journal notes to prepare questions about care."
            : "Start with a question about access, cost or what you need."
        }
      >
        Prepare for care
      </PageHeading>
      <p className="prose">
        Every question is optional. Koe cannot find appointments, book care or
        contact a clinician.
      </p>
      <section style={{ marginBottom: 36 }}>
        <h2>Before contacting a service</h2>

        {careTasks.map((task) => (
          <Toggle
            key={task}
            label={task}
            checked={state.careChecklist.includes(task)}
            onChange={(checked) =>
              dispatch({
                type: "careChecklist",
                value: checked
                  ? [...state.careChecklist, task]
                  : state.careChecklist.filter((x) => x !== task),
              })
            }
          />
        ))}
        <div className="actions">
          <button
            className="secondary"
            onClick={() => {
              if (hasPlannerDraft(state)) {
                setStatus(
                  "You already have a step draft. Open it before starting another.",
                );
                return;
              }
              dispatch({
                type: "draft",
                key: "step.title",
                value: "Ask about service eligibility and cost",
              });
              dispatch({
                type: "draft",
                key: "step.area",
                value: "Care access",
              });
              router.push("/steps/new");
            }}
          >
            Write a care-access step
          </button>
        </div>
      </section>
      <form onSubmit={exportCare}>
        <div className="split">
          <section>
            <h2>Your source notes</h2>
            <Field
              label="Original notes"
              value={original}
              onChange={(v) => {
                setOriginal(v);
                setStatus("");
              }}
              multiline
              maxLength={3000}
              error={errors.originalNotes}
              hint="Journal text can be a starting point. These notes are never rewritten by a model."
            />
            {summary && summary !== original ? (
              <ConfirmDelete
                label="Replace summary with notes"
                question="Replace your edited summary?"
                detail="Your original notes stay."
                onConfirm={() => {
                  setSummary(original);
                  setStatus("");
                }}
              />
            ) : (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setSummary(original);
                  setStatus("");
                }}
              >
                Use notes as starting summary
              </button>
            )}
          </section>
          <section>
            <h2>What you choose to share</h2>
            <Field
              label="Editable factual summary"
              value={summary}
              onChange={(v) => {
                setSummary(v);
                setStatus("");
              }}
              multiline
              maxLength={4000}
              error={errors.editedSummary}
              hint="Compare with your original notes. Add only facts you want to include; nothing is inferred here."
            />
          </section>
        </div>
        <hr className="divider" />
        <div className="split">
          <section>
            <h2>An inquiry you can edit</h2>
            <Field
              label="Inquiry draft"
              value={inquiry}
              onChange={(v) => {
                setInquiry(v);
                setStatus("");
              }}
              multiline
              maxLength={2000}
              error={errors.inquiryDraft}
            />
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                try {
                  await copyText(inquiry);
                  setStatus("Copied. Nothing was sent.");
                } catch {
                  setStatus(
                    "Clipboard unavailable. Select and copy the inquiry manually. Nothing was sent.",
                  );
                }
              }}
            >
              Copy inquiry
            </button>
          </section>
          <section>
            <h2>Questions for a conversation</h2>
            <Field
              label="Appointment questions"
              value={questions}
              onChange={(v) => {
                setQuestions(v);
                setStatus("");
              }}
              multiline
              maxLength={1500}
              error={errors.questions}
            />
            <p className="hint">
              For example: What does access involve? What costs should I expect?
              What would I like help with?
            </p>
          </section>
        </div>
        <div className="actions">
          <button>Export care preparation JSON</button>
          <ActionLink href="/connect" secondary>
            Keep draft & leave →
          </ActionLink>
          {hasPlannerDraft(state) && (
            <ActionLink href="/steps/new" secondary>
              Open step draft →
            </ActionLink>
          )}
          <ConfirmDelete
            label="Discard care draft"
            question="Discard your care preparation?"
            detail="Journal entries stay. Checklist choices are also cleared."
            onConfirm={() => {
              dispatch({ type: "clearDraft", prefix: "care." });
              setOriginal("");
              setSummary("");
              setInquiry("");
              setQuestions("");
              dispatch({ type: "careChecklist", value: [] });
              setStatus("Care draft discarded.");
              setErrors({});
            }}
          />
        </div>
      </form>
      {status && <Notice>{status}</Notice>}
      <p className="meta">
        Export includes both source notes and your edited summary. Nothing is
        shared with a service or clinician.
      </p>
    </>
  );
}
