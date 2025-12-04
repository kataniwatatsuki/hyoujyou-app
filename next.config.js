/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    webSockets: false,  // ★ これがないと /ws が飛んで403になる
  }
};

module.exports = nextConfig;
