const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const puppeteer = require("puppeteer-core");
const { createApp } = require("../server/routes");
const { DEFAULT_LLM_CONFIG } = require("../llm-defaults");

const CHROME_PATH = process.env.CHROME_BIN || "/usr/bin/google-chrome";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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

function findNodeById(graph, nodeId) {
  return graph?.nodes?.find((node) => node.id === nodeId) || null;
}

function findMountByPath(mounts, targetPath, parentPath = "node") {
  for (const mount of Array.isArray(mounts) ? mounts : []) {
    const path = parentPath === "node" ? mount.key : `${parentPath}/${mount.key}`;
    if (path === targetPath) {
      return mount;
    }

    const nested = findMountByPath(mount.mounts, targetPath, path);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function withPosition(node, x, y) {
  return {
    ...node,
    data: {
      ...(node.data || {}),
      x,
      y,
    },
  };
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

async function openPluginBackpack(page) {
  await page.$eval("#open-plugin-backpack", (button) => button.click());
  await page.waitForSelector("#plugin-backpack-dialog[open]");
}

async function selectPluginTreeItem(page, title) {
  await page.evaluate((label) => {
    const items = [...document.querySelectorAll("#plugin-installed-tree .plugin-tree-item")];
    const target = items.find((item) => item.textContent.includes(label));
    if (!target) {
      throw new Error(`plugin tree item not found: ${label}`);
    }
    target.click();
  }, title);
}

async function selectPluginCard(page, label) {
  await page.evaluate((targetLabel) => {
    const cards = [...document.querySelectorAll("#plugin-backpack-list .option-card")];
    const target = cards.find((card) => card.textContent.includes(targetLabel));
    if (!target) {
      throw new Error(`plugin card not found: ${targetLabel}`);
    }
    target.click();
  }, label);
}

async function getNodeCenter(page, nodeId) {
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
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

async function dispatchTouch(page, type, touches) {
  await page.evaluate(
    ({ type: eventType, touches: pointList }) => {
      const canvas = document.getElementById("graph-canvas");
      const targetTouches = pointList.map((point) => {
        return new Touch({
          identifier: point.identifier,
          target: canvas,
          clientX: point.x,
          clientY: point.y,
          pageX: point.x,
          pageY: point.y,
          screenX: point.x,
          screenY: point.y,
          radiusX: 8,
          radiusY: 8,
          rotationAngle: 0,
          force: 0.5,
        });
      });
      const changedTouches = targetTouches;
      const touchEvent = new TouchEvent(eventType, {
        bubbles: true,
        cancelable: true,
        touches: eventType === "touchend" || eventType === "touchcancel" ? [] : targetTouches,
        targetTouches:
          eventType === "touchend" || eventType === "touchcancel" ? [] : targetTouches,
        changedTouches,
      });
      canvas.dispatchEvent(touchEvent);
    },
    { type, touches }
  );
}

async function touchTap(page, x, y, identifier = 1) {
  await dispatchTouch(page, "touchstart", [{ x, y, identifier }]);
  await dispatchTouch(page, "touchend", [{ x, y, identifier }]);
}

async function touchDoubleTap(page, x, y) {
  await touchTap(page, x, y, 11);
  await sleep(80);
  await touchTap(page, x, y, 12);
}

async function touchLongPress(page, x, y, holdMs = 520, identifier = 21) {
  await dispatchTouch(page, "touchstart", [{ x, y, identifier }]);
  await sleep(holdMs);
  await dispatchTouch(page, "touchend", [{ x, y, identifier }]);
}

async function touchDrag(page, start, end, identifier = 31, steps = 8) {
  await dispatchTouch(page, "touchstart", [{ x: start.x, y: start.y, identifier }]);
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    await dispatchTouch(page, "touchmove", [
      {
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
        identifier,
      },
    ]);
  }
  await dispatchTouch(page, "touchend", [{ x: end.x, y: end.y, identifier }]);
}

async function getMinimapGeometry(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById("graph-canvas");
    const width = window.innerWidth;
    const height = window.innerHeight;
    const mobile = width <= 640 || height <= 720;
    const theme = mobile
      ? { width: 144, height: 102, margin: 14, padding: 9 }
      : { width: 196, height: 132, margin: 20, padding: 12 };

    return {
      cardX: width - theme.width - theme.margin,
      cardY: height - theme.height - theme.margin,
      cardWidth: theme.width,
      cardHeight: theme.height,
      contentX: width - theme.width - theme.margin + theme.padding,
      contentY: height - theme.height - theme.margin + theme.padding,
      contentWidth: theme.width - theme.padding * 2,
      contentHeight: theme.height - theme.padding * 2,
      canvasTag: canvas.tagName,
    };
  });
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
    await page.select("#cfg-model-select", DEFAULT_LLM_CONFIG.model);
    await page.$eval("#cfg-api-key", (el, value) => {
      el.value = value;
    }, "test-key");
    await page.evaluate(() => {
      const fields = [...document.querySelectorAll("#model-options .field")];
      const thinkingToggle = fields.find((field) => field.textContent.includes("Enable Thinking"));
      const thinkingBudget = fields.find((field) => field.textContent.includes("Thinking Budget"));
      if (!thinkingToggle || !thinkingBudget) {
        throw new Error("model option fields not found");
      }

      thinkingToggle.querySelector("select").value = "false";
      thinkingBudget.querySelector("input").value = "2048";
    });
    await page.$eval("#save-config", (button) => button.click());

    const storedConfigAfterSave = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("mindzoo.llm.v2") || "null")
    );
    assert.equal(storedConfigAfterSave.enableThinking, false);
    assert.equal(storedConfigAfterSave.thinkingBudget, 2048);

    await page.reload({ waitUntil: "networkidle0" });

    await page.$eval("#floating-config", (button) => button.click());
    await page.waitForSelector("#config-panel-base.is-active");
    const restoredModelOptions = await page.evaluate(() => {
      const fields = [...document.querySelectorAll("#model-options .field")];
      const thinkingToggle = fields.find((field) => field.textContent.includes("Enable Thinking"));
      const thinkingBudget = fields.find((field) => field.textContent.includes("Thinking Budget"));
      return {
        enableThinking: thinkingToggle?.querySelector("select")?.value || "",
        thinkingBudget: thinkingBudget?.querySelector("input")?.value || "",
      };
    });
    assert.equal(restoredModelOptions.enableThinking, "false");
    assert.equal(restoredModelOptions.thinkingBudget, "2048");
    await page.$eval("#close-config", (button) => button.click());
    await page.waitForSelector("#config-dialog:not([open])");

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

    assert.match(helpText, /空节点创建后可在对话框中按需挂载插件/);
    assert.equal(nodeDialogSnapshot.summaryText, "未命名节点");
    assert.match(nodeDialogSnapshot.statusText, /插件背包/);
    assert.equal(graph.nodes.length, 2);
    assert.ok(Array.isArray(graph.nodes[0].mounts));
    assert.deepEqual(graph.nodes[1].mounts, []);
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
        withPosition({ id: 1, data: { summary: "", messages: [] } }, 0, -220),
        withPosition({ id: 2, data: { summary: "", messages: [] } }, 0, 0),
        withPosition({ id: 3, data: { summary: "", messages: [] } }, 0, 220),
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

