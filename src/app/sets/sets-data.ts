export interface SetData {
  slug: string;
  code: string;
  displayCode?: string;
  name: string;
  year: number | null;
  type?: "op" | "eb" | "prb" | "st" | "promo" | "main" | "organized" | "judge";
  color: string;
  colorD: string;
  colorBd: string;
  price: number;
  chg7d: number | null;
  chg1d: number | null;
  chg30d: number | null;
  chgMax: number;
  cards: number;
  cardsTotal?: number;
  volume: string;
  ath: string;
  atl: string;
  up: boolean;
  spark: number[];
  perf: { h1: string; h24: string; d7: string; m1: string; y1: string; max: string };
  perfUp: boolean[];
  topCards: TopCard[];
  catalogCards?: CatalogSetCard[];
  sealedProducts?: SealedProductPrice[];
  comingSoon?: boolean;
  pricingStatus?: "priced" | "catalog_only";
}

export interface SealedProductPrice {
  id: string;
  name: string;
  productType: string;
  tcgPrice: number | null;
  marketAvg: number | null;
  chg1d: number | null;
  chg7d: number | null;
  chg30d: number | null;
  productUrl: string | null;
  priceUpdatedAt: string | null;
}

export interface CatalogSetCard {
  id: string;
  cardImageId?: string | null;
  number?: string | null;
  name: string;
  rarity?: string | null;
  variant?: string | null;
  type?: string | null;
  cost?: string | null;
  domains?: string | null;
  img?: string | null;
}

export interface TopCard {
  id?: string;
  img?: string | null;
  e: string;
  n: string;
  rb: string;
  rl: string;
  tcg: number;
  avg: number;
  d1: number | null;
  d7: number | null;
  d30: number | null;
  sp: number[];
}

export interface ExtraSet {
  slug: string;
  code: string;
  displayCode?: string;
  name: string;
  year: number;
  color: string;
  price: number;
  chg7d: number;
  up: boolean;
}

export interface PullRate {
  code: string;
  name: string;
  color: string;
  colorD: string;
  colorBd: string;
  perPack: number;
  perBox: number;
  perCase: number;
  note: string;
}

