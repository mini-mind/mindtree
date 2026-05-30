const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const puppeteer = require("puppeteer-core");
const { createApp } = require("../server-app");

const CHROME_PATH = process.env.CHROME_BIN || "/usr/bin/google-chrome";

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

async function confirmDefaultCreateNode(page) {
  await page.waitForSelector("#create-node-dialog[open]");
  await page.$eval("#confirm-create-node", (button) => button.click());
  await page.waitForSelector("#create-node-dialog:not([open])");
}

async function seedGraph(page, graph) {
  await page.evaluate((value) => {
    localStorage.setItem("mindzoo.graph.v2", JSON.stringify(value));
  }, graph);
  await page.reload({ waitUntil: "networkidle0" });
}

async function seedConfig(page, config) {
  await page.evaluate((value) => {
    localStorage.setItem("mindzoo.llm.v2", JSON.stringify(value));
  }, config);
  await page.reload({ waitUntil: "networkidle0" });
}

async function readStoredGraph(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("mindzoo.graph.v2") || "null"));
}

async function openNodeByDoubleClick(page, nodeId) {
  await page.waitForFunction(
    (id) => {
      const box = window.__mindzooTestApi?.getNodeScreenBox(id);
      return box && box.width > 0 && box.height > 0;
    },
    {},
    nodeId
  );
  const box = await page.evaluate((id) => window.__mindzooTestApi.getNodeScreenBox(id), nodeId);
  assert.ok(box, `missing node screen box for node ${nodeId}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  await page.mouse.click(x, y);
}

test("UI flow covers help, config, graph defaults, and context menus", async () => {
  const app = createApp({
    fetchImpl: async () => createJsonResponse(200, { choices: [] }),
  });
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/?test=1`, { waitUntil: "networkidle0" });

    await page.$eval("#floating-help", (button) => button.click());
    await page.waitForSelector("#help-dialog[open]");
    const helpText = await page.$eval("#help-dialog", (dialog) => dialog.textContent);
    await page.$eval("#close-help", (button) => button.click());
    await page.waitForSelector("#help-dialog:not([open])");

    await page.$eval("#floating-config", (button) => button.click());
    await page.waitForSelector("#config-panel-base.is-active");
    await page.select("#cfg-model-select", "deepseek-ai/DeepSeek-V3.2");
    await page.$eval("#cfg-api-key", (el, value) => {
      el.value = value;
    }, "test-key");
    await page.$eval("#save-config", (button) => button.click());

    await openNodeByDoubleClick(page, 1);
    await page.waitForSelector("#node-dialog[open]");
    const nodeDialogSnapshot = await page.$eval("#node-dialog", (dialog) => ({
      summaryText: dialog.querySelector("#node-dialog-summary").textContent,
      statusText: dialog.querySelector("#node-dialog-status").textContent,
    }));
    await page.$eval("#close-node-dialog", (button) => button.click());
    await page.waitForSelector("#node-dialog:not([open])");

    await page.mouse.click(520, 420, { button: "right" });
    await page.waitForSelector("#canvas-context-menu:not([hidden])");
    await page.$eval("#context-add-node", (button) => button.click());
    await page.waitForSelector("#canvas-context-menu[hidden]");
    await confirmDefaultCreateNode(page);

    const graph = await readStoredGraph(page);

    assert.match(helpText, /节点内部维护的连接信息/);
    assert.equal(nodeDialogSnapshot.summaryText, "未命名节点");
    assert.match(nodeDialogSnapshot.statusText, /记录/);
    assert.equal(graph.nodes.length, 2);
    assert.equal(graph.nodes[0].type, "note");
  } finally {
    await browser.close();
    server.close();
  }
});

test("UI supports marquee selection and batch delete", async () => {
  const app = createApp({
    fetchImpl: async () => createJsonResponse(200, { choices: [] }),
  });
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/?test=1`, { waitUntil: "networkidle0" });
    await seedGraph(page, {
      nodes: [
        { id: 1, type: "note", x: 0, y: -220, data: { summary: "", messages: [] } },
        { id: 2, type: "note", x: 0, y: 0, data: { summary: "", messages: [] } },
        { id: 3, type: "note", x: 0, y: 220, data: { summary: "", messages: [] } },
      ],
    });

    await page.keyboard.down("Shift");
    await page.mouse.move(300, 100);
    await page.mouse.down();
    await page.mouse.move(620, 580, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up("Shift");

    await page.mouse.click(340, 180, { button: "right" });
    await page.waitForSelector("#canvas-context-menu:not([hidden])");
    await page.$eval("#context-delete-selected-nodes", (button) => button.click());
    await page.waitForSelector("#canvas-context-menu[hidden]");

    const graph = await readStoredGraph(page);
    assert.equal(graph.nodes.length, 1);
  } finally {
    await browser.close();
    server.close();
  }
});

test("UI extracts agent-owned linked nodes", async () => {
  const app = createApp({
    fetchImpl: async (url, options) => {
      if (String(url).includes("/chat/completions")) {
        const payload = JSON.parse(options.body);
        return createJsonResponse(200, {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  message: payload.messages?.[1]?.content || "",
                  summary: "",
                }),
              },
            },
          ],
        });
      }

      return createJsonResponse(200, { choices: [] });
    },
  });
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/?test=1`, { waitUntil: "networkidle0" });
    await seedGraph(page, {
      nodes: [
        {
          id: 1,
          type: "agent",
          x: 0,
          y: 0,
          data: {
            summary: "执行 Agent",
            messages: [],
            agentKey: "assistant",
            taskBoards: [
              {
                nodeId: 2,
                label: "执行任务",
                config: {},
              },
            ],
          },
        },
        {
          id: 2,
          type: "task_board",
          x: 260,
          y: 0,
          data: { summary: "共享任务板", items: [], messages: [] },
        },
      ],
    });
    await seedConfig(page, {
      baseUrl: "https://api.siliconflow.cn/v1",
      apiKey: "test-key",
      model: "deepseek-ai/DeepSeek-V3.2",
      agents: {
        assistant: {},
      },
    });

    await openNodeByDoubleClick(page, 1);
    await page.waitForSelector("#node-dialog[open]");
    await page.$eval("#node-dialog-direction", (el, value) => {
      el.value = value;
    }, "分析关联节点");
    const requestPromise = page.waitForRequest((request) => {
      return (
        request.method() === "POST" &&
        request.url() === `http://127.0.0.1:${port}/api/agent-run`
      );
    });
    await page.$eval("#node-dialog-submit", (button) => button.click());
    const request = await requestPromise;
    const capturedContext = JSON.parse(request.postData()).context;

    assert.equal(capturedContext.focusNode.data.summary, "执行 Agent");
    assert.equal(capturedContext.linkedNodes.length, 1);
    assert.equal(capturedContext.linkedNodes[0].type, "agent/task_board");
    assert.equal(capturedContext.linkedNodes[0].node.data.summary, "共享任务板");
  } finally {
    await browser.close();
    server.close();
  }
});

