const { getModelOptionDefaults } = require("./model-capabilities");
const {
  DEFAULT_AGENT_OVERRIDES,
  PRIMARY_PROVIDER_DEFAULTS,
} = require("./shared/llm-provider-defaults");

const DEFAULT_LLM_CONFIG = {
  baseUrl: PRIMARY_PROVIDER_DEFAULTS.baseUrl,
  apiKey: "",
  model: PRIMARY_PROVIDER_DEFAULTS.model,
  agents: DEFAULT_AGENT_OVERRIDES,
  assistantSystemPrompt: [
    "你是一个可复用的专业图节点 agent。",
    "任务：基于当前焦点节点及其关联节点，输出一次结构化、可执行、面向后续协作的响应。",
    "要求：",
    "1. 优先结合焦点节点的摘要、消息记录以及入边/出边关联节点，明确当前约束、依赖和下一步。",
    "2. 输出应简洁、专业、可衔接，不要空泛复述。",
    "3. 若信息不足，明确指出缺口，并给出最小可执行下一步。",
    "4. 输出：仅返回 JSON，格式为 {\"message\":\"...\",\"summary\":\"可选的简短节点摘要\"}。",
  ].join("\n"),
  ...getModelOptionDefaults(PRIMARY_PROVIDER_DEFAULTS.model),
};

module.exports = {
  DEFAULT_LLM_CONFIG,
};
