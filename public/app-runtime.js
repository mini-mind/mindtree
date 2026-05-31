import { saveConfig as persistConfig, saveGraph } from "./config-store.js";
import {
  addGraphNode,
  createNode,
  deleteNodeFromGraph,
  getMaxGraphId,
  getNodeById,
  getNodePosition,
} from "./graph-model.js";
import { buildEntityContext } from "./ecs-agent-context.js";
import { createWorld, stepWorld } from "./ecs-world.js";

export function createAppRuntime({ initialGraph, initialConfig, initialDefaultConfig }) {
  let graph = initialGraph;
  let llmConfig = initialConfig;
  let defaultConfig = {
    ...initialDefaultConfig,
    agents: initialDefaultConfig?.agents && typeof initialDefaultConfig.agents === "object"
      ? { ...initialDefaultConfig.agents }
      : {},
  };
  let modelCapabilities = {};
  let nodeId = Math.max(2, getMaxGraphId(graph) + 1);
  let world = null;

  async function requestAgentRun(node, promptText) {
    const context = buildEntityContext(graph, node);
    const response = await fetch("/api/agent-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentKey: node.data?.agentKey || "assistant",
        context,
        prompt: promptText,
        config: llmConfig,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "请求失败");
    }

    return data;
  }

  function rebuildWorld() {
    world = createWorld(graph, {
      requestAgentRun: (node, promptText) => requestAgentRun(node, promptText),
      getConfig: () => llmConfig,
      step: () => stepWorld(world),
    });
  }

  function resetGraph(nextGraph, { persist = true } = {}) {
    graph = nextGraph;
    nodeId = Math.max(2, getMaxGraphId(graph) + 1);
    rebuildWorld();
    if (persist) {
      saveGraph(graph);
    }
  }

  rebuildWorld();

  return {
    getGraph() {
      return graph;
    },
    persistGraph() {
      saveGraph(graph);
    },
    getNodeById(nodeIdValue) {
      return getNodeById(graph, nodeIdValue);
    },
    appendNode(offsetX = 0, offsetY = 0) {
      const node = createNode(nodeId++, offsetX, offsetY);
      addGraphNode(graph, node);
      rebuildWorld();
      saveGraph(graph);
      return node;
    },
    deleteNode(targetId) {
      const result = deleteNodeFromGraph(graph, targetId);
      if (!result.deleted) {
        return {
          deleted: false,
          deletedCount: 0,
        };
      }

      resetGraph(result.graph);
      return {
        deleted: true,
        deletedCount: 1,
      };
    },
    deleteNodes(targetIds) {
      const ids = [...new Set(targetIds)].sort((left, right) => right - left);
      let nextGraph = graph;
      let deletedCount = 0;

      ids.forEach((id) => {
        const result = deleteNodeFromGraph(nextGraph, id);
        if (result.deleted) {
          nextGraph = result.graph;
          deletedCount += 1;
        }
      });

      if (!deletedCount) {
        return { deletedCount: 0 };
      }

      resetGraph(nextGraph);
      return { deletedCount };
    },
    moveNode(targetId, deltaX, deltaY) {
      const node = getNodeById(graph, targetId);
      if (!node) {
        return null;
      }

      const position = getNodePosition(node);
      node.data.x = position.x + deltaX;
      node.data.y = position.y + deltaY;
      saveGraph(graph);
      return node;
    },
    async refreshNodeAfterMutation(node, refreshNodeDialog) {
      rebuildWorld();
      await refreshNodeDialog(node);
      saveGraph(graph);
    },
    getWorld() {
      return world;
    },
    getConfig() {
      return llmConfig;
    },
    setConfig(nextConfig) {
      llmConfig = nextConfig;
    },
    saveConfig() {
      persistConfig(llmConfig);
    },
    getDefaultConfig() {
      return defaultConfig;
    },
    setDefaultConfig(nextDefaultConfig) {
      defaultConfig = {
        ...nextDefaultConfig,
        agents:
          nextDefaultConfig?.agents && typeof nextDefaultConfig.agents === "object"
            ? { ...nextDefaultConfig.agents }
            : {},
      };
    },
    getModelCapabilities() {
      return modelCapabilities;
    },
    setModelCapabilities(nextModelCapabilities) {
      modelCapabilities = nextModelCapabilities;
    },
  };
}
