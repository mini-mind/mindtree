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

test("UI flow covers help, config, forest defaults, and context menus", async () => {
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
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    const initialMenuState = await page.evaluate(() => ({
      nodeHidden: document.getElementById("node-context-menu").hidden,
      canvasHidden: document.getElementById("canvas-context-menu").hidden,
      nodeDisplay: getComputedStyle(document.getElementById("node-context-menu")).display,
      canvasDisplay: getComputedStyle(document.getElementById("canvas-context-menu")).display,
    }));
    const edgePoint = {
      x: viewport.width - 12,
      y: viewport.height - 12,
    };

    await page.$eval("#floating-help", (button) => button.click());
    await page.waitForSelector("#help-dialog[open]");
    const helpMetrics = await page.$eval("#help-dialog", (dialog) => ({
      hasCloseButton: Boolean(dialog.querySelector("#close-help")),
      text: dialog.textContent,
    }));
    await page.$eval("#close-help", (button) => button.click());
    await page.waitForSelector("#help-dialog:not([open])");

    await page.$eval("#floating-config", (button) => button.click());
    await page.waitForSelector("#config-panel-base.is-active");
    const configMetrics = await page.$eval("#config-dialog", (dialog) => {
      const rect = dialog.getBoundingClientRect();
      const content = dialog.querySelector(".config-content");
      return {
        width: rect.width,
        viewportWidth: window.innerWidth,
        height: rect.height,
        viewportHeight: window.innerHeight,
        contentScrollable: content.scrollHeight >= content.clientHeight,
        hasCloseButton: Boolean(dialog.querySelector("#close-config")),
      };
    });
    await page.mouse.click(20, 20);
    await page.waitForSelector("#config-dialog:not([open])");
    await page.$eval("#floating-config", (button) => button.click());
    await page.waitForSelector("#config-panel-base.is-active");
    await page.select("#cfg-model-select", "deepseek-ai/DeepSeek-V3.2");
    await page.$eval("#cfg-api-key", (el, value) => {
      el.value = value;
    }, "test-key");
    await page.$eval("#save-config", (button) => button.click());

    const storedForestBefore = await page.evaluate(() => localStorage.getItem("mindtree.tree.v1"));
    const parsedForestBefore = storedForestBefore ? JSON.parse(storedForestBefore) : [{ summary: "" }];

    await page.evaluate(() => window.__mindtreeTestApi.openNodeById(1));
    await page.waitForSelector("#node-dialog[open]");
    const nodeDialogMetrics = await page.$eval("#node-dialog", (dialog) => ({
      hasCloseButton: Boolean(dialog.querySelector("#close-node-dialog")),
      hasSendButton: Boolean(dialog.querySelector("#node-dialog-expand")),
      summaryText: dialog.querySelector("#node-dialog-summary").textContent,
    }));
    await page.$eval("#close-node-dialog", (button) => button.click());
    await page.waitForSelector("#node-dialog:not([open])");

    await page.mouse.click(336, 186, { button: "right" });
    await page.waitForSelector("#node-context-menu:not([hidden])");
    const nodeContextMenuMetrics = await page.$eval("#node-context-menu", (menu) => ({
      isVisible: !menu.hidden,
      hasAddChild: Boolean(menu.querySelector("#context-add-child-node")),
      deleteDisabled: menu.querySelector("#context-delete-node").disabled,
    }));
    await page.$eval("#context-add-child-node", (button) => button.click());
    await page.waitForSelector("#node-context-menu[hidden]");

    await page.mouse.click(520, 420, { button: "right" });
    await page.waitForSelector("#canvas-context-menu:not([hidden])");
    await page.mouse.click(100, 100);
    await page.waitForSelector("#canvas-context-menu[hidden]");

    await page.mouse.click(edgePoint.x, edgePoint.y, { button: "right" });
    await page.waitForSelector("#canvas-context-menu:not([hidden])");
    const canvasMenuBounds = await page.$eval("#canvas-context-menu", (menu) => {
      const rect = menu.getBoundingClientRect();
      return {
        right: rect.right,
        bottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });
    await page.mouse.click(100, 100);
    await page.waitForSelector("#canvas-context-menu[hidden]");

    const treeBeforeRootAdd = await page.evaluate(() => window.__mindtreeTestApi.getTree());
    await page.mouse.click(520, 420, { button: "right" });
    await page.waitForSelector("#canvas-context-menu:not([hidden])");
    const canvasContextMenuMetrics = await page.$eval("#canvas-context-menu", (menu) => ({
      isVisible: !menu.hidden,
      hasAddRoot: Boolean(menu.querySelector("#context-add-root-node")),
    }));
    await page.$eval("#context-add-root-node", (button) => button.click());
    await page.waitForSelector("#canvas-context-menu[hidden]");
    const treeAfterRootAdd = await page.evaluate(() => window.__mindtreeTestApi.getTree());

    await page.mouse.move(520, 420);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(620, 420, { steps: 8 });
    await page.mouse.up({ button: "right" });
    const canvasMenuHiddenAfterDrag = await page.$eval(
      "#canvas-context-menu",
      (menu) => menu.hidden
    );

    const status = await page.$eval("#status", (el) => el.textContent);
    const storedForestAfter = await page.evaluate(() => localStorage.getItem("mindtree.tree.v1"));
    const storedConfig = await page.evaluate(() => localStorage.getItem("mindtree.llm.v1"));
    const parsedConfig = JSON.parse(storedConfig);
    const parsedForestAfter = JSON.parse(storedForestAfter);

    assert.equal(helpMetrics.hasCloseButton, true);
    assert.match(helpMetrics.text, /画布交互/);
    assert.equal(initialMenuState.nodeHidden, true);
    assert.equal(initialMenuState.canvasHidden, true);
    assert.equal(initialMenuState.nodeDisplay, "none");
    assert.equal(initialMenuState.canvasDisplay, "none");
    assert.ok(configMetrics.width >= configMetrics.viewportWidth * 0.8);
    assert.ok(configMetrics.height <= configMetrics.viewportHeight - 32);
    assert.equal(configMetrics.contentScrollable, true);
    assert.equal(configMetrics.hasCloseButton, true);
    assert.equal(Array.isArray(parsedForestBefore), true);
    assert.equal(parsedForestBefore.length, 1);
    assert.equal(parsedForestBefore[0].summary, "");
    assert.equal(nodeDialogMetrics.hasCloseButton, true);
    assert.equal(nodeDialogMetrics.hasSendButton, true);
    assert.equal(nodeDialogMetrics.summaryText, "未命名节点");
    assert.equal(nodeContextMenuMetrics.isVisible, true);
    assert.equal(nodeContextMenuMetrics.hasAddChild, true);
    assert.equal(nodeContextMenuMetrics.deleteDisabled, false);
    assert.ok(canvasMenuBounds.right <= canvasMenuBounds.viewportWidth - 8);
    assert.ok(canvasMenuBounds.bottom <= canvasMenuBounds.viewportHeight - 8);
    assert.equal(canvasContextMenuMetrics.isVisible, true);
    assert.equal(canvasContextMenuMetrics.hasAddRoot, true);
    assert.equal(canvasMenuHiddenAfterDrag, true);
    assert.match(status, /已新增空节点|已衍生空节点/);
    assert.equal(parsedForestAfter.length, 2);
    assert.equal(parsedForestAfter[0].children.length, 1);
    assert.equal(parsedForestAfter[0].summary, "");
    assert.equal(treeAfterRootAdd[0].offsetX, treeBeforeRootAdd[0].offsetX);
    assert.equal(treeAfterRootAdd[0].offsetY, treeBeforeRootAdd[0].offsetY);
    assert.equal(parsedConfig.model, "deepseek-ai/DeepSeek-V3.2");
  } finally {
    await browser.close();
    server.close();
  }
});

