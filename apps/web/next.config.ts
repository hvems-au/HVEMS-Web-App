import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(), microphone=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [
    "@hvems/api-client",
    "@hvems/config",
    "@hvems/domain",
    "@hvems/permissions",
    "@hvems/types",
    "@hvems/ui",
    "@hvems/validation",
  ],
  // PDF records read the logo and static Montserrat files from disk at runtime.
  outputFileTracingIncludes: {
    "/customer/*/inspections/*/pdf": ["./lib/pdf/assets/**/*", "./node_modules/@fontsource/montserrat/files/montserrat-latin-*-normal.woff"],
    "/customer/*/equipment/*/label": ["./lib/pdf/assets/**/*", "./node_modules/@fontsource/montserrat/files/montserrat-latin-*-normal.woff"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
