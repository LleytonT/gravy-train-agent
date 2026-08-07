import {
  DEFAULT_DISCOVERY_LIMITS,
  type DiscoveryLimits,
  type LimitTracker,
} from "./types.js";

export function createLimitTracker(
  overrides?: Partial<DiscoveryLimits>,
): LimitTracker {
  const limits: DiscoveryLimits = {
    maxSourceItems:
      overrides?.maxSourceItems ?? DEFAULT_DISCOVERY_LIMITS.maxSourceItems,
    maxWebSearches:
      overrides?.maxWebSearches ?? DEFAULT_DISCOVERY_LIMITS.maxWebSearches,
    maxModelCalls:
      overrides?.maxModelCalls ?? DEFAULT_DISCOVERY_LIMITS.maxModelCalls,
  };

  let webSearchesUsed = 0;
  let modelCallsUsed = 0;

  return {
    limits,
    get webSearchesUsed() {
      return webSearchesUsed;
    },
    get modelCallsUsed() {
      return modelCallsUsed;
    },
    canWebSearch() {
      return webSearchesUsed < limits.maxWebSearches;
    },
    recordWebSearch() {
      if (webSearchesUsed >= limits.maxWebSearches) {
        throw new Error(
          `Web search limit exceeded (${limits.maxWebSearches})`,
        );
      }
      webSearchesUsed += 1;
    },
    canModelCall() {
      return modelCallsUsed < limits.maxModelCalls;
    },
    recordModelCall() {
      if (modelCallsUsed >= limits.maxModelCalls) {
        throw new Error(`Model call limit exceeded (${limits.maxModelCalls})`);
      }
      modelCallsUsed += 1;
    },
    snapshot() {
      return {
        webSearchesUsed,
        modelCallsUsed,
        maxWebSearches: limits.maxWebSearches,
        maxModelCalls: limits.maxModelCalls,
      };
    },
  };
}
