import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg', 'redis', 'bcrypt'],
};

export default nextConfig;
