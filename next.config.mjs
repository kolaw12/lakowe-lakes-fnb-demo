/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep `next build` from replacing assets used by a running dev server.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  env: {
    DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db",
  },
};

export default nextConfig;
