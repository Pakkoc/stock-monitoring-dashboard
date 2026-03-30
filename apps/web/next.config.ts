import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL || 'https://focuses-eos-plaintiff-mats.trycloudflare.com',
    NEXT_PUBLIC_WS_URL:
      process.env.NEXT_PUBLIC_WS_URL || 'https://focuses-eos-plaintiff-mats.trycloudflare.com',
  },

  // React strict mode for development
  reactStrictMode: true,

  // Experimental features
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // Image optimization
  images: {
    remotePatterns: [],
  },

  // Webpack customization
  webpack: (config) => {
    // Handle socket.io-client
    config.externals = config.externals || [];
    return config;
  },
};

export default nextConfig;
