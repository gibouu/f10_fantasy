import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/support"],
      disallow: ["/api/"],
    },
    sitemap: "https://www.fxracing.ca/sitemap.xml",
  }
}
