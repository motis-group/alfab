/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  sassOptions: {
    includePaths: [path.join(__dirname)],
  },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@components': path.join(__dirname, 'components'),
      '@styles': path.join(__dirname, 'styles'),
      '@common': path.join(__dirname, 'common'),
      '@': path.join(__dirname),
      '@utils': path.join(__dirname, 'utils'),
    };
    return config;
  },
};

module.exports = nextConfig;
