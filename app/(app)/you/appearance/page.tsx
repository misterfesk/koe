import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { Appearance } from "@/features/settings/preferences";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Appearance" };

export default async function Page() {
  const v = await requireViewer();
  const p = v.profile;
  return (
    <>
      <PageHeading eyebrow="You · Appearance">Appearance</PageHeading>
      <div className="prose">
        <Appearance
          tone={p.tone}
          plain={p.plain}
          reducedMotion={p.reducedMotion}
          mascot={p.mascot}
          sceneStyle={p.sceneStyle}
        />
      </div>
    </>
  );
}
