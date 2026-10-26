"use client";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { useDraft } from "@/components/session";
import {
  PageHeading,
  Field,
  Notice,
  ActionLink,
  focusFirstInvalid,
} from "@/components/ui";
import { downloadJson } from "@/services/export";
const schema = z
  .string()
  .trim()
  .min(1, "Describe the problem first.")
  .max(1000);
export function ReportPreview() {
  const [text, setText] = useDraft("report.text");
  const [preview, setPreview] = useDraft("report.preview");
  const [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(text);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      focusFirstInvalid(e);
      return;
    }
    setError("");
    setPreview(parsed.data);
  }
  return (
    <>
      <PageHeading
        eyebrow="Help & support · preview"
        description="Nobody reads these reports in this build. For support now, go back to Help & support."
      >
        Report a problem
      </PageHeading>
      <form className="prose" onSubmit={submit} noValidate>
        <Field
          label="What went wrong?"
          value={text}
          onChange={setText}
          multiline
          maxLength={1000}
          error={error}
        />
        <div className="actions">
          <button>Preview report</button>
          <ActionLink href="/help" secondary>
            Back to Help & support
          </ActionLink>
        </div>
      </form>
      {preview && (
        <section className="panel prose">
          <Notice>Here is your report. Nothing was submitted.</Notice>
          <pre>{preview}</pre>
          <button
            className="secondary"
            onClick={() =>
              downloadJson("koe-report-preview.json", {
                kind: "synthetic-report-preview",
                text: preview,
              })
            }
          >
            Export report (JSON)
          </button>
        </section>
      )}
    </>
  );
}
