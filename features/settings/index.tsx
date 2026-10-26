import Link from "next/link";
import { PageHeading } from "@/components/ui";
export function SettingsIndex() {
  return (
    <>
      <PageHeading
        eyebrow="Settings"
        description="Every control here affects only this browser session."
      >
        Settings
      </PageHeading>
      <ul className="rows">
        {[
          [
            "Your data",
            "Export or delete this session, and turn suggestions off.",
            "/settings/privacy",
          ],
          [
            "Memory",
            "The memory cards you approved. Edit, export or delete them.",
            "/settings/memory",
          ],
          [
            "Reminder preview",
            "When a reminder would arrive, on a virtual clock. Nothing is delivered.",
            "/settings/reminders",
          ],
          [
            "Appearance & tone",
            "Expressive, calm or plain voice, plain view and reduced motion.",
            "/settings/appearance",
          ],
        ].map(([title, description, path]) => (
          <li key={path}>
            <h2>
              <Link href={path}>
                {title} <span aria-hidden="true">→</span>
              </Link>
            </h2>
            <p className="meta">{description}</p>
          </li>
        ))}
      </ul>
      <p className="meta" style={{ marginTop: 32 }}>
        There are no accounts, logins or billing in this build.
      </p>
    </>
  );
}
