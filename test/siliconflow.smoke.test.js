const test = require("node:test");
const assert = require("node:assert/strict");
const { requestBranches, DEFAULT_LLM_CONFIG } = require("../server-app");

test("SiliconFlow DeepSeek-V3.2 smoke test", async () => {
  const apiKey = process.env.SILICONFLOW_API_KEY;
  assert.ok(apiKey, "SILICONFLOW_API_KEY is required for live API tests");

  const branches = await requestBranches({
    chain: [
      {
        summary: "产品要做逻辑推演树",
        detail: "需要在某个节点基础上继续推演多个后续可能性。",
      },
    ],
    branchCount: 2,
    config: {
      ...DEFAULT_LLM_CONFIG,
      apiKey,
    },
  });

  assert.ok(Array.isArray(branches));
  assert.ok(branches.length > 0);
  assert.ok(branches.every((branch) => branch.summary));
});
