"use client";

const TICKER_DATA = [
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

function TickerItem({ n, p, c, up }: (typeof TICKER_DATA)[number]) {
  return (
    <div className="c-ti">
      <span className="c-ti-name">{n}</span>
      <span className="c-ti-price">{p}</span>
      <span className={up ? "c-ti-up" : "c-ti-dn"}>{c}</span>
    </div>
  );
}

export default function Ticker() {
  const items = [...TICKER_DATA, ...TICKER_DATA];

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
