import type { NextConfig } from 'next';

const imageHosts = (process.env.PROPERTY_IMAGE_HOSTS ?? 'images.unsplash.com')
  .split(',')
  .map((hostname) => hostname.trim())
  .filter(Boolean);
if (!imageHosts.includes('res.cloudinary.com')) imageHosts.push('res.cloudinary.com');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  images: {
    remotePatterns: imageHosts.map((hostname) => ({ protocol: 'https' as const, hostname })),
  },
};

export default nextConfig;
