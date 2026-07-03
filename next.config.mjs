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
  images: {
    formats: ["image/avif", "image/webp"],
    // 384 gives the 380px card-detail hero a near-exact rung at 1x DPR
    // (otherwise the srcset jumps from 256 straight to the 640 device size).
    imageSizes: [32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 86400,
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
