import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { MemoryCards } from "@/features/settings/memory";
import { ModelEditor } from "@/features/settings/model-editor";
import { getUserModel } from "@/server/data/intake";
import { listMemory } from "@/server/data/memory";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "What Koe knows" };

export default async function Page() {
  const v = await requireViewer();
  const [cards, model] = await Promise.all([
    listMemory(v.db, v.user.id),
    getUserModel(v.db, v.user.id),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="You · What Koe knows"
        description="Review your saved answers, summary and memory cards. You choose what Koe can use."
      >
        What Koe knows
      </PageHeading>
      <ModelEditor saved={model} region={v.profile.region} owner={v.user.id} />
      <MemoryCards
        cards={cards}
        memoryOn={v.profile.memoryOn}
        region={v.profile.region}
      />
    </>
  );
}
