import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", "/privacy", "/support"] as const

  return paths.map((path) => ({
    url: `https://www.fxracing.ca${path}`,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.4,
  }))
}
