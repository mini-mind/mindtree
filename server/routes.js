const express = require("express");
const path = require("path");
const { buildDefaultConfigResponse } = require("./config");
const { mapApiError } = require("./errors");
const { requestBranches } = require("./reasoning-service");

function createApp({ fetchImpl = fetch } = {}) {
  const app = express();
  const defaultConfigResponse = buildDefaultConfigResponse();

  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/api/default-config", (_req, res) => {
    res.json(defaultConfigResponse);
  });

  app.post("/api/expand", async (req, res) => {
    try {
      const { chain, branchCount = 3, direction = "", config = {} } = req.body || {};
      const branches = await requestBranches({
        chain,
        branchCount,
        direction,
        config,
        fetchImpl,
      });
      res.json({ branches });
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
