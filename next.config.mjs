/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      'localhost',
      'pomgvxdokjmxyfbgazls.supabase.co',
      'storage.googleapis.com',
      'whathappen-116263110764.europe-west1.run.app',
    ],
  },
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Allow large file uploads via Server Actions / API routes
  experimental: {
    serverComponentsExternalPackages: ['pdfkit'],
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
}

export default nextConfig