test("UI allows deleting the last remaining node and adding back from empty canvas", async () => {
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

    await page.mouse.click(336, 186, { button: "right" });
    await page.waitForSelector("#node-context-menu:not([hidden])");
    await page.$eval("#context-delete-node", (button) => button.click());
    await page.waitForSelector("#node-context-menu[hidden]");

    const forestAfterDelete = JSON.parse(
      await page.evaluate(() => localStorage.getItem("mindtree.tree.v1"))
    );

    await page.mouse.click(520, 420, { button: "right" });
    await page.waitForSelector("#canvas-context-menu:not([hidden])");
    await page.$eval("#context-add-root-node", (button) => button.click());
    await page.waitForSelector("#canvas-context-menu[hidden]");

    const forestAfterRestore = JSON.parse(
      await page.evaluate(() => localStorage.getItem("mindtree.tree.v1"))
    );

    assert.deepEqual(forestAfterDelete, []);
    assert.equal(Array.isArray(forestAfterRestore), true);
    assert.equal(forestAfterRestore.length, 1);
  } finally {
    await browser.close();
    server.close();
  }
});

test("UI supports marquee selection and batch delete from canvas menu", async () => {
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
      localStorage.setItem(
        "mindtree.tree.v1",
        JSON.stringify([
          { id: 1, summary: "", offsetX: 0, offsetY: -220, messages: [], children: [] },
          { id: 2, summary: "", offsetX: 0, offsetY: 0, messages: [], children: [] },
          { id: 3, summary: "", offsetX: 0, offsetY: 220, messages: [], children: [] },
        ])
      );
      window.location.reload();
    });
    await page.waitForNavigation({ waitUntil: "networkidle0" });

    await page.keyboard.down("Shift");
    await page.mouse.move(300, 100);
    await page.mouse.down();
    await page.mouse.move(620, 580, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    const selectionSnapshot = await page.evaluate(() => window.__mindtreeTestApi.getSelection());
    assert.ok(selectionSnapshot.selectedIds.length >= 2, JSON.stringify(selectionSnapshot));

    await page.mouse.click(340, 180, { button: "right" });
    await page.waitForFunction(() => {
      const state = window.__mindtreeTestApi.getSelection();
      return !state.canvasContextMenuHidden || !state.nodeContextMenuHidden;
    });
    const menuSnapshotBeforeWait = await page.evaluate(() => window.__mindtreeTestApi.getSelection());
    assert.equal(menuSnapshotBeforeWait.nodeContextMenuHidden, true, JSON.stringify(menuSnapshotBeforeWait));
    assert.equal(menuSnapshotBeforeWait.canvasContextMenuHidden, false, JSON.stringify(menuSnapshotBeforeWait));
    const batchDeleteVisible = await page.$eval(
      "#context-delete-selected-nodes",
      (button) => !button.hidden
    );
    await page.$eval("#context-delete-selected-nodes", (button) => button.click());
    await page.waitForSelector("#canvas-context-menu[hidden]");

    const forestAfterDelete = JSON.parse(
      await page.evaluate(() => localStorage.getItem("mindtree.tree.v1"))
    );

    assert.equal(batchDeleteVisible, true);
    assert.equal(forestAfterDelete.length, 1);
  } finally {
    await browser.close();
    server.close();
  }
});

