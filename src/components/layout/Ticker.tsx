import { RIFTBOUND_ROUTE_SLUG } from "@/lib/games/registry";

type TickerDatum = { n: string; p: string; c: string; up: boolean };

const ONE_PIECE_TICKER: TickerDatum[] = [
  { n: "Luffy MR", p: "$1,240", c: "+8.2%", up: true },
  { n: "Shanks SEC", p: "$41.20", c: "-2.1%", up: false },
  { n: "Luffy SP", p: "$180", c: "+34.5%", up: true },
  { n: "Roger GMR", p: "$680", c: "-1.2%", up: false },
  { n: "Hancock SP", p: "$95", c: "+2.1%", up: true },
  { n: "Yamato SEC", p: "$68", c: "+4.8%", up: true },
  { n: "Ace Trophy", p: "$2,100", c: "+5.3%", up: true },
  { n: "Zoro AA", p: "$62", c: "-3.4%", up: false },
  { n: "Mihawk AA", p: "$28", c: "-6.7%", up: false },
  { n: "Katakuri MR", p: "$380", c: "+2.8%", up: true },
  { n: "Doflamingo SP", p: "$145", c: "+3.1%", up: true },
  { n: "Teach TR", p: "$22", c: "+1.5%", up: true },
];

const RIFTBOUND_TICKER: TickerDatum[] = [
  { n: "Ahri Metal", p: "$5.4K", c: "+0.0%", up: true },
  { n: "Ahri Signature", p: "$2.7K", c: "+0.0%", up: true },
  { n: "Kai'Sa Signature", p: "$2.6K", c: "+0.0%", up: true },
  { n: "Kai'Sa Metal", p: "$2.3K", c: "+0.0%", up: true },
  { n: "Jinx Metal", p: "$2.1K", c: "+0.0%", up: true },
  { n: "Annie Metal", p: "$1.4K", c: "+55.6%", up: true },
  { n: "Draven Metal", p: "$1.0K", c: "+21.7%", up: true },
  { n: "Karma Signature", p: "$273.73", c: "+7.8%", up: true },
  { n: "Jhin Signature", p: "$277.28", c: "-1.7%", up: false },
  { n: "Diana Overnumbered", p: "$193.33", c: "-1.3%", up: false },
];

function TickerItem({ n, p, c, up }: TickerDatum) {
  return (
    <div className="c-ti">
      <span className="c-ti-name">{n}</span>
      <span className="c-ti-price">{p}</span>
      <span className={up ? "c-ti-up" : "c-ti-dn"}>{c}</span>
    </div>
  );
}

export default function Ticker({ gameRouteSlug }: { gameRouteSlug?: string | null }) {
  const tickerData = gameRouteSlug === RIFTBOUND_ROUTE_SLUG ? RIFTBOUND_TICKER : ONE_PIECE_TICKER;
  const items = [...tickerData, ...tickerData];

  return (
    <div className="c-ticker-bar">
      <div className="c-ticker-track">
        {items.map((t, i) => (
          <TickerItem key={i} {...t} />
        ))}
      </div>
    </div>
  );
}
