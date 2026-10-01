import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/", destination: "/home", permanent: false },
      // Older pages: the swipe cards became Needs You, and autonomy lives in What Oscar Knows.
      { source: "/triage", destination: "/needs-you", permanent: false },
      { source: "/autonomy", destination: "/memory", permanent: false },
    ];
  },
};

export default nextConfig;
