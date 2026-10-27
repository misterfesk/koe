import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  // PGlite loads its WebAssembly Postgres from disk at runtime; bundling breaks it.
  serverExternalPackages: ["@electric-sql/pglite", "web-push"],
  devIndicators: false,
  // Old v1 addresses. Not permanent: later slices may re-home them again.
  async redirects() {
    const to = (source: string, destination: string) => ({
      source,
      destination,
      permanent: false,
    });
    return [
      to("/reflect", "/talk"),
      to("/reflect/talk", "/talk"),
      to("/reflect/talk/:id", "/talk/:id"),
      to("/reflect/week", "/you/look-back"),
      to("/reflect/journey", "/you/look-back/journey"),
      to("/connect", "/you/people"),
      to("/connect/care", "/you/care"),
      to("/settings", "/you"),
      to("/settings/memory", "/you/knows"),
      to("/settings/reminders", "/you/reminders"),
      to("/settings/privacy", "/you/data"),
      to("/settings/account", "/you/account"),
      to("/settings/appearance", "/you/appearance"),
      to("/steps", "/today"),
      to("/start", "/"),
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
      {
        // Personal pages must never be stored by shared caches.
        source: "/((?!_next/static|fonts).*)",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};
export default config;
