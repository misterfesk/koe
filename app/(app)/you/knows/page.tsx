import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { MemoryCards, SummaryCard } from "@/features/settings/memory";
import { getUserModel } from "@/server/data/intake";
import { listMemory } from "@/server/data/memory";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "What Koe knows" };

export default async function Page() {
  const v = await requireViewer();
  const [cards, model] = await Promise.all([
    listMemory(v.db, v.user.id),
    v.profile.memoryOn ? getUserModel(v.db, v.user.id) : null,
  ]);
  return (
    <>
      <PageHeading
        eyebrow="You · What Koe knows"
        description="Koe only remembers what you add here or say yes to. It uses these cards to make suggestions fit you. Nothing is remembered without asking."
      >
        What Koe knows
      </PageHeading>
      {model?.summary && (
        <SummaryCard summary={model.summary} region={v.profile.region} />
      )}
      <MemoryCards
        cards={cards}
        memoryOn={v.profile.memoryOn}
        region={v.profile.region}
      />
    </>
  );
}
