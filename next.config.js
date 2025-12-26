/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  swcMinify: true,
  // Ensure proper port binding for Railway
  env: {
    PORT: process.env.PORT || '3000',
  },
};

module.exports = nextConfig;



