import { DEFAULT_LLM_BOOTSTRAP } from "./llm-provider-defaults.js";

export function createBootstrapLlmConfigFallback() {
  return {
    ...DEFAULT_LLM_BOOTSTRAP,
    apiKey: "",
  };
}