export const SETS: SetData[] = [
  {slug:'op01',code:'OP01',name:'Romance Dawn',year:2022,color:'#FF4560',colorD:'rgba(255,69,96,0.14)',colorBd:'rgba(255,69,96,0.3)',price:4840,chg7d:5.6,chg1d:1.2,chg30d:18.4,chgMax:142,cards:115,volume:'$42.6K',ath:'$5,200',atl:'$1,840',up:true,spark:[4,5,5,6,6,7,8,8,9,10,11,12,12],perf:{h1:'+0.2%',h24:'+1.2%',d7:'+5.6%',m1:'+18.4%',y1:'+142%',max:'+142%'},perfUp:[true,true,true,true,true,true],topCards:[{e:'\u2620',n:'Monkey D. Luffy MR',rb:'rb-mr',rl:'MANGA RARE',tcg:1240,avg:1310,d1:8.2,d7:12.4,d30:41,sp:[4,5,6,6,8,10,11,12,13]},{e:'\uD83D\uDD25',n:'Luffy SP',rb:'rb-sp',rl:'SPECIAL RARE',tcg:180,avg:187,d1:34.5,d7:41.2,d30:85,sp:[4,5,6,8,10,14,17,18,18]},{e:'\uD83D\uDD34',n:'Shanks SEC',rb:'rb-sec',rl:'SECRET RARE',tcg:41.2,avg:47,d1:-2.1,d7:-5.4,d30:18,sp:[6,6,5,5,4,4,4,4,4]},{e:'\uD83D\uDC8E',n:'Boa Hancock SP',rb:'rb-sp',rl:'SPECIAL RARE',tcg:95,avg:96,d1:2.1,d7:6.3,d30:28,sp:[4,5,5,6,7,8,9,9,9]},{e:'\uD83D\uDC09',n:'Doflamingo SP',rb:'rb-sp',rl:'SPECIAL RARE',tcg:145,avg:148,d1:3.1,d7:8.4,d30:19,sp:[5,5,6,7,8,9,9,10,10]}]},
  {slug:'op02',code:'OP02',name:'Paramount War',year:2023,color:'#4F8EF7',colorD:'rgba(79,142,247,0.14)',colorBd:'rgba(79,142,247,0.3)',price:2840,chg7d:2.1,chg1d:0.4,chg30d:8.2,chgMax:88,cards:116,volume:'$28.4K',ath:'$3,100',atl:'$820',up:true,spark:[4,4,4,5,5,5,5,6,6,6,6,6,6],perf:{h1:'+0.1%',h24:'+0.4%',d7:'+2.1%',m1:'+8.2%',y1:'+88%',max:'+88%'},perfUp:[true,true,true,true,true,true],topCards:[{e:'\uD83C\uDFD4',n:'Whitebeard MR',rb:'rb-mr',rl:'MANGA RARE',tcg:380,avg:395,d1:1.2,d7:3.8,d30:12,sp:[4,4,4,5,5,5,5,6,6]},{e:'\u26A1',n:'Trafalgar Law MR',rb:'rb-mr',rl:'MANGA RARE',tcg:290,avg:305,d1:1.8,d7:4.2,d30:18,sp:[4,4,5,5,6,6,7,7,7]},{e:'\uD83C\uDFF4',n:'Blackbeard TR',rb:'rb-tr',rl:'TREAS. RARE',tcg:22,avg:23,d1:1.5,d7:5.8,d30:11,sp:[4,4,4,5,5,5,6,6,6]},{e:'\uD83D\uDDE1',n:'Roronoa Zoro AA',rb:'rb-aa',rl:'ALT ART',tcg:62,avg:60,d1:-3.4,d7:-5.1,d30:-12,sp:[7,7,6,6,5,5,4,4,4]},{e:'\uD83C\uDF0A',n:'Ace SEC',rb:'rb-sec',rl:'SECRET RARE',tcg:38,avg:40,d1:-1.2,d7:-2.8,d30:6,sp:[5,5,5,4,4,4,4,4,4]}]},
  {slug:'op05',code:'OP05',name:'Awakening New Era',year:2023,color:'#9B72FF',colorD:'rgba(155,114,255,0.14)',colorBd:'rgba(155,114,255,0.3)',price:2280,chg7d:-0.8,chg1d:-0.3,chg30d:6.8,chgMax:74,cards:119,volume:'$22.8K',ath:'$2,640',atl:'$740',up:false,spark:[5,5,5,4,4,4,5,5,5,5,5,5,5],perf:{h1:'-0.1%',h24:'-0.3%',d7:'-0.8%',m1:'+6.8%',y1:'+74%',max:'+74%'},perfUp:[false,false,false,true,true,true],topCards:[{e:'\u26A1',n:'Yamato SEC',rb:'rb-sec',rl:'SECRET RARE',tcg:68,avg:70,d1:4.8,d7:9.1,d30:32,sp:[4,4,5,5,6,7,7,7,7]},{e:'\uD83C\uDF0A',n:'Katakuri MR',rb:'rb-mr',rl:'MANGA RARE',tcg:380,avg:395,d1:2.8,d7:6.1,d30:24,sp:[5,5,6,6,7,7,8,8,8]},{e:'\u26A1',n:'Yamato SP',rb:'rb-sp',rl:'SPECIAL RARE',tcg:72,avg:74,d1:6.2,d7:14.1,d30:38,sp:[3,4,4,5,6,7,8,9,9]},{e:'\uD83C\uDF38',n:'Boa Hancock SR',rb:'rb-sr',rl:'SUPER RARE',tcg:16,avg:17,d1:0.4,d7:1.8,d30:6,sp:[4,4,4,4,4,4,5,5,5]},{e:'\uD83D\uDC09',n:'Kaido SR',rb:'rb-sr',rl:'SUPER RARE',tcg:18,avg:19,d1:0.8,d7:2.4,d30:8,sp:[4,4,4,4,5,5,5,5,5]}]},
  {slug:'op09',code:'OP09',name:'Emperors New World',year:2024,color:'#00D68F',colorD:'rgba(0,214,143,0.14)',colorBd:'rgba(0,214,143,0.3)',price:3640,chg7d:7.3,chg1d:1.8,chg30d:22.4,chgMax:96,cards:118,volume:'$34.2K',ath:'$3,800',atl:'$1,200',up:true,spark:[5,5,6,7,7,8,9,10,10,11,11,11,12],perf:{h1:'+0.3%',h24:'+1.8%',d7:'+7.3%',m1:'+22.4%',y1:'+96%',max:'+96%'},perfUp:[true,true,true,true,true,true],topCards:[{e:'\uD83D\uDC51',n:'Gol D. Roger GMR',rb:'rb-gmr',rl:'GOLDEN MR',tcg:680,avg:700,d1:-1.2,d7:3.4,d30:22,sp:[6,6,7,7,7,7,7,7,8]},{e:'\uD83D\uDD34',n:'Shanks MR',rb:'rb-mr',rl:'MANGA RARE',tcg:520,avg:540,d1:4.1,d7:9.8,d30:31,sp:[4,5,5,6,7,8,8,9,9]},{e:'\uD83D\uDD34',n:'Shanks Leader SR',rb:'rb-sr',rl:'LEADER SR',tcg:28,avg:29,d1:2.4,d7:6.2,d30:18,sp:[4,4,4,5,5,6,6,6,7]},{e:'\u2699',n:'Vegapunk SR',rb:'rb-sr',rl:'SUPER RARE',tcg:14,avg:14,d1:0.2,d7:0.8,d30:4,sp:[4,4,4,4,4,4,4,5,5]},{e:'\uD83C\uDF0A',n:'Jinbe SR',rb:'rb-sr',rl:'SUPER RARE',tcg:12,avg:12,d1:-0.3,d7:0.4,d30:2,sp:[4,4,4,4,4,4,4,4,4]}]},
  {slug:'op14',code:'OP14',displayCode:'OP14-EB04',name:"Azure Sea's Seven -EB04",year:2025,color:'#E8A020',colorD:'rgba(232,160,32,0.18)',colorBd:'rgba(232,160,32,0.38)',price:2140,chg7d:18.4,chg1d:4.2,chg30d:48.6,chgMax:48.6,cards:120,volume:'$28.8K',ath:'$2,140',atl:'$420',up:true,spark:[3,3,4,5,6,8,10,12,14,16,18,19,20],perf:{h1:'+0.8%',h24:'+4.2%',d7:'+18.4%',m1:'+48.6%',y1:'+48.6%',max:'+48.6%'},perfUp:[true,true,true,true,true,true],topCards:[{e:'\u2694',n:'Mihawk MR',rb:'rb-mr',rl:'MANGA RARE',tcg:420,avg:440,d1:12.4,d7:28.6,d30:62,sp:[3,4,5,7,9,12,15,18,20]},{e:'\uD83E\uDD81',n:'Luffy SEC',rb:'rb-sec',rl:'SECRET RARE',tcg:84,avg:88,d1:8.2,d7:18.4,d30:42,sp:[3,3,4,5,7,9,11,13,14]},{e:'\uD83C\uDF0A',n:'Zoro TR',rb:'rb-tr',rl:'TREAS. RARE',tcg:58,avg:60,d1:6.4,d7:14.2,d30:38,sp:[3,3,4,5,6,8,9,11,12]},{e:'\uD83C\uDFB4',n:'Nami SP',rb:'rb-sp',rl:'SPECIAL RARE',tcg:46,avg:48,d1:4.8,d7:11.2,d30:28,sp:[3,3,4,4,5,6,7,8,9]},{e:'\u2694',n:'Mihawk SEC AA',rb:'rb-aa',rl:'ALT ART',tcg:28,avg:26,d1:-6.7,d7:-9.2,d30:-14,sp:[8,8,7,6,5,4,3,3,3]}]},
];

