/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  swcMinify: true,
  // Ensure proper port binding for Railway
  env: {
    PORT: process.env.PORT || '3000',
  },
  // Ensure static files are included in standalone build
  experimental: {
    outputFileTracingIncludes: {
      '/**': ['./.next/static/**/*'],
    },
  },
  // Generate proper source maps for debugging (optional)
  productionBrowserSourceMaps: false,
};

module.exports = nextConfig;