test("UI minimap supports click and drag navigation", async () => {
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
        withPosition({ id: 1, data: { summary: "起点", messages: [] } }, 0, 0),
        withPosition({ id: 2, data: { summary: "远端节点", messages: [] } }, 1800, 1200),
      ],
    });

    const geometry = await getMinimapGeometry(page);
    await page.mouse.click(
      geometry.contentX + geometry.contentWidth * 0.9,
      geometry.contentY + geometry.contentHeight * 0.9
    );

    await page.waitForFunction(
      () => {
        const box = window.__mindzooTestApi?.getNodeScreenBox(2);
        return box && box.x < window.innerWidth && box.y < window.innerHeight;
      },
      { timeout: 2000 }
    );

    const viewport = await page.viewport();
    const nearCenterBox = await page.evaluate(() => window.__mindzooTestApi.getNodeScreenBox(2));
    assert.ok(nearCenterBox.x > viewport.width * 0.3);
    assert.ok(nearCenterBox.y > viewport.height * 0.2);

    const dragStart = {
      x: geometry.contentX + geometry.contentWidth * 0.75,
      y: geometry.contentY + geometry.contentHeight * 0.75,
    };
    const dragEnd = {
      x: geometry.contentX + geometry.contentWidth * 0.25,
      y: geometry.contentY + geometry.contentHeight * 0.25,
    };

    const rootBoxBeforeDrag = await page.evaluate(() => window.__mindzooTestApi.getNodeScreenBox(1));
    await page.mouse.move(dragStart.x, dragStart.y);
    await page.mouse.down();
    await page.mouse.move(dragEnd.x, dragEnd.y, { steps: 8 });
    await page.mouse.up();

    await page.waitForFunction(
      () => {
        const box = window.__mindzooTestApi?.getNodeScreenBox(1);
        return box && box.x < window.innerWidth && box.y < window.innerHeight;
      },
      { timeout: 2000 }
    );

    const rootBox = await page.evaluate(() => window.__mindzooTestApi.getNodeScreenBox(1));
    assert.ok(rootBox.x > rootBoxBeforeDrag.x + 120);
    assert.ok(rootBox.y > rootBoxBeforeDrag.y + 80);
  } finally {
    await browser.close();
    server.close();
  }
});