export const ALL_SETS_EXTRA: ExtraSet[] = [
  {slug:'op03',code:'OP03',name:'Pillars of Strength',year:2023,color:'#00C9A7',price:1920,chg7d:-0.4,up:false},
  {slug:'op04',code:'OP04',name:'Kingdom of Intrigue',year:2023,color:'#00D68F',price:1640,chg7d:1.2,up:true},
  {slug:'op06',code:'OP06',name:'Wings of Captain',year:2024,color:'#E8A020',price:2180,chg7d:3.4,up:true},
  {slug:'op07',code:'OP07',name:'500 Years Future',year:2024,color:'#F472B6',price:1920,chg7d:1.8,up:true},
  {slug:'op08',code:'OP08',name:'Two Legends',year:2024,color:'#FF4560',price:2640,chg7d:4.2,up:true},
  {slug:'op10',code:'OP10',name:'Royal Blood',year:2024,color:'#4F8EF7',price:1480,chg7d:2.6,up:true},
  {slug:'op11',code:'OP11',name:'Straw Hat Crew',year:2024,color:'#9B72FF',price:1340,chg7d:-0.2,up:false},
  {slug:'op12',code:'OP12',name:'New Era',year:2024,color:'#E8A020',price:1580,chg7d:1.1,up:true},
  {slug:'op13',code:'OP13',name:'Red Dragon',year:2025,color:'#00D68F',price:1820,chg7d:3.9,up:true},
  {slug:'op15',code:'OP15',displayCode:'OP15-EB04',name:"Adventure on Kami's Island -EB04",year:2025,color:'#F472B6',price:1960,chg7d:9.1,up:true},
  {slug:'op16',code:'OP16',name:'Void Century',year:2025,color:'#4F8EF7',price:1740,chg7d:5.7,up:true},
  {slug:'op17',code:'OP17',name:'Dawn of the World',year:2025,color:'#00C9A7',price:1420,chg7d:2.3,up:true},
  {slug:'eb01',code:'EB01',name:'Memorial Collection',year:2023,color:'#4F8EF7',price:980,chg7d:6.2,up:true},
  {slug:'eb02',code:'EB02',name:"Dragon's Call",year:2024,color:'#9B72FF',price:860,chg7d:4.1,up:true},
  {slug:'eb03',code:'EB03',name:'Side Characters',year:2024,color:'#E8A020',price:740,chg7d:1.8,up:true},
];

