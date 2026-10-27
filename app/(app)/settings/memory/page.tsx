import type { Metadata } from "next";
import { PageHeading } from "@/components/ui";
import { MemoryCards } from "@/features/settings/memory";
import { listMemory } from "@/server/data/memory";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "About me" };

export default async function Page() {
  const v = await requireViewer();
  const cards = await listMemory(v.db, v.user.id);
  return (
    <>
      <PageHeading
        eyebrow="Settings · About me"
        description="Koe only remembers what you add here or say yes to. It uses these cards to make suggestions fit you. Nothing is remembered without asking."
      >
        About me
      </PageHeading>
      <MemoryCards
        cards={cards}
        memoryOn={v.profile.memoryOn}
        region={v.profile.region}
      />
    </>
  );
}
