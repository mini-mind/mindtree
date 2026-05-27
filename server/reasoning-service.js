const { createHttpError } = require("./errors");
const { requestModelJson } = require("./llm-client");
const { buildGenerationPrompt, buildOraclePrompt } = require("./prompts");
const { mergeLlmConfig } = require("./config");

function normalizeBranches(branches) {
  return branches
    .filter((branch) => branch && branch.title)
    .map((branch) => ({
      title: String(branch.title).trim(),
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
  config = {},
  fetchImpl = fetch,
}) {
  const mergedConfig = mergeLlmConfig(config);
  validateExpandInput(chain, mergedConfig);

  const candidateCount = Math.max(
    branchCount,
    branchCount * (mergedConfig.candidateMultiplier || 1)
  );

  const generated = await requestModelJson({
    baseUrl: mergedConfig.baseUrl,
    apiKey: mergedConfig.apiKey,
    model: mergedConfig.model,
    config: mergedConfig,
    prompt: buildGenerationPrompt(
      chain,
      candidateCount,
      mergedConfig.generatorSystemPrompt
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

  const filtered = await requestModelJson({
    baseUrl: mergedConfig.oracleBaseUrl || mergedConfig.baseUrl,
    apiKey: mergedConfig.oracleApiKey || mergedConfig.apiKey,
    model: mergedConfig.oracleModel || mergedConfig.model,
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
