const { createHttpError } = require("./errors");
const { requestModelJson } = require("./llm-client");
const { buildGenerationPrompt, buildOraclePrompt } = require("./prompts");
const { mergeLlmConfig, resolveAgentConnection } = require("./config");

function normalizeBranches(branches) {
  return branches
    .filter((branch) => branch && branch.summary)
    .map((branch) => ({
      summary: String(branch.summary).trim(),
      detail: String(branch.detail || "").trim(),
    }));
}

function validateExpandInput(chain, config) {
  if (!Array.isArray(chain) || chain.length === 0) {
    throw createHttpError(400, "chain is required");
  }

  if (!config.apiKey || !config.baseUrl || !config.model) {
    throw createHttpError(400, "Missing LLM config");
  }
}

async function requestBranches({
  chain,
  branchCount = 3,
  direction = "",
  config = {},
  fetchImpl = fetch,
}) {
  const mergedConfig = mergeLlmConfig(config);
  validateExpandInput(chain, mergedConfig);
  const candidateMultiplier = Math.max(1, Number(mergedConfig.candidateMultiplier) || 1);

  const candidateCount = Math.max(
    branchCount,
    branchCount * candidateMultiplier
  );
  const generatorConfig = resolveAgentConnection(mergedConfig, "generator");

  const generated = await requestModelJson({
    baseUrl: generatorConfig.baseUrl,
    apiKey: generatorConfig.apiKey,
    model: generatorConfig.model,
    config: mergedConfig,
    prompt: buildGenerationPrompt(
      chain,
      candidateCount,
      mergedConfig.generatorSystemPrompt,
      direction
    ),
    fetchImpl,
  });

  if (!Array.isArray(generated.branches)) {
    throw createHttpError(502, "Model response missing branches");
  }

  const candidates = normalizeBranches(generated.branches);
  if (candidates.length <= branchCount) {
    return candidates;
  }

  const oracleConfig = resolveAgentConnection(mergedConfig, "oracle");
  const filtered = await requestModelJson({
    baseUrl: oracleConfig.baseUrl,
    apiKey: oracleConfig.apiKey,
    model: oracleConfig.model,
    config: mergedConfig,
    prompt: buildOraclePrompt(
      chain,
      candidates,
      branchCount,
      mergedConfig.oracleSystemPrompt
    ),
    fetchImpl,
  });

  if (!Array.isArray(filtered.branches)) {
    throw createHttpError(502, "Model response missing branches");
  }

  return normalizeBranches(filtered.branches).slice(0, branchCount);
}

module.exports = {
  requestBranches,
};
