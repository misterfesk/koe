import { PageHeading, ActionLink } from "@/components/ui";
export default function NotFound() {
  return (
    <>
      <PageHeading eyebrow="404">Page not found</PageHeading>
      <div className="actions">
        <ActionLink href="/today">Go to Today</ActionLink>
        <ActionLink href="/help" secondary>
          Help
        </ActionLink>
      </div>
    </>
  );
}
