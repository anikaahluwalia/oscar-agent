import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Old pages: the swipe cards moved onto Home, and autonomy lives in Settings now.
  async redirects() {
    return [
      { source: "/triage", destination: "/", permanent: false },
      { source: "/autonomy", destination: "/settings", permanent: false },
    ];
  },
};

export default nextConfig;
