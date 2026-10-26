import { PageHeading, ActionLink } from "@/components/ui";
export default function Page() {
  return (
    <>
      <PageHeading
        eyebrow="Privacy"
        description="How this review build handles what you type. It is not a policy for a future service."
      >
        A session, not a record.
      </PageHeading>
      <div className="prose">
        <p>
          Use fictional details only. What you type stays in this browser tab
          and is cleared when you reload. Nothing is saved to the browser or a
          server, and there is no advertising, analytics or live AI.
        </p>
        <p>
          Koe only remembers words you approve as a memory card. Temporary mode
          stops new cards and keeps existing ones out of suggestions. You can
          edit or delete cards in Settings → Memory.
        </p>
        <p>
          Exports and copied text leave the app when you choose them, and Koe
          can&apos;t delete those copies. Official help links open other sites,
          whose own policies apply.
        </p>
        <p>
          A future service needs verified data flows, retention, provider terms,
          security, deletion and qualified clinical/legal review. This prototype
          does not promise production confidentiality or readiness.
        </p>
        <div className="actions">
          <ActionLink href="/settings/privacy">Manage your data</ActionLink>
          <ActionLink href="/help" secondary>
            Help & support
          </ActionLink>
        </div>
      </div>
    </>
  );
}