export const PULL_RATES: Record<string, PullRate[]> = {
  op01: [
    {code:'MR',name:'Manga Rare',color:'#E8A020',colorD:'rgba(232,160,32,0.18)',colorBd:'rgba(232,160,32,0.3)',perPack:1.4,perBox:1,perCase:6,note:'~1 MR per box guaranteed'},
    {code:'SP',name:'Special Rare',color:'#9B72FF',colorD:'rgba(155,114,255,0.18)',colorBd:'rgba(155,114,255,0.3)',perPack:4.2,perBox:1,perCase:6,note:'~1 SP per box'},
    {code:'SEC',name:'Secret Rare',color:'#FF4560',colorD:'rgba(255,69,96,0.18)',colorBd:'rgba(255,69,96,0.3)',perPack:1.4,perBox:1,perCase:6,note:'~1 per case (6 boxes)'},
    {code:'SR',name:'Super Rare',color:'#00D68F',colorD:'rgba(0,214,143,0.15)',colorBd:'rgba(0,214,143,0.28)',perPack:16.7,perBox:4,perCase:24,note:'~4 per box on average'},
  ],
  op02: [
    {code:'MR',name:'Manga Rare',color:'#E8A020',colorD:'rgba(232,160,32,0.18)',colorBd:'rgba(232,160,32,0.3)',perPack:1.4,perBox:1,perCase:6,note:'~1 MR per box guaranteed'},
    {code:'TR',name:'Treas. Rare',color:'#FDE047',colorD:'rgba(234,179,8,0.18)',colorBd:'rgba(234,179,8,0.3)',perPack:1.4,perBox:1,perCase:6,note:'~1 TR per box'},
    {code:'SEC',name:'Secret Rare',color:'#FF4560',colorD:'rgba(255,69,96,0.18)',colorBd:'rgba(255,69,96,0.3)',perPack:1.4,perBox:1,perCase:6,note:'~1 per case (6 boxes)'},
    {code:'SR',name:'Super Rare',color:'#00D68F',colorD:'rgba(0,214,143,0.15)',colorBd:'rgba(0,214,143,0.28)',perPack:16.7,perBox:4,perCase:24,note:'~4 per box on average'},
  ],
  op09: [
    {code:'GMR',name:'Golden MR',color:'#F5BE50',colorD:'rgba(245,190,80,0.25)',colorBd:'rgba(245,190,80,0.5)',perPack:0.7,perBox:1,perCase:3,note:'~1 per 2 boxes'},
    {code:'MR',name:'Manga Rare',color:'#E8A020',colorD:'rgba(232,160,32,0.18)',colorBd:'rgba(232,160,32,0.3)',perPack:1.4,perBox:1,perCase:6,note:'~1 MR per box'},
    {code:'SEC',name:'Secret Rare',color:'#FF4560',colorD:'rgba(255,69,96,0.18)',colorBd:'rgba(255,69,96,0.3)',perPack:1.4,perBox:1,perCase:6,note:'~1 per case'},
    {code:'SR',name:'Super Rare',color:'#00D68F',colorD:'rgba(0,214,143,0.15)',colorBd:'rgba(0,214,143,0.28)',perPack:16.7,perBox:4,perCase:24,note:'~4 per box'},
  ],
  op14: [
    {code:'MR',name:'Manga Rare',color:'#E8A020',colorD:'rgba(232,160,32,0.18)',colorBd:'rgba(232,160,32,0.3)',perPack:1.4,perBox:1,perCase:6,note:'~1 MR per box'},
    {code:'SEC',name:'Secret Rare',color:'#FF4560',colorD:'rgba(255,69,96,0.18)',colorBd:'rgba(255,69,96,0.3)',perPack:1.4,perBox:1,perCase:6,note:'~1 per case'},
    {code:'AA',name:'Alt Art',color:'#7FB0FA',colorD:'rgba(79,142,247,0.18)',colorBd:'rgba(79,142,247,0.3)',perPack:2.8,perBox:1,perCase:6,note:'~1 per box'},
    {code:'SR',name:'Super Rare',color:'#00D68F',colorD:'rgba(0,214,143,0.15)',colorBd:'rgba(0,214,143,0.28)',perPack:16.7,perBox:4,perCase:24,note:'~4 per box'},
  ],
};

export const DEFAULT_PULL_RATES: PullRate[] = [
  {code:'MR',name:'Manga Rare',color:'#E8A020',colorD:'rgba(232,160,32,0.18)',colorBd:'rgba(232,160,32,0.3)',perPack:1.4,perBox:1,perCase:6,note:'~1 MR per box'},
  {code:'SP',name:'Special Rare',color:'#9B72FF',colorD:'rgba(155,114,255,0.18)',colorBd:'rgba(155,114,255,0.3)',perPack:4.2,perBox:1,perCase:6,note:'~1 SP per box'},
  {code:'SEC',name:'Secret Rare',color:'#FF4560',colorD:'rgba(255,69,96,0.18)',colorBd:'rgba(255,69,96,0.3)',perPack:1.4,perBox:1,perCase:6,note:'~1 per case'},
  {code:'SR',name:'Super Rare',color:'#00D68F',colorD:'rgba(0,214,143,0.15)',colorBd:'rgba(0,214,143,0.28)',perPack:16.7,perBox:4,perCase:24,note:'~4 per box'},
];
