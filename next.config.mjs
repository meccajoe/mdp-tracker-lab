import { assertLabEnvironment, LAB_SUPABASE_URL } from "./src/lib/lab-safety.mjs";
assertLabEnvironment(process.env);

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Content-Security-Policy", value: "connect-src 'self' " + LAB_SUPABASE_URL + " wss://gkvaeqlqrthztobxitvn.supabase.co" + (process.env.NODE_ENV === "development" ? " ws://localhost:* ws://127.0.0.1:*" : "") + ";" },
    ] }];
  },
};
export default nextConfig;
