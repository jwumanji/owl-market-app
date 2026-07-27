// Only card-art hosts that actually appear in the DB image columns or in code.
// Keep this list explicit — a wildcard turns the image optimizer into an open proxy.
const supabaseStorageHostname = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This repository is commonly opened from a parent directory that also has
  // a lockfile. Keep output tracing scoped to this app instead of letting Next
  // infer C:\Users\Justin wu as the workspace root.
  outputFileTracingRoot: process.cwd(),
  experimental: {
    // Inline all CSS into the HTML (Next 15+). Kills the two render-blocking
    // stylesheet requests PSI flagged ~570ms on every page — ~20KB br of CSS
    // total, and no Early Hints on this deployment to parallelize them.
    inlineCss: true,
    // If a hot-card prerender is enabled with CARD_STATIC_PARAMS_COUNT, keep
    // its concurrency bounded so builds and live traffic do not stampede the
    // database when multiple deployments overlap.
    staticGenerationMaxConcurrency: 4,
    staticGenerationRetryCount: 3,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    // 384 gives the 300px card-detail hero a near-exact rung at 1x DPR, and
    // 576 catches DPR 1.75 (PSI's moto g: 300css -> 525px needed — without it
    // the srcset jumps to 640 and serves the ~596px source, ~12KiB waste).
    imageSizes: [32, 48, 64, 96, 128, 256, 384, 576],
    // 31 days: mirrored card art is effectively immutable (re-mirrors are
    // rare), and a cold /_next/image encode costs ~2.3s on the LCP path —
    // once the warm cron has swept a transform it should stay warm.
    minimumCacheTTL: 2678400,
    remotePatterns: [
      ...(supabaseStorageHostname
        ? [
            {
              protocol: "https",
              hostname: supabaseStorageHostname,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
      { protocol: "https", hostname: "optcgapi.com" },
      { protocol: "https", hostname: "en.onepiece-cardgame.com" },
      { protocol: "https", hostname: "product-images.tcgplayer.com" },
      { protocol: "https", hostname: "tcgplayer-cdn.tcgplayer.com" },
    ],
  },
  async redirects() {
    return [
      { source: "/markets", destination: "/games/one-piece/markets", permanent: false },
      { source: "/sets", destination: "/games/one-piece/sets", permanent: false },
      {
        source: "/sets/:slug((?!.*\\.(?:jpg|jpeg|png|webp|gif|svg|ico)$).*)",
        destination: "/games/one-piece/sets/:slug",
        permanent: false,
      },
      { source: "/card/:id", destination: "/games/one-piece/card/:id", permanent: false },
      { source: "/rarities", destination: "/games/one-piece/rarities", permanent: false },
      { source: "/characters", destination: "/games/one-piece/characters", permanent: false },
    ];
  },
};

export default nextConfig;
