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
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });

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

    await page.evaluate(() => window.__mindtreeTestApi.openNodeById(1));
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

    const graph = await page.evaluate(() => window.__mindtreeTestApi.getGraph());

    assert.match(helpText, /节点记录/);
    assert.equal(nodeDialogSnapshot.summaryText, "未命名节点");
    assert.match(nodeDialogSnapshot.statusText, /记录/);
    assert.equal(graph.nodes.length, 2);
    assert.equal(graph.edges.length, 0);
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
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      window.__mindtreeTestApi.setGraph({
        nodes: [
          { id: 1, type: "note", x: 0, y: -220, data: { summary: "", messages: [] } },
          { id: 2, type: "note", x: 0, y: 0, data: { summary: "", messages: [] } },
          { id: 3, type: "note", x: 0, y: 220, data: { summary: "", messages: [] } },
        ],
        edges: [],
      });
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

    const graph = await page.evaluate(() => window.__mindtreeTestApi.getGraph());
    assert.equal(graph.nodes.length, 1);
  } finally {
    await browser.close();
    server.close();
  }
});

test("UI creates an edge by right-dragging from one node to another", async () => {
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
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      window.__mindtreeTestApi.setGraph({
        nodes: [
          { id: 1, type: "note", x: 0, y: 0, data: { summary: "源节点", messages: [] } },
          { id: 2, type: "note", x: 320, y: 0, data: { summary: "目标节点", messages: [] } },
        ],
        edges: [],
      });
    });

    const from = await page.evaluate(() => window.__mindtreeTestApi.getNodeScreenBox(1));
    const to = await page.evaluate(() => window.__mindtreeTestApi.getNodeScreenBox(2));

    await page.mouse.move(from.x + from.width - 4, from.y + from.height / 2);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(to.x + 8, to.y + to.height / 2, { steps: 10 });
    await page.mouse.up({ button: "right" });

    await page.waitForSelector("#create-edge-dialog[open]");
    const edgeDialogText = await page.$eval("#create-edge-description", (el) => el.textContent);
    assert.match(edgeDialogText, /源节点/);
    assert.match(edgeDialogText, /目标节点/);

    await page.$eval("#create-edge-label", (el, value) => {
      el.value = value;
    }, "主连接");
    await page.$eval("#create-edge-note", (el, value) => {
      el.value = value;
    }, "这是一个测试关系");
    await page.$eval("#confirm-create-edge", (button) => button.click());
    await page.waitForSelector("#create-edge-dialog:not([open])");

    const graph = await page.evaluate(() => window.__mindtreeTestApi.getGraph());
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].source, 1);
    assert.equal(graph.edges[0].target, 2);
    assert.equal(graph.edges[0].type, "relates_to");
    assert.equal(graph.edges[0].data.label, "主连接");
    assert.equal(graph.edges[0].data.note, "这是一个测试关系");
  } finally {
    await browser.close();
    server.close();
  }
});

test("UI test bridge exposes relation buckets for a generic directed graph", async () => {
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
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });

    const edgeTypes = await page.evaluate(() => window.__mindtreeTestApi.listEdgeTypes());
    assert.deepEqual(
      edgeTypes.map((item) => item.type),
      ["relates_to", "depends_on", "feeds_context", "assigns_to", "blocks"]
    );

    await page.evaluate(() => {
      window.__mindtreeTestApi.setGraph({
        nodes: [
          { id: 1, type: "note", x: 0, y: 0, data: { summary: "焦点", messages: [] } },
          { id: 2, type: "note", x: 240, y: 0, data: { summary: "依赖", messages: [] } },
          { id: 3, type: "note", x: 0, y: 180, data: { summary: "输入", messages: [] } },
        ],
        edges: [
          { id: 1, type: "depends_on", source: 2, target: 1, data: {} },
          { id: 2, type: "feeds_context", source: 3, target: 1, data: {} },
        ],
      });
    });

    const context = await page.evaluate(() => window.__mindtreeTestApi.extractGraphContext(1));
    assert.equal(context.focusNode.data.summary, "焦点");
    assert.equal(context.relations.incoming.length, 2);
    assert.equal(context.relations.byType.incoming.depends_on.length, 1);
    assert.equal(context.relations.byType.incoming.feeds_context.length, 1);
  } finally {
    await browser.close();
    server.close();
  }
});

test("UI rejects duplicate graph ids in the test bridge", async () => {
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
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });

    const duplicateNodeError = await page.evaluate(() => {
      try {
        window.__mindtreeTestApi.setGraph({
          nodes: [
            { id: 1, type: "note", x: 0, y: 0, data: { summary: "", messages: [] } },
            { id: 1, type: "note", x: 200, y: 0, data: { summary: "", messages: [] } },
          ],
          edges: [],
        });
        return "";
      } catch (error) {
        return error.message;
      }
    });

    assert.equal(duplicateNodeError, "duplicate node id: 1");
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
                  message: "建议先明确外部依赖边界，再安排验证顺序。",
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
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });

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

    const graphAfterCreate = await page.evaluate(() => window.__mindtreeTestApi.getGraph());
    const agentNode = graphAfterCreate.nodes.find((node) => node.type === "agent");
    assert.ok(agentNode);
    assert.equal(agentNode.data.agentKey, "assistant");

    await page.evaluate((nodeId) => window.__mindtreeTestApi.openNodeById(nodeId), agentNode.id);
    await page.waitForSelector("#node-dialog[open]");
    await page.$eval("#node-dialog-direction", (el, value) => {
      el.value = value;
    }, "请分析当前风险");
    await page.$eval("#node-dialog-submit", (button) => button.click());

    await page.waitForFunction(() => {
      return document.getElementById("node-dialog-status").textContent.includes("Agent 已完成本轮响应");
    });

    const graphAfterRun = await page.evaluate(() => window.__mindtreeTestApi.getGraph());
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
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });

    await page.evaluate(() => window.__mindtreeTestApi.openNodeById(1));
    await page.waitForSelector("#node-dialog[open]");
    await page.$eval("#node-dialog-direction", (el, value) => {
      el.value = value;
    }, "记录一个新的观察");
    await page.$eval("#node-dialog-submit", (button) => button.click());

    const graph = await page.evaluate(() => window.__mindtreeTestApi.getGraph());
    assert.equal(graph.nodes[0].data.messages.length, 1);
    assert.equal(graph.nodes[0].data.messages[0].content, "记录一个新的观察");
    assert.equal(graph.nodes[0].data.summary, "记录一个新的观察");
  } finally {
    await browser.close();
    server.close();
  }
});
