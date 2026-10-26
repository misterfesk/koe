"use client";
import { PageHeading } from "@/components/ui";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <>
      <PageHeading description="Your session and drafts are still here.">
        Something went wrong on this page
      </PageHeading>
      <button onClick={reset}>Try again</button>
    </>
  );
}
