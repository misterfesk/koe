"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlanForm } from "./plan-form";

export function NewEntry({
  region,
  owner,
}: {
  region: string | null;
  owner: string;
}) {
  const router = useRouter();
  return (
    <div className="prose">
      <PlanForm
        draftKey={"add:" + owner}
        region={region}
        chooseKind
        initial={{ kind: "enjoy", title: "" }}
        onDone={() => router.push("/today")}
        onCancel={() => router.push("/today")}
      />
      <p>
        <Link href="/today/problem">Work through a problem →</Link>
      </p>
    </div>
  );
}
