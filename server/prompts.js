const { DEFAULT_LLM_CONFIG } = require("../llm-defaults");

function formatChain(chain) {
  return chain
    .map((node, index) => `${index + 1}. ${node.summary || ""}\n${node.detail || ""}`.trim())
    .join("\n\n");
}

function formatBranchPool(branches) {
  return branches
    .map(
      (branch, index) => `${index + 1}. ${branch.summary || ""}\n${branch.detail || ""}`.trim()
    )
    .join("\n\n");
}

function buildGenerationPrompt(chain, branchCount, systemPrompt, direction = "") {
  return {
    system: systemPrompt || DEFAULT_LLM_CONFIG.generatorSystemPrompt,
    user: [
      "Given the reasoning chain below, infer plausible next branches.",
      `Need ${branchCount} candidate branches.`,
      direction ? `Focus direction: ${direction}` : "",
      "Return JSON only in the form:",
      '{"branches":[{"summary":"one-sentence branch summary","detail":"one-paragraph explanation"}]}',
      "",
      "Reasoning chain:",
      formatChain(chain),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function buildOraclePrompt(chain, branches, branchCount, systemPrompt) {
  return {
    system: systemPrompt || DEFAULT_LLM_CONFIG.oracleSystemPrompt,
    user: [
      "Given the reasoning chain and the candidate branch pool below, keep only the strongest next branches.",
      `Return exactly ${branchCount} branches.`,
      "Return JSON only in the form:",
      '{"branches":[{"summary":"one-sentence branch summary","detail":"one-paragraph explanation"}]}',
      "",
      "Reasoning chain:",
      formatChain(chain),
      "",
      "Candidate branch pool:",
      formatBranchPool(branches),
    ].join("\n"),
  };
}

module.exports = {
  buildGenerationPrompt,
  buildOraclePrompt,
};
