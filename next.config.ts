import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async redirects() {
    return [
      {
        source: "/index.html",
        destination: "/",
        permanent: false,
      },
      {
        source: "/studio",
        destination: "/",
        permanent: false,
      },
      {
        source: "/app",
        destination: "/",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
