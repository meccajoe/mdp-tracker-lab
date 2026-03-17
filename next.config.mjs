/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["projects.meccanics.com", "*.meccanics.com"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "https://projects.meccanics.com" },
        ],
      },
    ];
  },
};

export default nextConfig;