test("UI extracts agent-owned linked entities", async () => {
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
          mounts: [
            { key: "summary-capability", config: { defaultSummary: "新 Agent" } },
            { key: "message-log-capability", config: {} },
            { key: "entity-links-capability", config: { sourceField: "links" } },
            { key: "message-queue-capability", config: {} },
            { key: "agent-behavior", config: { agentKeyField: "agentKey" } },
          ],
          data: {
            x: 0,
            y: 0,
            summary: "执行 Agent",
            messages: [],
            agentKey: "assistant",
            links: [
              {
                entityId: 2,
                type: "agent/task_board",
                label: "执行任务",
                config: {},
              },
            ],
          },
        },
        {
          id: 2,
          mounts: [
            { key: "summary-capability", config: { defaultSummary: "共享任务板" } },
            { key: "message-log-capability", config: {} },
            { key: "task-board-capability", config: {} },
            { key: "task-board-behavior", config: {} },
          ],
          data: { x: 260, y: 0, summary: "共享任务板", items: [], messages: [] },
        },
      ],
    });
    await seedConfig(page, {
      baseUrl: DEFAULT_LLM_CONFIG.baseUrl,
      apiKey: "test-key",
      model: DEFAULT_LLM_CONFIG.model,
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

    assert.equal(capturedContext.focusEntity.data.summary, "执行 Agent");
    assert.equal(capturedContext.linkedEntities.length, 1);
    assert.equal(capturedContext.linkedEntities[0].type, "agent/task_board");
    assert.equal(capturedContext.linkedEntities[0].entity.data.summary, "共享任务板");
  } finally {
    await browser.close();
    server.close();
  }
});

test("UI agent can consume queued plugin messages before running", async () => {
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
                  summary: "队列输入测试",
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
          mounts: [
            { key: "summary-capability", config: { defaultSummary: "新 Agent" } },
            { key: "message-log-capability", config: {} },
            { key: "entity-links-capability", config: { sourceField: "links" } },
            { key: "message-queue-capability", config: {} },
            { key: "agent-behavior", config: { agentKeyField: "agentKey" } },
          ],
          data: {
            x: 0,
            y: 0,
            summary: "队列 Agent",
            messages: [],
            agentKey: "assistant",
            links: [],
          },
        },
      ],
    });
    await seedConfig(page, {
      baseUrl: DEFAULT_LLM_CONFIG.baseUrl,
      apiKey: "test-key",
      model: DEFAULT_LLM_CONFIG.model,
      agents: {
        assistant: {},
      },
    });

    await page.evaluate(async () => {
      await window.__mindzooTestApi.enqueueNodeMessage(1, {
        source: "planner",
        content: "先整理目标",
      });
      await window.__mindzooTestApi.enqueueNodeMessage(1, {
        source: "reviewer",
        content: "补充风险检查",
      });
    });

    await openNodeByDoubleClick(page, 1);
    await page.waitForSelector("#node-dialog[open]");
    const statusText = await page.$eval("#node-dialog-status", (el) => el.textContent);
    assert.match(statusText, /当前队列 2 条/);

    const requestPromise = page.waitForRequest((request) => {
      return (
        request.method() === "POST" &&
        request.url() === `http://127.0.0.1:${port}/api/agent-run`
      );
    });
    await page.$eval("#node-dialog-submit", (button) => button.click());
    const request = await requestPromise;
    const payload = JSON.parse(request.postData());

    assert.match(payload.prompt, /\[planner\] 先整理目标/);
    assert.match(payload.prompt, /\[reviewer\] 补充风险检查/);
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
            { id: 1, data: { x: 0, y: 0, summary: "", messages: [] } },
            { id: 1, data: { x: 200, y: 0, summary: "", messages: [] } },
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

