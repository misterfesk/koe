import { PageHeading, ActionLink } from "@/components/ui";
export default function Page() {
  return (
    <>
      <PageHeading
        eyebrow="Privacy · review-build explanation"
        description="This describes this local app, not a future service or legal policy."
      >
        A session, not a record.
      </PageHeading>
      <div className="prose">
        <p>
          Use fictional details only. Text and choices remain in this tab’s
          React state. Reloading starts over. There is no backend database,
          browser storage of free text, advertising, analytics or live AI
          integration.
        </p>
        <p>
          Approve individual memory cards explicitly. Temporary mode prevents
          new memory and omits approved cards from retrieval. Inspect or remove
          cards in Settings.
        </p>
        <p>
          Exports download to your computer and copy controls write to your
          clipboard when you choose them. The app cannot delete those copies.
          Official help links open external sites only when you follow them;
          their policies then apply.
        </p>
        <p>
          A future service needs verified data flows, retention, provider terms,
          security, deletion and qualified clinical/legal review. This prototype
          does not promise production confidentiality or readiness.
        </p>
        <div className="actions">
          <ActionLink href="/settings/privacy">
            Open session controls
          </ActionLink>
          <ActionLink href="/help" secondary>
            Help & support
          </ActionLink>
        </div>
      </div>
    </>
  );
}