test("UI places derived nodes near their source without moving existing nodes", async () => {
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

    const before = await page.evaluate(() => window.__mindtreeTestApi.getTree());
    await page.mouse.click(336, 186, { button: "right" });
    await page.waitForSelector("#node-context-menu:not([hidden])");
    await page.$eval("#context-add-child-node", (button) => button.click());
    await page.waitForSelector("#node-context-menu[hidden]");

    const after = await page.evaluate(() => window.__mindtreeTestApi.getTree());
    const parentBefore = before[0];
    const parentAfter = after[0];
    const child = after[0].children[0];

    assert.equal(parentAfter.offsetX, parentBefore.offsetX);
    assert.equal(parentAfter.offsetY, parentBefore.offsetY);
    assert.ok(Math.abs(child.offsetX - parentAfter.offsetX) >= 120);
    assert.ok(Math.abs(child.offsetX - parentAfter.offsetX) <= 280);
    assert.ok(Math.abs(child.offsetY - parentAfter.offsetY) <= 220);
  } finally {
    await browser.close();
    server.close();
  }
});

test("UI keeps existing node screen position stable after adding a root node", async () => {
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

    const beforeBox = await page.evaluate(() => window.__mindtreeTestApi.getNodeScreenBox(1));
    await page.mouse.click(520, 420, { button: "right" });
    await page.waitForSelector("#canvas-context-menu:not([hidden])");
    await page.$eval("#context-add-root-node", (button) => button.click());
    await page.waitForSelector("#canvas-context-menu[hidden]");
    const afterBox = await page.evaluate(() => window.__mindtreeTestApi.getNodeScreenBox(1));

    assert.ok(beforeBox);
    assert.ok(afterBox);
    assert.equal(afterBox.x, beforeBox.x);
    assert.equal(afterBox.y, beforeBox.y);
    assert.equal(afterBox.width, beforeBox.width);
    assert.equal(afterBox.height, beforeBox.height);
  } finally {
    await browser.close();
    server.close();
  }
});

test("UI places a new root node near the canvas context-click position", async () => {
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

    const clickPoint = { x: 520, y: 420 };
    await page.mouse.click(clickPoint.x, clickPoint.y, { button: "right" });
    await page.waitForSelector("#canvas-context-menu:not([hidden])");
    await page.$eval("#context-add-root-node", (button) => button.click());
    await page.waitForSelector("#canvas-context-menu[hidden]");

    const newNodeBox = await page.evaluate(() => window.__mindtreeTestApi.getNodeScreenBox(2));
    assert.ok(newNodeBox);

    const centerX = newNodeBox.x + newNodeBox.width / 2;
    const centerY = newNodeBox.y + newNodeBox.height / 2;
    assert.ok(Math.abs(centerX - clickPoint.x) <= 8, `${centerX} vs ${clickPoint.x}`);
    assert.ok(Math.abs(centerY - clickPoint.y) <= 8, `${centerY} vs ${clickPoint.y}`);
  } finally {
    await browser.close();
    server.close();
  }
});