test("UI can manage plugin tree, config, removal, and run an agent through the node dialog", async () => {
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
    await confirmDefaultCreateNode(page);

    const graphAfterCreate = await readStoredGraph(page);
    const createdNodeId = Math.max(...graphAfterCreate.nodes.map((node) => node.id));
    const createdNode = graphAfterCreate.nodes.find((node) => node.id === createdNodeId);
    assert.ok(createdNode);
    assert.deepEqual(createdNode.mounts, []);

    await openNodeByDoubleClick(page, createdNode.id);
    await page.waitForSelector("#node-dialog[open]");
    await openPluginBackpack(page);
    const backpackHeadings = await page.$$eval(".plugin-group-title", (items) =>
      items.map((item) => item.textContent.trim())
    );
    assert.ok(backpackHeadings.includes("节点本体"));
    const initialTreeTitles = await page.$$eval("#plugin-installed-tree .plugin-tree-item-title", (items) =>
      items.map((item) => item.textContent.trim())
    );
    assert.deepEqual(initialTreeTitles, ["节点本体"]);
    await selectPluginCard(page, "Agent 行为");
    await page.$eval("#attach-selected-plugin", (button) => button.click());

    const graphAfterAttach = await readStoredGraph(page);
    const agentNode = graphAfterAttach.nodes.find((node) =>
      Array.isArray(node.mounts) && node.mounts.some((plugin) => plugin.key === "agent-behavior")
    );
    assert.ok(agentNode);
    assert.equal(agentNode.data.agentKey, "assistant");
    assert.deepEqual(agentNode.data.links, []);

    const installedTreeAfterAttach = await page.$$eval("#plugin-installed-tree .plugin-tree-item-title", (items) =>
      items.map((item) => item.textContent.trim())
    );
    assert.ok(installedTreeAfterAttach.includes("Agent 行为"));
    assert.ok(findMountByPath(agentNode.mounts, "agent-behavior"));

    await selectPluginTreeItem(page, "Agent 行为");
    const groupedSnapshot = await page.$eval("#plugin-backpack-target", (element) => element.textContent);
    assert.match(groupedSnapshot, /Agent 行为/);
    await selectPluginCard(page, "分析技能");
    await page.$eval("#attach-selected-plugin", (button) => button.click());

    const graphAfterSkill = await readStoredGraph(page);
    const skillNode = findNodeById(graphAfterSkill, createdNode.id);
    assert.ok(findMountByPath(skillNode?.mounts, "agent-behavior/agent-analysis-skill"));

    await selectPluginTreeItem(page, "分析技能");
    await page.waitForSelector("#plugin-config-panel:not([hidden])");
    const prefixBeforeSave = await page.$eval(
      "#plugin-config-panel [data-config-key='prefix']",
      (input) => input.value
    );
    assert.match(prefixBeforeSave, /目标拆解、约束检查、风险识别/);
    await page.$eval("#plugin-config-panel [data-config-key='prefix']", (input, value) => {
      input.value = value;
    }, "请先校验输入边界，再输出一个两步行动建议：");
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll("#plugin-config-panel button")];
      const saveButton = buttons.find((button) => button.textContent.includes("保存插件配置"));
      if (!saveButton) {
        throw new Error("plugin config save button not found");
      }
      saveButton.click();
    });

    const graphAfterConfigSave = await readStoredGraph(page);
    const savedSkillMount = findMountByPath(
      findNodeById(graphAfterConfigSave, createdNode.id)?.mounts,
      "agent-behavior/agent-analysis-skill"
    );
    const savedSkillConfig = savedSkillMount?.config || null;
    assert.equal(savedSkillConfig.prefix, "请先校验输入边界，再输出一个两步行动建议：");

    await page.$eval("#node-dialog-direction", (el, value) => {
      el.value = value;
    }, "请分析当前风险");
    const requestPromise = page.waitForRequest((request) => {
      return (
        request.method() === "POST" &&
        request.url() === `http://127.0.0.1:${port}/api/agent-run`
      );
    });
    await page.$eval("#node-dialog-submit", (button) => button.click());
    const request = await requestPromise;
    const payload = JSON.parse(request.postData());
    assert.match(payload.prompt, /请先校验输入边界，再输出一个两步行动建议/);
    assert.match(payload.prompt, /请分析当前风险/);

    await page.waitForFunction(() => {
      return document.getElementById("node-dialog-status").textContent.includes("Agent 已完成本轮响应");
    });

    const graphAfterRun = await readStoredGraph(page);
    const updatedAgentNode = graphAfterRun.nodes.find((node) =>
      Array.isArray(node.mounts) && node.mounts.some((plugin) => plugin.key === "agent-behavior")
    );
    assert.equal(updatedAgentNode.data.summary, "研究 Agent");
    assert.equal(updatedAgentNode.data.messages.length, 2);
    assert.equal(updatedAgentNode.data.messages[1].agent, "assistant");

    await selectPluginTreeItem(page, "分析技能");
    await page.$eval("#remove-selected-plugin", (button) => button.click());
    await page.waitForFunction(
      (nodeId) => {
        const graph = JSON.parse(localStorage.getItem("mindzoo.graph.v2") || "null");
        const node = graph?.nodes?.find((item) => item.id === nodeId);
        const hasSkill = (mounts, parentPath = "node") =>
          (Array.isArray(mounts) ? mounts : []).some((mount) => {
            const path = parentPath === "node" ? mount.key : `${parentPath}/${mount.key}`;
            return path === "agent-behavior/agent-analysis-skill" || hasSkill(mount.mounts, path);
          });
        return !hasSkill(node?.mounts);
      },
      {},
      createdNode.id
    );

    await selectPluginTreeItem(page, "Agent 行为");
    await page.$eval("#remove-selected-plugin", (button) => button.click());
    await page.waitForFunction(
      (nodeId) => {
        const graph = JSON.parse(localStorage.getItem("mindzoo.graph.v2") || "null");
        const node = graph?.nodes?.find((item) => item.id === nodeId);
        return !(Array.isArray(node?.mounts) && node.mounts.some((mount) => mount.key === "agent-behavior"));
      },
      {},
      createdNode.id
    );

    const graphAfterRemoval = await readStoredGraph(page);
    const cleanedNode = graphAfterRemoval.nodes.find((node) => node.id === createdNode.id);
    assert.ok(cleanedNode);
    assert.deepEqual(cleanedNode.mounts, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test("UI supports mobile touch interactions for create, open, and move", async () => {
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
    await page.setViewport({
      width: 430,
      height: 932,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    await page.goto(`http://127.0.0.1:${port}/?test=1`, { waitUntil: "networkidle0" });

    await touchLongPress(page, 180, 500);
    await page.waitForSelector("#canvas-context-menu:not([hidden])");
    await page.$eval("#context-add-node", (button) => button.click());
    await confirmDefaultCreateNode(page);

    const graphAfterCreate = await readStoredGraph(page);
    assert.equal(graphAfterCreate.nodes.length, 2);

    const newNodeId = Math.max(...graphAfterCreate.nodes.map((node) => node.id));
    const center = await getNodeCenter(page, newNodeId);

    await touchDoubleTap(page, center.x, center.y);
    await page.waitForSelector("#node-dialog[open]");
    await page.$eval("#close-node-dialog", (button) => button.click());
    await page.waitForSelector("#node-dialog:not([open])");

    const beforeMove = graphAfterCreate.nodes.find((node) => node.id === newNodeId);
    await touchDrag(
      page,
      center,
      {
        x: center.x + 80,
        y: center.y + 60,
      }
    );

    const graphAfterMove = await readStoredGraph(page);
    const movedNode = graphAfterMove.nodes.find((node) => node.id === newNodeId);
    assert.ok(movedNode.data.x > beforeMove.data.x + 20);
    assert.ok(movedNode.data.y > beforeMove.data.y + 20);
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
    await page.$eval("#open-plugin-backpack", (button) => button.click());
    await page.waitForSelector("#plugin-backpack-dialog[open]");
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#plugin-backpack-list .option-card")];
      const noteCard = cards.find((card) => card.textContent.includes("记录行为"));
      if (!noteCard) {
        throw new Error("note plugin card not found");
      }
      noteCard.click();
    });
    await page.$eval("#attach-selected-plugin", (button) => button.click());
    await page.waitForFunction(
      () => document.querySelectorAll("#plugin-installed-tree .plugin-tree-item-title").length > 1
    );
    await page.$eval("#close-plugin-backpack-action", (button) => button.click());
    await page.waitForSelector("#plugin-backpack-dialog:not([open])");
    await page.$eval("#node-dialog-direction", (el, value) => {
      el.value = value;
    }, "记录一个新的观察");
    await page.$eval("#node-dialog-submit", (button) => button.click());
    await page.waitForFunction(() => {
      return document.getElementById("node-dialog-status").textContent.includes("记录已加入当前节点");
    });

    await page.$eval("#close-node-dialog", (button) => button.click());
    await page.waitForSelector("#node-dialog:not([open])");
    await openNodeByDoubleClick(page, 1);
    await page.waitForSelector("#node-dialog[open]");
    const statusAfterReopen = await page.$eval("#node-dialog-status", (el) => el.textContent);

    const graph = await readStoredGraph(page);
    assert.equal(graph.nodes[0].data.messages.length, 1);
    assert.equal(graph.nodes[0].data.messages[0].content, "记录一个新的观察");
    assert.equal(graph.nodes[0].data.summary, "记录一个新的观察");
    assert.match(statusAfterReopen, /输入一条记录、问题或说明后发送到当前节点/);
  } finally {
    await browser.close();
    server.close();
  }
});

