/** @type {import('next').NextConfig} */
const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
};

const sharedConfig = {
  serverExternalPackages: ["@napi-rs/canvas"],
  env: Object.fromEntries(Object.entries(publicEnv).filter(([, value]) => Boolean(value))),
};

const nextConfig = process.env.CAPACITOR_EXPORT === "1"
  ? {
      ...sharedConfig,
      output: "export",
      images: {
        unoptimized: true,
      },
    }
  : sharedConfig;

export default nextConfig;
