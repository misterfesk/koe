import type { NextConfig } from "next";
import { resolve } from "node:path";
const config: NextConfig = {
  poweredByHeader: false,
  // PGlite loads its WebAssembly Postgres from disk at runtime; bundling breaks it.
  serverExternalPackages: ["@electric-sql/pglite"],
  webpack(configuration) {
    // Exclude the explorer module from the client graph, rather than hiding it
    // after it has already been downloaded. The same flag gates preview JSX.
    if (process.env.NEXT_PUBLIC_REVIEW_TOOLS === "false") {
      const disabled = resolve(process.cwd(), "features/review/disabled.tsx");
      const explorer = resolve(process.cwd(), "features/review/explorer.tsx");
      // Next's client-reference entries import the resolved absolute path.
      configuration.resolve.alias["@/features/review/explorer"] = disabled;
      configuration.resolve.alias[explorer] = disabled;
      configuration.resolve.alias[explorer.replaceAll("\\", "/")] = disabled;
    }
    return configuration;
  },
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};
export default config;
