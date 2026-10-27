"use client";
import { useRouter } from "next/navigation";
import { PlanForm } from "./plan-form";

export function NewStep({ region }: { region: string | null }) {
  const router = useRouter();
  return (
    <div className="prose">
      <PlanForm
        region={region}
        chooseArea
        initial={{ area: "enjoy", title: "" }}
        onDone={(id) => router.push("/steps/" + id)}
        onCancel={() => router.back()}
      />
    </div>
  );
}
