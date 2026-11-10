import { describe, expect, it } from "vitest";
import type { ILLM } from "..";
import {
  isRetryableCapabilityError,
  resolveCapabilityCandidates,
} from "./capabilityRouter";

function model(
  title: string,
  provider: string,
  uniqueId = title,
): ILLM {
  return {
    title,
    model: title,
    providerName: provider,
    underlyingProviderName: provider,
    uniqueId,
  } as ILLM;
}

describe("capability router", () => {
  const local = model("qwen-local", "ollama");
  const cloud = model("openrouter-fast", "openrouter");
  const cloudBackup = model("openrouter-backup", "openrouter");

  it("resolves primary and ordered fallback models by configured title", () => {
    expect(
      resolveCapabilityCandidates(
        [local, cloud, cloudBackup],
        { model: "qwen-local", fallbacks: ["openrouter-fast", "openrouter-backup"] },
      ),
    ).toEqual([local, cloud, cloudBackup]);
  });

  it("supports cloud-to-local fallback when configured", () => {
    expect(
      resolveCapabilityCandidates(
        [local, cloud],
        { model: "openrouter-fast", fallbacks: ["qwen-local"] },
        "both",
      ),
    ).toEqual([cloud, local]);
  });

  it("enforces one-way fallback direction", () => {
    expect(
      resolveCapabilityCandidates(
        [local, cloud],
        { model: "qwen-local", fallbacks: ["openrouter-fast"] },
        "cloud-to-local",
      ),
    ).toEqual([local]);
  });

  it("fails fast when a route references an unconfigured model", () => {
    expect(() =>
      resolveCapabilityCandidates(
        [local],
        { model: "missing-model" },
      ),
    ).toThrow(/unknown model/i);
  });

  it("retries only explicitly recognized transient failures", () => {
    const unavailable = Object.assign(new Error("offline"), {
      code: "ECONNREFUSED",
    });
    const rateLimited = Object.assign(new Error("rate limited"), {
      status: 429,
    });
    const invalidRequest = Object.assign(new Error("bad request"), {
      status: 400,
    });

    expect(isRetryableCapabilityError(unavailable)).toBe(true);
    expect(isRetryableCapabilityError(rateLimited)).toBe(true);
    expect(isRetryableCapabilityError(invalidRequest)).toBe(false);
    expect(isRetryableCapabilityError(unavailable, [])).toBe(false);
  });
});
