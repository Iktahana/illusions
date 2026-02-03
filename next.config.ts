import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  assetPrefix: process.env.NODE_ENV === "production" ? "." : undefined,
  webpack: (config, { isServer }) => {
    // Worker のサポートを追加
    if (!isServer) {
      config.output = config.output || {};
      config.output.globalObject = 'self';
      
      // kuromoji が必要とする Node.js モジュールの polyfill を追加
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        zlib: require.resolve('browserify-zlib'),
        stream: require.resolve('stream-browserify'),
        buffer: require.resolve('buffer/'),
      };
      
      // Buffer を global に追加
      config.plugins = config.plugins || [];
      const webpack = require('webpack');
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser',
        })
      );
    }
    
    return config;
  },
};

export default nextConfig;
