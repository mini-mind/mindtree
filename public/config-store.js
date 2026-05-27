const storageKeys = {
  tree: "mindtree.tree.v1",
  config: "mindtree.llm.v1",
};

const localFallbackConfig = {
  baseUrl: "https://api.siliconflow.cn/v1",
  apiKey: "",
  model: "deepseek-ai/DeepSeek-V3.2",
  oracleBaseUrl: "",
  oracleApiKey: "",
  oracleModel: "",
  candidateMultiplier: 3,
};

export function loadTree() {
  try {
    return JSON.parse(localStorage.getItem(storageKeys.tree));
  } catch {
    return null;
  }
}

export function saveTree(tree) {
  localStorage.setItem(storageKeys.tree, JSON.stringify(tree));
}

export function loadStoredConfig() {
  try {
    return JSON.parse(localStorage.getItem(storageKeys.config)) || {};
  } catch {
    return {};
  }
}

export function saveConfig(config) {
  localStorage.setItem(storageKeys.config, JSON.stringify(config));
}

export function getLocalFallbackConfig() {
  return { ...localFallbackConfig };
}
