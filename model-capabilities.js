const MODEL_CAPABILITIES = {
  "deepseek-ai/DeepSeek-V3.2": {
    options: [
      {
        key: "enableThinking",
        label: "Enable Thinking",
        type: "boolean",
        defaultValue: true,
        requestField: "enable_thinking",
      },
      {
        key: "thinkingBudget",
        label: "Thinking Budget",
        type: "number",
        defaultValue: 4096,
        min: 256,
        step: 256,
        requestField: "thinking_budget",
      },
    ],
  },
  "deepseek-ai/DeepSeek-V4-Flash": {
    options: [
      {
        key: "reasoningEffort",
        label: "Reasoning Effort",
        type: "select",
        defaultValue: "high",
        requestField: "reasoning_effort",
        choices: ["high", "max"],
      },
    ],
  },
};

function getModelCapabilities(model) {
  return MODEL_CAPABILITIES[model] || { options: [] };
}

function getModelOptionDefaults(model) {
  const capability = getModelCapabilities(model);
  return capability.options.reduce((accumulator, option) => {
    accumulator[option.key] = option.defaultValue;
    return accumulator;
  }, {});
}

function normalizeOptionValue(option, value) {
  if (option.type === "boolean") {
    return value !== false && value !== "false";
  }

  if (option.type === "number") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : option.defaultValue;
  }

  if (option.type === "select") {
    return option.choices.includes(value) ? value : option.defaultValue;
  }

  return typeof value === "string" ? value : option.defaultValue;
}

function buildModelRequestOptions(model, config) {
  const capability = getModelCapabilities(model);
  return capability.options.reduce((accumulator, option) => {
    const normalizedValue = normalizeOptionValue(option, config[option.key]);
    if (normalizedValue !== undefined && normalizedValue !== null && normalizedValue !== "") {
      accumulator[option.requestField] = normalizedValue;
    }
    return accumulator;
  }, {});
}

module.exports = {
  MODEL_CAPABILITIES,
  buildModelRequestOptions,
  getModelCapabilities,
  getModelOptionDefaults,
  normalizeOptionValue,
};