test("UI rejects duplicate node ids in the test bridge", async () => {
  const app = createApp({
    fetchImpl: async () => createJsonResponse(200, { choices: [] }),
  });
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/?test=1`, { waitUntil: "networkidle0" });

    await page.evaluate(() => {
      localStorage.setItem(
        "mindzoo.graph.v2",
        JSON.stringify({
          nodes: [
            { id: 1, type: "note", x: 0, y: 0, data: { summary: "", messages: [] } },
            { id: 1, type: "note", x: 200, y: 0, data: { summary: "", messages: [] } },
          ],
        })
      );
    });
    await page.reload({ waitUntil: "networkidle0" });
    const statusText = await page.$eval("#status", (el) => el.textContent);
    assert.match(statusText, /duplicate node id: 1/);
  } finally {
    await browser.close();
    server.close();
  }
});

test("UI can create and run an agent node through the node dialog", async () => {
  const app = createApp({
    fetchImpl: async (url) => {
      if (String(url).includes("/chat/completions")) {
        return createJsonResponse(200, {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  message: "建议先确认 agent 的内部连接是否覆盖目标任务板。",
                  summary: "研究 Agent",
                }),
              },
            },
          ],
        });
      }

      return createJsonResponse(200, { choices: [] });
    },
  });
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/?test=1`, { waitUntil: "networkidle0" });

    await page.$eval("#floating-config", (button) => button.click());
    await page.waitForSelector("#config-panel-base.is-active");
    await page.$eval("#cfg-api-key", (el, value) => {
      el.value = value;
    }, "test-key");
    await page.$eval("#save-config", (button) => button.click());

    await page.mouse.click(520, 420, { button: "right" });
    await page.waitForSelector("#canvas-context-menu:not([hidden])");
    await page.$eval("#context-add-node", (button) => button.click());
    await page.waitForSelector("#create-node-dialog[open]");
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("#create-node-type-list .option-card")].find((item) =>
        item.textContent.includes("Agent 节点")
      );
      button.click();
    });
    await page.$eval("#confirm-create-node", (button) => button.click());
    await page.waitForSelector("#create-node-dialog:not([open])");

    const graphAfterCreate = await readStoredGraph(page);
    const agentNode = graphAfterCreate.nodes.find((node) => node.type === "agent");
    assert.ok(agentNode);
    assert.equal(agentNode.data.agentKey, "assistant");
    assert.deepEqual(agentNode.data.taskBoards, []);

    await openNodeByDoubleClick(page, agentNode.id);
    await page.waitForSelector("#node-dialog[open]");
    await page.$eval("#node-dialog-direction", (el, value) => {
      el.value = value;
    }, "请分析当前风险");
    await page.$eval("#node-dialog-submit", (button) => button.click());

    await page.waitForFunction(() => {
      return document.getElementById("node-dialog-status").textContent.includes("Agent 已完成本轮响应");
    });

    const graphAfterRun = await readStoredGraph(page);
    const updatedAgentNode = graphAfterRun.nodes.find((node) => node.type === "agent");
    assert.equal(updatedAgentNode.data.summary, "研究 Agent");
    assert.equal(updatedAgentNode.data.messages.length, 2);
    assert.equal(updatedAgentNode.data.messages[1].agent, "assistant");
  } finally {
    await browser.close();
    server.close();
  }
});

test("UI can append messages to a generic note node", async () => {
  const app = createApp({
    fetchImpl: async () => createJsonResponse(200, { choices: [] }),
  });
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/?test=1`, { waitUntil: "networkidle0" });

    await openNodeByDoubleClick(page, 1);
    await page.waitForSelector("#node-dialog[open]");
    await page.$eval("#node-dialog-direction", (el, value) => {
      el.value = value;
    }, "记录一个新的观察");
    await page.$eval("#node-dialog-submit", (button) => button.click());

    const graph = await readStoredGraph(page);
    assert.equal(graph.nodes[0].data.messages.length, 1);
    assert.equal(graph.nodes[0].data.messages[0].content, "记录一个新的观察");
    assert.equal(graph.nodes[0].data.summary, "记录一个新的观察");
  } finally {
    await browser.close();
    server.close();
  }
});
