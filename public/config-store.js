import { serializeGraph } from "./graph-model.js";

const storageKeys = {
  graph: "mindzoo.graph.v2",
  config: "mindzoo.llm.v2",
};

function clearStoredGraph() {
  localStorage.removeItem(storageKeys.graph);
}

export function loadGraph() {
  try {
    return JSON.parse(localStorage.getItem(storageKeys.graph));
  } catch {
    return null;
  }
}

export function saveGraph(graph) {
  localStorage.setItem(storageKeys.graph, JSON.stringify(serializeGraph(graph)));
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

export { clearStoredGraph };
