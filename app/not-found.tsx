import { PageHeading, ActionLink } from "@/components/ui";
export default function NotFound() {
  return (
    <>
      <PageHeading
        eyebrow="404"
        description="This address doesn't lead to a Koe page. Today and Help & support are one click away."
      >
        Page not found
      </PageHeading>
      <div className="actions">
        <ActionLink href="/today">Go to Today</ActionLink>
        <ActionLink href="/help" secondary>
          Help & support
        </ActionLink>
      </div>
    </>
  );
}
