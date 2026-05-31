const fs = require("node:fs");
const path = require("node:path");
const {
  DEFAULT_AGENT_OVERRIDES,
  PRIMARY_PROVIDER_DEFAULTS,
} = require("../shared/llm-provider-defaults");

const outputPath = path.join(__dirname, "..", "public", "llm-provider-defaults.js");

const source = `export const DEFAULT_LLM_BOOTSTRAP = ${JSON.stringify(
  {
    baseUrl: PRIMARY_PROVIDER_DEFAULTS.baseUrl,
    model: PRIMARY_PROVIDER_DEFAULTS.model,
    agents: DEFAULT_AGENT_OVERRIDES,
  },
  null,
  2
)};\n`;

fs.writeFileSync(outputPath, source, "utf8");
