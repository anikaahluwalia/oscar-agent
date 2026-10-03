import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/", destination: "/home", permanent: false },
      // Older pages: Inbox, All email and Needs You became Activity and Review; How he's doing is Evals.
      { source: "/inbox", destination: "/activity", permanent: false },
      { source: "/email", destination: "/activity", permanent: false },
      { source: "/needs-you", destination: "/review", permanent: false },
      { source: "/triage", destination: "/review", permanent: false },
      { source: "/results", destination: "/evals", permanent: false },
      { source: "/autonomy", destination: "/can-do", permanent: false },
      { source: "/settings/can-do", destination: "/can-do", permanent: false },
    ];
  },
};

export default nextConfig;
