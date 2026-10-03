import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets `next dev` and `next build`/`next start` run side by side: a dev
  // server pointed at its own distDir will not clobber the production
  // build you are previewing. See the dev:fast / serve scripts.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
