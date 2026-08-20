/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@tensorflow-models/pose-detection', '@mediapipe/pose'],
};

export default nextConfig;