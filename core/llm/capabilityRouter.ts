import type { ILLM } from "..";

export type CapabilityFallbackDirection =
  | "none"
  | "local-to-cloud"
  | "cloud-to-local"
  | "both";

export interface CapabilityRouteConfig {
  model: string;
  fallbacks?: string[];
}

export interface CapabilityRoutingConfig {
  routes: Record<string, CapabilityRouteConfig>;
  fallbackDirection?: CapabilityFallbackDirection;
  retryOn?: ("unavailable" | "timeout" | "rate-limit" | "server-error")[];
}

function findConfiguredModel(models: ILLM[], identifier: string): ILLM | undefined {
  return models.find(
    (model) => model.title === identifier || model.model === identifier,
  );
}

function isLocalModel(model: ILLM): boolean {
  return ["ollama", "lmstudio", "llamacpp", "llamafile", "lemonade"].includes(
    model.underlyingProviderName.toLowerCase(),
  );
}

function directionAllows(
  primary: ILLM,
  candidate: ILLM,
  direction: CapabilityFallbackDirection,
): boolean {
  if (direction === "both") return true;
  if (direction === "none") return false;
  const primaryIsLocal = isLocalModel(primary);
  const candidateIsLocal = isLocalModel(candidate);
  if (primaryIsLocal === candidateIsLocal) return true;
  return direction === "local-to-cloud"
    ? primaryIsLocal && !candidateIsLocal
    : !primaryIsLocal && candidateIsLocal;
}

/**
 * Resolve a route to configured runtime instances. No provider is instantiated
 * here: this guarantees that fallbacks use the exact configured Ollama,
 * OpenRouter, credentials, API base and model options.
 */
export function resolveCapabilityCandidates(
  models: ILLM[],
  route: CapabilityRouteConfig,
  fallbackDirection: CapabilityFallbackDirection = "both",
): ILLM[] {
  const primary = findConfiguredModel(models, route.model);
  if (!primary) {
    throw new Error(
      `Capability route references unknown model "${route.model}". Configure it in models first.`,
    );
  }

  const candidates = [primary];
  for (const identifier of route.fallbacks ?? []) {
    const candidate = findConfiguredModel(models, identifier);
    if (!candidate) {
      throw new Error(
        `Capability fallback references unknown model "${identifier}". Configure it in models first.`,
      );
    }
    if (
      candidate.uniqueId !== primary.uniqueId &&
      directionAllows(primary, candidate, fallbackDirection) &&
      !candidates.some((item) => item.uniqueId === candidate.uniqueId)
    ) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

export function isRetryableCapabilityError(
  error: unknown,
  retryOn: CapabilityRoutingConfig["retryOn"] = [
    "unavailable",
    "timeout",
    "rate-limit",
    "server-error",
  ],
): boolean {
  if (!retryOn?.length || !(error instanceof Error)) return false;
  const value = error as Error & {
    code?: string;
    status?: number;
    statusCode?: number;
    response?: { status?: number };
  };
  const status = value.status ?? value.statusCode ?? value.response?.status;
  const code = value.code ?? "";

  if (
    retryOn.includes("rate-limit") &&
    status === 429
  ) return true;
  if (
    retryOn.includes("server-error") &&
    typeof status === "number" &&
    status >= 500
  ) return true;
  if (
    retryOn.includes("timeout") &&
    ["ETIMEDOUT", "ECONNABORTED", "UND_ERR_CONNECT_TIMEOUT"].includes(code)
  ) return true;
  if (
    retryOn.includes("unavailable") &&
    ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ECONNRESET"].includes(code)
  ) return true;
  return false;
}
