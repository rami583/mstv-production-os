/** @type {import('next').NextConfig} */
const sharedConfig = {
  serverExternalPackages: ["@napi-rs/canvas"],
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
