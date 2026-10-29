/** @type {import('next').NextConfig} */
const nextConfig = {
  // The dashboard never uses next/image. Turning the optimizer off removes
  // the /_next/image endpoint and its remote-code-execution advisories.
  images: { unoptimized: true },
  /**
   * The browser only ever talks to the dashboard. Requests to /api/* are
   * forwarded by the dashboard's own server to the API, which listens only
   * on this machine — so port 4000 is never exposed to the internet.
   */
  async rewrites() {
    const api = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000').replace(/\/+$/, '');
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  }
};

module.exports = nextConfig;
