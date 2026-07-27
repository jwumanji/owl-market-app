const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";

export type TcgCsvPromoMapping = {
  slug: string;
  tcgplayer?: {
    productId: number;
    categoryId: number;
    groupId: number;
  };
};

type TcgCsvProduct = {
  productId: number;
  name: string;
  imageUrl: string | null;
  url: string | null;
  modifiedOn: string | null;
};

type TcgCsvPrice = {
  productId: number;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  directLowPrice: number | null;
  subTypeName: string | null;
};

type TcgCsvResponse<T> = {
  success: boolean;
  errors?: string[];
  results: T[];
};

export type TcgCsvPromoProduct = {
  slug: string;
  productId: number;
  categoryId: number;
  groupId: number;
  name: string;
  imageUrl: string | null;
  productUrl: string;
  modifiedOn: string | null;
  marketPrice: number | null;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  subTypeName: string | null;
};

async function getCollection<T>(url: string, fetchImpl: typeof fetch): Promise<T[]> {
  const response = await fetchImpl(url, {
    headers: { "User-Agent": "MoonMarket/1.0" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`TCGCSV ${response.status}: ${url}`);
  }
  const payload = (await response.json()) as TcgCsvResponse<T>;
  if (!payload.success) {
    throw new Error(`TCGCSV request failed: ${(payload.errors ?? []).join(", ")}`);
  }
  return payload.results ?? [];
}

function finitePrice(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function selectPrice(rows: TcgCsvPrice[]) {
  return (
    rows.find((row) => row.subTypeName?.toLowerCase() === "normal" && finitePrice(row.marketPrice) != null) ??
    rows.find((row) => finitePrice(row.marketPrice) != null) ??
    rows[0] ??
    null
  );
}

export async function fetchTcgCsvPromoProducts(
  mappings: readonly TcgCsvPromoMapping[],
  fetchImpl: typeof fetch = fetch
): Promise<TcgCsvPromoProduct[]> {
  const mapped = mappings.flatMap((entry) =>
    entry.tcgplayer ? [{ slug: entry.slug, ...entry.tcgplayer }] : []
  );
  const sources = new Map<string, { categoryId: number; groupId: number }>();
  for (const entry of mapped) {
    sources.set(`${entry.categoryId}:${entry.groupId}`, entry);
  }

  const productById = new Map<number, TcgCsvProduct>();
  const pricesById = new Map<number, TcgCsvPrice[]>();

  for (const { categoryId, groupId } of sources.values()) {
    const prefix = `${TCGCSV_BASE}/${categoryId}/${groupId}`;
    const [products, prices] = await Promise.all([
      getCollection<TcgCsvProduct>(`${prefix}/products`, fetchImpl),
      getCollection<TcgCsvPrice>(`${prefix}/prices`, fetchImpl),
    ]);
    for (const product of products) productById.set(product.productId, product);
    for (const price of prices) {
      const rows = pricesById.get(price.productId) ?? [];
      rows.push(price);
      pricesById.set(price.productId, rows);
    }
  }

  return mapped.flatMap((mapping) => {
    const product = productById.get(mapping.productId);
    if (!product) return [];
    const price = selectPrice(pricesById.get(mapping.productId) ?? []);
    return [{
      slug: mapping.slug,
      productId: mapping.productId,
      categoryId: mapping.categoryId,
      groupId: mapping.groupId,
      name: product.name,
      imageUrl: product.imageUrl,
      productUrl: product.url ?? `https://www.tcgplayer.com/product/${mapping.productId}`,
      modifiedOn: product.modifiedOn,
      marketPrice: finitePrice(price?.marketPrice),
      lowPrice: finitePrice(price?.lowPrice),
      midPrice: finitePrice(price?.midPrice),
      highPrice: finitePrice(price?.highPrice),
      subTypeName: price?.subTypeName ?? null,
    }];
  });
}
