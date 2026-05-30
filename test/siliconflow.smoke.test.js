const test = require("node:test");
const assert = require("node:assert/strict");
const { runNodeAgent, DEFAULT_LLM_CONFIG } = require("../server-app");

test("SiliconFlow DeepSeek-V3.2 smoke test", async () => {
  const apiKey = process.env.SILICONFLOW_API_KEY;
  assert.ok(apiKey, "SILICONFLOW_API_KEY is required for live API tests");

  const result = await runNodeAgent({
    agentKey: "assistant",
    context: {
      focusNode: {
        id: 1,
        type: "agent",
        data: {
          summary: "产品要做通用有向图协作画布",
          messages: [
            {
              role: "user",
              content: "希望多个节点类型和 agent 可以长期协作。",
            },
          ],
        },
      },
      linkedNodes: [],
    },
    prompt: "请给出下一步最小可执行建议",
    config: {
      ...DEFAULT_LLM_CONFIG,
      apiKey,
    },
  });

  assert.equal(typeof result.message, "string");
  assert.ok(result.message.length > 0);
});
