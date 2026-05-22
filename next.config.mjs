/** @type {import('next').NextConfig} */
if (process.env.VERCEL_PREVIEW_COMMENTS_ENABLED === "1") {
  // Vercel's Next 16 adapter can receive an incomplete modifyConfig context here,
  // which breaks Git deployments before the app build starts. MSTV does not use
  // Preview Comments/Toolbar injection in production.
  process.env.VERCEL_PREVIEW_COMMENTS_ENABLED = "0";
}

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
