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

test("UI flow covers config, save, and LLM branch expansion", async () => {
  let callCount = 0;
  const app = createApp({
    fetchImpl: async () => {
      callCount += 1;
      if (callCount === 1) {
        return createJsonResponse(200, {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  branches: [
                    { title: "候选分支一", detail: "机制｜假设A｜信号A｜反证A｜影响A｜较高｜中" },
                    { title: "候选分支二", detail: "机制｜假设B｜信号B｜反证B｜影响B｜存在可能｜低" },
                    { title: "候选分支三", detail: "机制｜假设C｜信号C｜反证C｜影响C｜较高｜中" },
                    { title: "候选分支四", detail: "机制｜假设D｜信号D｜反证D｜影响D｜偏低｜低" },
                    { title: "候选分支五", detail: "机制｜假设E｜信号E｜反证E｜影响E｜高｜中" },
                    { title: "候选分支六", detail: "机制｜假设F｜信号F｜反证F｜影响F｜较高｜中" },
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
                  { title: "候选分支一", detail: "机制｜假设A｜信号A｜反证A｜影响A｜较高｜中" },
                  { title: "候选分支二", detail: "机制｜假设B｜信号B｜反证B｜影响B｜存在可能｜低" },
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

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle0" });

    await page.$eval("#floating-config", (button) => button.click());
    await page.select("#cfg-model-select", "deepseek-ai/DeepSeek-V3.2");
    await page.$eval("#cfg-api-key", (el, value) => {
      el.value = value;
    }, "test-key");
    await page.$eval("#save-config", (button) => button.click());

    await page.mouse.click(610, 120);
    await page.$eval("#node-title", (el) => {
      el.value = "新的根问题";
    });
    await page.$eval("#node-detail", (el) => {
      el.value = "新的推理内容";
    });
    await page.$eval("#save-node", (button) => button.click());

    await page.$eval("#expand-node", (button) => button.click());
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("已新增")
    );

    const status = await page.$eval("#status", (el) => el.textContent);
    const selectedTitle = await page.$eval("#selected-title", (el) => el.textContent);
    const storedTree = await page.evaluate(() => localStorage.getItem("mindtree.tree.v1"));
    const storedConfig = await page.evaluate(() => localStorage.getItem("mindtree.llm.v1"));

    assert.match(status, /已新增/);
    assert.equal(selectedTitle, "新的根问题");
    assert.match(storedTree, /候选分支一|候选分支二/);
    assert.match(storedConfig, /deepseek-ai\/DeepSeek-V3\.2/);
  } finally {
    await browser.close();
    server.close();
  }
});
