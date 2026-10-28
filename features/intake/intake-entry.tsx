"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { WeekView } from "@/domain/week";
import { IntakeFlow } from "./intake-flow";
import { WorkInterview } from "./interview";

/** URL fragments are resolved after hydration; they never reach the server. */
export function IntakeEntry({
  owner,
  hasIntro,
  week,
  ...props
}: {
  owner: string;
  hasIntro: boolean;
  week: WeekView | null;
  region: string | null;
  publicKey: string | null;
  hour12: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"intro" | "interview" | null>(null);
  const completedOnEntry = useRef(hasIntro);
  useEffect(() => {
    const resolve = () => {
      if (window.location.hash === "#interview") setMode("interview");
      else if (completedOnEntry.current) router.replace("/today");
      else setMode("intro");
    };
    resolve();
    window.addEventListener("hashchange", resolve);
    return () => window.removeEventListener("hashchange", resolve);
  }, [router]);
  if (mode === "interview")
    return (
      <WorkInterview
        key={owner}
        owner={owner}
        region={props.region}
        week={week}
      />
    );
  if (mode === "intro")
    return <IntakeFlow key={owner} owner={owner} {...props} />;
  return <p role="status">Opening your day…</p>;
}
