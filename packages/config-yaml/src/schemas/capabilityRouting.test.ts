import { configYamlSchema } from "./index.js";

describe("capability routing schema", () => {
  it("accepts independent model routes and applies bidirectional fallback defaults", () => {
    const parsed = configYamlSchema.parse({
      name: "local-first",
      version: "1.0.0",
      capabilityRouting: {
        routes: {
          autocomplete: {
            model: "qwen-local",
            fallbacks: ["openrouter-fast"],
          },
          chat: {
            model: "openrouter-chat",
            fallbacks: ["qwen-local"],
          },
          "image-understanding": {
            model: "vision-local",
          },
        },
      },
    });

    expect(parsed.capabilityRouting?.fallbackDirection).toBe("both");
    expect(parsed.capabilityRouting?.retryOn).toEqual([
      "unavailable",
      "timeout",
      "rate-limit",
      "server-error",
    ]);
    expect(parsed.capabilityRouting?.cooldownMs).toBe(30_000);
    expect(parsed.capabilityRouting?.routes.autocomplete.fallbacks).toEqual([
      "openrouter-fast",
    ]);
  });

  it("rejects empty model identifiers and negative cooldowns", () => {
    expect(
      configYamlSchema.safeParse({
        name: "invalid",
        version: "1.0.0",
        capabilityRouting: {
          routes: { chat: { model: "" } },
          cooldownMs: -1,
        },
      }).success,
    ).toBe(false);
  });

  it("allows disabling fallback explicitly", () => {
    const parsed = configYamlSchema.parse({
      name: "strict-local",
      version: "1.0.0",
      capabilityRouting: {
        routes: { chat: { model: "qwen-local" } },
        fallbackDirection: "none",
      },
    });

    expect(parsed.capabilityRouting?.fallbackDirection).toBe("none");
  });
});
