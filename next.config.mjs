/** @type {import('next').NextConfig} */
const nextConfig = {
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
