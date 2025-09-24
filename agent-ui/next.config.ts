import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true
  },
  webpack: (config) => {
    config.optimization.minimize = true;
    config.optimization.splitChunks = {
      chunks: 'all',
      minSize: 20000,
      maxSize: 20000000,
      cacheGroups: {
        default: false,
        vendors: false,
        // Vendor chunk
        vendor: {
          name: 'vendor',
          chunks: 'all',
          test: /node_modules/,
          priority: 20,
          enforce: true
        },
        // Commons chunk
        commons: {
          name: 'commons',
          chunks: 'all',
          minChunks: 2,
          priority: 10
        }
      }
    };
    return config;
  }
};

export default nextConfig;
