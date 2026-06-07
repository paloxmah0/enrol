/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/webhook',
        destination: '/api/webhook',
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.cache = {
        type: 'filesystem', // Use filesystem caching
      };
    }
    return config;
  },
};

export default nextConfig;
