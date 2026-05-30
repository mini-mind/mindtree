const { DEFAULT_LLM_CONFIG } = require("../llm-defaults");
const { MODEL_CAPABILITIES } = require("../model-capabilities");

function buildDefaultConfigResponse() {
  return {
    baseUrl: DEFAULT_LLM_CONFIG.baseUrl,
    model: DEFAULT_LLM_CONFIG.model,
    agents: DEFAULT_LLM_CONFIG.agents,
    modelCapabilities: MODEL_CAPABILITIES,
  };
}

function mergeLlmConfig(config = {}) {
  return {
    ...DEFAULT_LLM_CONFIG,
    ...config,
    agents: {
      ...DEFAULT_LLM_CONFIG.agents,
      ...(config.agents || {}),
    },
  };
}

function resolveAgentConnection(config, agentKey) {
  const override = config.agents?.[agentKey] || {};
  return {
    baseUrl: override.baseUrl || config.baseUrl,
    apiKey: override.apiKey || config.apiKey,
    model: override.model || config.model,
  };
}

module.exports = {
  buildDefaultConfigResponse,
  mergeLlmConfig,
  resolveAgentConnection,
};
