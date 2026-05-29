const express = require("express");
const path = require("path");
const { runNodeAgent } = require("./agent-service");
const { buildDefaultConfigResponse } = require("./config");
const { mapApiError } = require("./errors");

function createApp({ fetchImpl = fetch } = {}) {
  const app = express();
  const defaultConfigResponse = buildDefaultConfigResponse();

  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/api/default-config", (_req, res) => {
    res.json(defaultConfigResponse);
  });

  app.post("/api/agent-run", async (req, res) => {
    try {
      const {
        agentKey,
        context,
        prompt,
        config = {},
        systemPrompt = "",
      } = req.body || {};
      const result = await runNodeAgent({
        agentKey,
        context,
        prompt,
        config,
        systemPrompt,
        fetchImpl,
      });
      res.json(result);
    } catch (error) {
      const mapped = mapApiError(error, defaultConfigResponse.knownModels);
      res.status(mapped.statusCode).json(mapped.body);
    }
  });

  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  });

  return app;
}

module.exports = {
  createApp,
};
