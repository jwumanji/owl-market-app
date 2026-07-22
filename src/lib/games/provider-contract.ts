export const JUSTTCG_NORMALIZED_API_VERSION = "v1" as const;
export const JUSTTCG_NORMALIZED_API_BASE =
  `https://api.justtcg.com/${JUSTTCG_NORMALIZED_API_VERSION}` as const;

export type ProviderContractStatus = "stable" | "raw_only";

export interface ProviderContract {
  provider: string;
  version: string;
  status: ProviderContractStatus;
}

export const JUSTTCG_PROVIDER_CONTRACTS = {
  normalized: {
    provider: "justtcg",
    version: JUSTTCG_NORMALIZED_API_VERSION,
    status: "stable",
  },
  beta: {
    provider: "justtcg",
    version: "v2-beta",
    status: "raw_only",
  },
} as const satisfies Record<string, ProviderContract>;

export function canNormalizeProviderContract(contract: ProviderContract): boolean {
  return contract.status === "stable";
}

