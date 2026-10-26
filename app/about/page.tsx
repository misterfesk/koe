import { PageHeading, ActionLink } from "@/components/ui";
export default function Page() {
  return (
    <>
      <PageHeading
        eyebrow="About this build"
        description="A private, English-first build for adults. Product direction is still the owner's decision."
      >
        What this build is for
      </PageHeading>
      <div className="prose">
        <p>
          Koe explores optional small actions, reflection and preparation for
          human support. This private app implements all sixteen candidate
          features with fictional scenarios so its owner can decide what to
          keep, change or remove.
        </p>
        <h2>What is real here</h2>
        <p>
          The local interactions, session drafts, step changes and exports work.
          Help listings have dated primary sources and independent content
          checks.
        </p>
        <h2>What remains a boundary</h2>
        <p>
          Conversations are scripted. No AI provider, treatment, clinical
          assessment, real reminder, messaging, booking or staffed handoff runs.
          No efficacy, legal or clinical approval is claimed.
        </p>
        <div className="actions">
          <ActionLink href="/review">Open the review explorer</ActionLink>
          <ActionLink href="/privacy" secondary>
            How data is handled
          </ActionLink>
        </div>
      </div>
    </>
  );
}