test("UI task board status refreshes from live data after reopening the dialog", async () => {
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
        {
          id: 1,
          mounts: [
            { key: "summary-capability", config: { defaultSummary: "共享任务板" } },
            { key: "message-log-capability", config: {} },
            { key: "task-board-capability", config: {} },
            { key: "task-board-behavior", config: {} },
          ],
          data: { x: 0, y: 0, summary: "共享任务板", items: [], messages: [] },
        },
      ],
    });

    await openNodeByDoubleClick(page, 1);
    await page.waitForSelector("#node-dialog[open]");
    const initialStatus = await page.$eval("#node-dialog-status", (el) => el.textContent);
    assert.match(initialStatus, /当前待办 0 项/);

    await page.$eval("#node-dialog-direction", (el, value) => {
      el.value = value;
    }, "补一条回归测试");
    await page.$eval("#node-dialog-submit", (button) => button.click());
    await page.waitForFunction(() => {
      return document.getElementById("node-dialog-status").textContent.includes("任务已加入任务板");
    });

    await page.$eval("#close-node-dialog", (button) => button.click());
    await page.waitForSelector("#node-dialog:not([open])");
    await openNodeByDoubleClick(page, 1);
    await page.waitForSelector("#node-dialog[open]");
    const statusAfterReopen = await page.$eval("#node-dialog-status", (el) => el.textContent);
    assert.match(statusAfterReopen, /当前待办 1 项/);
  } finally {
    await browser.close();
    server.close();
  }
});
