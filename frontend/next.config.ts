import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@egypt-traffic/backend'],
  typedRoutes: true
};

export default nextConfig;
