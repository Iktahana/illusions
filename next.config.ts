import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  assetPrefix: process.env.NODE_ENV === "production" ? "." : undefined,
  webpack: (config, { isServer }) => {
    // クライアントサイドのみに polyfill を適用
    if (!isServer) {
      config.output = config.output || {};
      config.output.globalObject = 'self';
      
      // kuromoji が必要とする Node.js モジュールの polyfill
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        zlib: require.resolve('browserify-zlib'),
        stream: require.resolve('stream-browserify'),
        buffer: require.resolve('buffer/'),
        util: require.resolve('util/'),
        assert: require.resolve('assert/'),
        http: false,
        https: false,
        os: false,
        path: require.resolve('path-browserify'),
      };
      
      // グローバル変数を提供
      const webpack = require('webpack');
      config.plugins = config.plugins || [];
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser',
        }),
        new webpack.NormalModuleReplacementPlugin(
          /node:/, 
          (resource: any) => {
            resource.request = resource.request.replace(/^node:/, '');
          }
        )
      );
    }
    
    return config;
  },
};

export default nextConfig;
