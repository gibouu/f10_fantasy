/** @type {import('next').NextConfig} */
const nextConfig = {
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
