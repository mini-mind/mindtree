import { assertGraphDocument } from "./graph-validation.js";
import { BASE_NODE_BLUEPRINTS } from "./ecs-defaults.js";
import { getEntityCanvasSummary } from "./ecs-plugins.js";
import { serializeRuntimelessGraph } from "./ecs-world.js";

const DEFAULT_BLUEPRINT_KEY = "note";

function getBlueprint(type = DEFAULT_BLUEPRINT_KEY) {
  return BASE_NODE_BLUEPRINTS.find((item) => item.key === type) || BASE_NODE_BLUEPRINTS[0];
}

function createBlueprintDataDefaults(blueprint) {
  return {
    summary:
      blueprint.key === "agent"
        ? "新 Agent"
        : blueprint.key === "task_board"
          ? "共享任务板"
          : "",
    messages: [],
    ...(blueprint.key === "agent"
      ? { agentKey: "assistant", links: [] }
      : blueprint.key === "task_board"
        ? { items: [] }
        : {}),
  };
}

function createBlueprintPluginMounts(blueprint) {
  return blueprint.plugins.map((plugin) => ({
    key: plugin.key,
    config: plugin.config && typeof plugin.config === "object" ? { ...plugin.config } : {},
  }));
}

export function createNode(id, x = 0, y = 0, type = DEFAULT_BLUEPRINT_KEY) {
  const blueprint = getBlueprint(type);
  return {
    id,
    type: blueprint.key,
    x,
    y,
    data: createBlueprintDataDefaults(blueprint),
    runtime: {
      components: {},
      eventQueue: [],
    },
    plugins: createBlueprintPluginMounts(blueprint),
  };
}

function normalizeNode(node) {
  const blueprint = getBlueprint(node?.type);
  const data = node?.data && typeof node.data === "object" ? { ...node.data } : {};
  return {
    id: Number(node.id),
    type: blueprint.key,
    x: Number(node.x) || 0,
    y: Number(node.y) || 0,
    data: {
      ...createBlueprintDataDefaults(blueprint),
      ...data,
      messages: Array.isArray(data.messages) ? data.messages : [],
    },
    runtime: {
      components:
        node?.runtime?.components && typeof node.runtime.components === "object"
          ? { ...node.runtime.components }
          : {},
      eventQueue: Array.isArray(node?.runtime?.eventQueue) ? [...node.runtime.eventQueue] : [],
    },
    plugins: Array.isArray(node?.plugins) && node.plugins.length
      ? node.plugins.map((plugin) => ({
          key: plugin.key,
          config: plugin.config && typeof plugin.config === "object" ? { ...plugin.config } : {},
        }))
      : createBlueprintPluginMounts(blueprint),
  };
}

function createInitialGraph() {
  return {
    nodes: [createNode(1)],
  };
}

export function normalizeGraph(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.nodes)) {
    return createInitialGraph();
  }

  return assertGraphDocument({
    nodes: input.nodes.map(normalizeNode),
  });
}

export function serializeGraph(graph) {
  return serializeRuntimelessGraph(graph);
}

export function getMaxGraphId(graph) {
  return graph.nodes.reduce((maxId, node) => Math.max(maxId, Number(node.id) || 0), 0);
}

export function getNodeById(graph, id) {
  return graph.nodes.find((node) => node.id === id) || null;
}

export function addGraphNode(graph, node) {
  graph.nodes.push(node);
}

export function deleteNodeFromGraph(graph, id) {
  const nextNodes = graph.nodes.filter((node) => node.id !== id);
  nextNodes.forEach((node) => {
    if (Array.isArray(node?.data?.links)) {
      node.data.links = node.data.links.filter((item) => item.entityId !== id);
    }
  });

  return {
    deleted: nextNodes.length !== graph.nodes.length,
    graph: { nodes: nextNodes },
  };
}

export function createInitialGraphDocument() {
  return createInitialGraph();
}

export function getNodeSummary(node) {
  return typeof node?.data?.summary === "string" ? node.data.summary : "";
}

export function getNodeMessages(node) {
  return Array.isArray(node?.data?.messages) ? node.data.messages : [];
}

export function getCanvasNodeSummary(node) {
  return getEntityCanvasSummary(node);
}
