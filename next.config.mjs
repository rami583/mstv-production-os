/** @type {import('next').NextConfig} */
const nextConfig = process.env.CAPACITOR_EXPORT === "1"
  ? {
      output: "export",
      images: {
        unoptimized: true,
      },
    }
  : {};

export default nextConfig;
