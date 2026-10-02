import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/", destination: "/home", permanent: false },
      // Older pages. Inbox and Activity became All email; Needs You is a tab of Review; Evals is
      // How he's doing; and what Oscar knows and may do lives in Settings.
      { source: "/inbox", destination: "/email", permanent: false },
      { source: "/activity", destination: "/email", permanent: false },
      { source: "/needs-you", destination: "/review", permanent: false },
      { source: "/triage", destination: "/review", permanent: false },
      { source: "/evals", destination: "/results", permanent: false },
      { source: "/memory", destination: "/settings#can-do", permanent: false },
      { source: "/autonomy", destination: "/settings#can-do", permanent: false },
    ];
  },
};

export default nextConfig;
