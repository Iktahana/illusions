import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  trailingSlash: true,
  // Turbopack configuration (Next.js 16 default)
  turbopack: {
    resolveAlias: {
      // kuromoji のためのブラウザ互換モジュール
      zlib: 'browserify-zlib',
      stream: 'stream-browserify',
      buffer: 'buffer',
      util: 'util',
      assert: 'assert',
      path: 'path-browserify',
      // Node.js 専用モジュールを無効化
      fs: { browser: './empty-module.js' },
      net: { browser: './empty-module.js' },
      tls: { browser: './empty-module.js' },
      http: { browser: './empty-module.js' },
      https: { browser: './empty-module.js' },
      os: { browser: './empty-module.js' },
    },
  },
  webpack: (config, { isServer }) => {
    const webpack = require('webpack');
    
    // クライアントサイドで kuromoji を使用するための設定
    if (!isServer) {
      // Node.js モジュールの fallback を設定
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        zlib: require.resolve('browserify-zlib'),
        stream: require.resolve('stream-browserify'),
        buffer: require.resolve('buffer'),
        util: require.resolve('util'),
        assert: require.resolve('assert'),
        http: false,
        https: false,
        os: false,
        path: require.resolve('path-browserify'),
      };
      
      // グローバル変数を提供
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser',
        })
      );
    } else {
      // Server-side: Provide polyfills for pre-rendering
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
