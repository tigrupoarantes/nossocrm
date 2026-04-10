import type { NextConfig } from "next";
import { execSync } from "child_process";

function getBuildId(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: getBuildId(),
  },
  // Otimiza imports de bibliotecas com barrel files (index.js que re-exporta tudo)
  // Isso evita carregar módulos não utilizados, reduzindo o bundle em 15-25KB
  // Ref: https://vercel.com/blog/how-we-optimized-package-imports-in-next-js
  experimental: {
    optimizePackageImports: [
      'lucide-react',      // 1500+ ícones, carrega só os usados
      'recharts',          // Biblioteca de gráficos pesada
      'date-fns',          // Utilitários de data
      '@radix-ui/react-icons',
    ],
  },
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'zczenktzrdqxakfawnfp.supabase.co' },
      { protocol: 'https', hostname: 'zczenktzrdqxakfawnfp.supabaseusercontent.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
    ],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https://zczenktzrdqxakfawnfp.supabase.co https://zczenktzrdqxakfawnfp.supabaseusercontent.com https://images.unsplash.com https://api.dicebear.com",
              "connect-src 'self' https://zczenktzrdqxakfawnfp.supabase.co wss://zczenktzrdqxakfawnfp.supabase.co https://graph.facebook.com https://www.facebook.com",
              "frame-src 'self'",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
