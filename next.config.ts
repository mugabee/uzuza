import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cPanel Node.js App (Passenger) runs a single server.js entrypoint,
  // not Vercel's serverless model — standalone output is required.
  output: "standalone",
};

export default nextConfig;
