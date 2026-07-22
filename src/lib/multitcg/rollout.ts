export type MultiTcgReadMode = "legacy" | "shadow_compare" | "preferred_projection";

export interface MultiTcgRolloutConfig {
  dualWriteEnabled: boolean;
  readMode: MultiTcgReadMode;
}

const VALID_READ_MODES = new Set<MultiTcgReadMode>([
  "legacy",
  "shadow_compare",
  "preferred_projection",
]);

function enabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

export function getMultiTcgRolloutConfig(
  env: NodeJS.ProcessEnv = process.env
): MultiTcgRolloutConfig {
  const requestedMode = env.MULTITCG_READ_MODE as MultiTcgReadMode | undefined;
  const readMode = requestedMode && VALID_READ_MODES.has(requestedMode)
    ? requestedMode
    : "legacy";

  const config = {
    dualWriteEnabled: enabled(env.MULTITCG_DUAL_WRITE_ENABLED),
    readMode,
  };
  assertSafeMultiTcgRollout(config);
  return config;
}

export function assertSafeMultiTcgRollout(config: MultiTcgRolloutConfig): void {
  if (config.readMode !== "legacy" && !config.dualWriteEnabled) {
    throw new Error(
      `MULTITCG_READ_MODE=${config.readMode} requires MULTITCG_DUAL_WRITE_ENABLED=1`
    );
  }
}
