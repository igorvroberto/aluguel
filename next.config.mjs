/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: ["mapbox-gl"],
  experimental: {
    serverComponentsExternalPackages: ["playwright"],
  },
};

export default nextConfig;
