import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strict mode for development safety
  reactStrictMode: true,

  // i18n via next-intl (no built-in i18n routing)
  i18n: undefined,

  // Security headers for health data compliance
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: process.env.APP_URL ?? "http://localhost:3000" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },

  // Server configuration for WebSocket (LiveKit, Socket.io)
  serverExternalPackages: ["socket.io", "livekit-server-sdk"],

  // Image optimization (patient documents, doctor profiles)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: process.env.MINIO_PUBLIC_HOSTNAME ?? "minio.local",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
