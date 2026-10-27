import type { Metadata, Viewport } from "next";
import { Shell } from "@/components/shell";
import { getViewer } from "@/server/viewer";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Koe · a gentle day on low days", template: "%s · Koe" },
  description:
    "Plan a gentle day, talk things through and see what helps. For adults having a hard time.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#f2ebe4" };

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();
  const p = viewer?.profile;
  return (
    <html lang="en">
      <body>
        <Shell
          signedIn={!!p?.onboardedAt}
          appearance={
            p
              ? {
                  plain: p.plain,
                  reducedMotion: p.reducedMotion,
                  tone: p.tone,
                  mascot: p.mascot,
                }
              : undefined
          }
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
