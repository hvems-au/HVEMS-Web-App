import type { MetadataRoute } from "next";

/**
 * The app portals are private sign-in areas and must never appear in search
 * results (the public website is hvems.com.au). Every page also sends
 * "noindex, nofollow" in its metadata and as an X-Robots-Tag header.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
