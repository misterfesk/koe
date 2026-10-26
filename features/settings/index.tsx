import Link from "next/link";
import { PageHeading } from "@/components/ui";
export function SettingsIndex() {
  return (
    <>
      <PageHeading
        eyebrow="Settings"
        description="Keep the experience within your preferences. Every control here affects only this browser session."
      >
        Make this space yours.
      </PageHeading>
      <ul className="rows">
        {[
          [
            "Privacy & session data",
            "Export, delete, reset and pause scripted suggestions.",
            "/settings/privacy",
          ],
          [
            "Approved memory",
            "Only what you explicitly approve. Inspect, edit or forget.",
            "/settings/memory",
          ],
          [
            "Reminder preview",
            "Virtual time, quiet hours and optional follow-up. Nothing is delivered.",
            "/settings/reminders",
          ],
          [
            "Appearance & tone",
            "Expressive, calm or plain. Optional mascot and reduced motion.",
            "/settings/appearance",
          ],
        ].map(([title, description, path]) => (
          <li key={path}>
            <h2>
              <Link href={path}>
                {title} <span aria-hidden="true">↗</span>
              </Link>
            </h2>
            <p className="meta">{description}</p>
          </li>
        ))}
      </ul>
      <p className="meta" style={{ marginTop: 32 }}>
        No account, login or billing is simulated. Demo identity is not
        authentication.
      </p>
    </>
  );
}
