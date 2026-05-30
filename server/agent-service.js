const { createHttpError } = require("./errors");
const { normalizeGraphContext } = require("./graph-context");
const { requestModelJson } = require("./llm-client");
const { mergeLlmConfig, resolveAgentConnection } = require("./config");
const { formatLinkedNodes, formatNode } = require("./prompts");

function validateAgentRunInput(agentKey, context, prompt, config) {
  if (!agentKey || typeof agentKey !== "string") {
    throw createHttpError(400, "agentKey is required");
  }

  if (!context?.focusNode) {
    throw createHttpError(400, "context is required");
  }

  if (!prompt || !String(prompt).trim()) {
    throw createHttpError(400, "prompt is required");
  }

  if (!config.apiKey || !config.baseUrl || !config.model) {
    throw createHttpError(400, "Missing LLM config");
  }
}

function buildAgentRunPrompt(context, prompt, systemPrompt = "") {
  return {
    system: systemPrompt,
    user: [
      "Focus node:",
      formatNode(context.focusNode),
      "",
      "Linked nodes:",
      formatLinkedNodes(context.linkedNodes || []),
      "",
      `User request: ${String(prompt).trim()}`,
      "",
      'Return JSON only in the form: {"message":"one response message","summary":"optional short node summary"}',
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

async function runNodeAgent({
  agentKey,
  context,
  prompt,
  config = {},
  systemPrompt = "",
  fetchImpl = fetch,
}) {
  const mergedConfig = mergeLlmConfig(config);
  const normalizedContext = normalizeGraphContext(context);
  validateAgentRunInput(agentKey, normalizedContext, prompt, mergedConfig);

  const agentConfig = resolveAgentConnection(mergedConfig, agentKey);
  const result = await requestModelJson({
    baseUrl: agentConfig.baseUrl,
    apiKey: agentConfig.apiKey,
    model: agentConfig.model,
    config: mergedConfig,
    prompt: buildAgentRunPrompt(
      normalizedContext,
      prompt,
      systemPrompt || mergedConfig.assistantSystemPrompt
    ),
    fetchImpl,
  });

  if (!result || typeof result.message !== "string") {
    throw createHttpError(502, "Agent response missing message");
  }

  return {
    message: String(result.message).trim(),
    summary: typeof result.summary === "string" ? result.summary.trim() : "",
  };
}

module.exports = {
  runNodeAgent,
  buildAgentRunPrompt,
};
