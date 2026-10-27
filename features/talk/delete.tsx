"use client";
import { useRouter } from "next/navigation";
import { ConfirmDelete } from "@/components/ui";
import { removeConversation } from "@/server/actions/talk";

export function DeleteConversation({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmDelete
      label="Delete conversation"
      question="Delete this conversation?"
      detail="Steps and memory cards you kept from it stay."
      onConfirm={async () => {
        await removeConversation(id);
        router.push("/talk");
      }}
    />
  );
}
