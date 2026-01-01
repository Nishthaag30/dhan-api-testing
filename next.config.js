/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure Node.js runtime for API routes
  experimental: {
    serverComponentsExternalPackages: ['ws'],
  },
};

module.exports = nextConfig;

