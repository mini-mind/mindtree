const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const {
  buildAgentRunPrompt,
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

test("buildAgentRunPrompt includes focus node, relations, and user request", () => {
  const prompt = buildAgentRunPrompt(
    {
      focusNode: {
        id: 1,
        type: "agent",
        data: {
          summary: "研究 Agent",
          messages: [{ role: "agent", agent: "assistant", content: "负责分析外部依赖" }],
        },
      },
      relations: {
        incoming: [
          {
            id: 1,
            type: "depends_on",
            direction: "incoming",
            node: {
              id: 2,
              type: "note",
              data: { summary: "依赖项", messages: [] },
            },
          },
        ],
        outgoing: [],
      },
    },
    "请分析当前风险",
    "custom system"
  );

  assert.equal(prompt.system, "custom system");
  assert.match(prompt.user, /Focus node:/);
  assert.match(prompt.user, /Incoming relations:/);
  assert.match(prompt.user, /depends_on/);
  assert.match(prompt.user, /User request: 请分析当前风险/);
});

test("GET /api/default-config returns current defaults", async () => {
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
    assert.deepEqual(data.agents, DEFAULT_LLM_CONFIG.agents);
    assert.deepEqual(data.modelCapabilities, MODEL_CAPABILITIES);
  } finally {
    server.close();
  }
});

test("POST /api/agent-run validates missing context", async () => {
  const app = createApp();
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/agent-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentKey: "assistant",
        prompt: "分析风险",
        config: { apiKey: "test-key" },
      }),
    });
    const data = await response.json();

    assert.equal(response.status, 400);
    assert.equal(data.error, "context is required");
  } finally {
    server.close();
  }
});

test("POST /api/agent-run rejects invalid relation snapshots", async () => {
  const app = createApp();
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/agent-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentKey: "assistant",
        prompt: "分析风险",
        context: {
          focusNode: {
            id: 1,
            type: "agent",
            data: { summary: "研究 Agent", messages: [] },
          },
          relations: {
            incoming: [{ id: 1, type: "depends_on", direction: "incoming", node: null, data: {} }],
            outgoing: [],
          },
        },
        config: { apiKey: "test-key" },
      }),
    });
    const data = await response.json();

    assert.equal(response.status, 400);
    assert.equal(data.error, "context is required");
  } finally {
    server.close();
  }
});

test("POST /api/agent-run uses per-agent overrides when provided", async () => {
  const fetchCalls = [];
  const app = createApp({
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url: String(url), options: JSON.parse(options.body) });
      return createJsonResponse(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                message: "建议先盘点外部依赖，再确认单点故障风险。",
                summary: "外部依赖风险分析",
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
    const response = await fetch(`http://127.0.0.1:${port}/api/agent-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentKey: "assistant",
        prompt: "请分析当前风险",
        context: {
          focusNode: {
            id: 1,
            type: "agent",
            data: { summary: "研究 Agent", messages: [] },
          },
          relations: { incoming: [], outgoing: [] },
        },
        config: {
          baseUrl: "https://base.example/v1",
          apiKey: "base-key",
          model: "deepseek-ai/DeepSeek-V3.2",
          agents: {
            assistant: {
              baseUrl: "https://assistant.example/v1",
              apiKey: "assistant-key",
              model: "deepseek-ai/DeepSeek-V3.2",
            },
          },
        },
      }),
    });
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "https://assistant.example/v1/chat/completions");
    assert.equal(data.message, "建议先盘点外部依赖，再确认单点故障风险。");
    assert.equal(data.summary, "外部依赖风险分析");
  } finally {
    server.close();
  }
});

test("POST /api/agent-run surfaces invalid JSON from model as 502", async () => {
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
    const response = await fetch(`http://127.0.0.1:${port}/api/agent-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentKey: "assistant",
        prompt: "请分析当前风险",
        context: {
          focusNode: {
            id: 1,
            type: "agent",
            data: { summary: "研究 Agent", messages: [] },
          },
          relations: { incoming: [], outgoing: [] },
        },
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
