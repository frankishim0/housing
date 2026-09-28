import type { NextConfig } from 'next';

const imageHosts = (process.env.PROPERTY_IMAGE_HOSTS ?? 'images.unsplash.com')
  .split(',')
  .map((hostname) => hostname.trim())
  .filter(Boolean);
if (!imageHosts.includes('res.cloudinary.com')) imageHosts.push('res.cloudinary.com');

const nextConfig: NextConfig = {
  images: {
    remotePatterns: imageHosts.map((hostname) => ({ protocol: 'https' as const, hostname })),
  },
};

export default nextConfig;
