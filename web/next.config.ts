import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Older pages, under the names they have now.
      { source: "/home", destination: "/today", permanent: false },
      { source: "/activity", destination: "/inbox", permanent: false },
      { source: "/email", destination: "/inbox", permanent: false },
      { source: "/needs-you", destination: "/review", permanent: false },
      { source: "/triage", destination: "/review", permanent: false },
      { source: "/memory", destination: "/knows", permanent: false },
      { source: "/can-do", destination: "/knows", permanent: false },
      { source: "/autonomy", destination: "/knows", permanent: false },
      { source: "/settings/can-do", destination: "/knows", permanent: false },
      { source: "/safety", destination: "/promises", permanent: false },
      { source: "/doing", destination: "/progress", permanent: false },
      { source: "/evals", destination: "/progress", permanent: false },
      { source: "/results", destination: "/progress", permanent: false },
    ];
  },
};

export default nextConfig;
