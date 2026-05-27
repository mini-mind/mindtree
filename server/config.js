const { DEFAULT_LLM_CONFIG } = require("../llm-defaults");
const { MODEL_CAPABILITIES } = require("../model-capabilities");

function buildDefaultConfigResponse() {
  return {
    baseUrl: DEFAULT_LLM_CONFIG.baseUrl,
    model: DEFAULT_LLM_CONFIG.model,
    oracleBaseUrl: DEFAULT_LLM_CONFIG.oracleBaseUrl,
    oracleApiKey: DEFAULT_LLM_CONFIG.oracleApiKey,
    oracleModel: DEFAULT_LLM_CONFIG.oracleModel,
    candidateMultiplier: DEFAULT_LLM_CONFIG.candidateMultiplier,
    modelCapabilities: MODEL_CAPABILITIES,
    knownModels: Object.keys(MODEL_CAPABILITIES),
  };
}

function mergeLlmConfig(config = {}) {
  return { ...DEFAULT_LLM_CONFIG, ...config };
}

module.exports = {
  buildDefaultConfigResponse,
  mergeLlmConfig,
};
