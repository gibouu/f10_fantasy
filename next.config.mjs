/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: "/races", destination: "/", permanent: false },
      { source: "/races/:path*", destination: "/", permanent: false },
      { source: "/leaderboard", destination: "/", permanent: false },
      { source: "/picks", destination: "/", permanent: false },
      { source: "/profile", destination: "/", permanent: false },
      { source: "/profile/:path*", destination: "/", permanent: false },
      { source: "/signin", destination: "/", permanent: false },
      { source: "/onboarding/:path*", destination: "/", permanent: false },
    ]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/landing/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ]
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      // Google OAuth avatars
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      // Apple OAuth avatars (if provided)
      { protocol: 'https', hostname: 'appleid.apple.com' },
      // OpenF1 driver headshots
      { protocol: 'https', hostname: 'www.formula1.com' },
      { protocol: 'https', hostname: 'media.formula1.com' },
    ],
  },
  // Required for Auth.js v5
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
}

export default nextConfig
