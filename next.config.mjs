/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
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
