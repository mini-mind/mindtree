const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const {
  buildGenerationPrompt,
  buildOraclePrompt,
  createApp,
  DEFAULT_LLM_CONFIG,
  MODEL_CAPABILITIES,
} = require("../server-app");

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

test("buildGenerationPrompt includes the reasoning chain and requested branch count", () => {
  const prompt = buildGenerationPrompt(
    [
      { title: "问题定义", detail: "确认边界条件" },
      { title: "假设A", detail: "如果资源不足会怎样" },
    ],
    4,
    ""
  );

  assert.match(prompt.user, /Need 4 candidate branches\./);
  assert.match(prompt.user, /1\. 问题定义/);
  assert.match(prompt.user, /2\. 假设A/);
});

test("buildOraclePrompt includes candidate pool and final branch count", () => {
  const prompt = buildOraclePrompt(
    [{ title: "问题定义", detail: "确认边界条件" }],
    [
      { title: "分支一", detail: "先看资源约束" },
      { title: "分支二", detail: "先看需求变化" },
    ],
    1,
    ""
  );

  assert.match(prompt.user, /Return exactly 1 branches\./);
  assert.match(prompt.user, /Candidate branch pool:/);
  assert.match(prompt.user, /1\. 分支一/);
  assert.match(prompt.user, /2\. 分支二/);
});

test("GET /api/default-config returns SiliconFlow defaults", async () => {
  const app = createApp();
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/default-config`);
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.baseUrl, DEFAULT_LLM_CONFIG.baseUrl);
    assert.equal(data.model, DEFAULT_LLM_CONFIG.model);
    assert.deepEqual(data.modelCapabilities, MODEL_CAPABILITIES);
    assert.ok(Array.isArray(data.knownModels));
    assert.ok(data.knownModels.includes(DEFAULT_LLM_CONFIG.model));
  } finally {
    server.close();
  }
});

test("POST /api/expand validates missing chain", async () => {
  const app = createApp();
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/expand`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    assert.equal(response.status, 400);
    assert.equal(data.error, "chain is required");
  } finally {
    server.close();
  }
});

test("POST /api/expand runs generator then oracle and returns filtered branches", async () => {
  const fetchCalls = [];
  const app = createApp({
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url: String(url), options });
      if (fetchCalls.length === 1) {
        return createJsonResponse(200, {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  branches: [
                    { title: "继续验证供应约束", detail: "检查是否存在单点瓶颈。" },
                    { title: "评估需求变化", detail: "确认真实需求是否会波动。" },
                    { title: "检查成本弹性", detail: "测算不同策略的成本空间。" },
                    { title: "构建冗余方案", detail: "为关键路径准备备选手段。" },
                    { title: "观察时间窗口", detail: "识别最敏感的推进时机。" },
                    { title: "排查外部依赖", detail: "找出依赖项的失效模式。" },
                  ],
                }),
              },
            },
          ],
        });
      }

      return createJsonResponse(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                branches: [
                  { title: "继续验证供应约束", detail: "检查是否存在单点瓶颈。" },
                  { title: "排查外部依赖", detail: "找出依赖项的失效模式。" },
                ],
              }),
            },
          },
        ],
      });
    },
  });
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/expand`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chain: [{ title: "根问题", detail: "观察变量变化" }],
        branchCount: 2,
        config: {
          apiKey: "test-key",
        },
      }),
    });
    const data = await response.json();
    const generatorPayload = JSON.parse(fetchCalls[0].options.body);
    const oraclePayload = JSON.parse(fetchCalls[1].options.body);

    assert.equal(response.status, 200);
    assert.equal(fetchCalls.length, 2);
    assert.equal(fetchCalls[0].url, "https://api.siliconflow.cn/v1/chat/completions");
    assert.equal(fetchCalls[0].options.headers.Authorization, "Bearer test-key");
    assert.equal(generatorPayload.model, "deepseek-ai/DeepSeek-V3.2");
    assert.equal(generatorPayload.reasoning_effort, undefined);
    assert.equal(generatorPayload.enable_thinking, true);
    assert.equal(generatorPayload.thinking_budget, 4096);
    assert.match(generatorPayload.messages[0].content, /reasoning-expander/);
    assert.match(oraclePayload.messages[0].content, /branch-oracle/);
    assert.match(oraclePayload.messages[1].content, /Candidate branch pool:/);
    assert.equal(data.branches[0].title, "继续验证供应约束");
    assert.equal(data.branches.length, 2);
  } finally {
    server.close();
  }
});

test("POST /api/expand surfaces invalid JSON from model as 502", async () => {
  const app = createApp({
    fetchImpl: async () =>
      createJsonResponse(200, {
        choices: [{ message: { content: "not json" } }],
      }),
  });
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/expand`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chain: [{ title: "根问题", detail: "" }],
        config: { apiKey: "test-key" },
      }),
    });
    const data = await response.json();

    assert.equal(response.status, 502);
    assert.equal(data.error, "Model did not return valid JSON");
    assert.equal(data.raw, "not json");
  } finally {
    server.close();
  }
});
