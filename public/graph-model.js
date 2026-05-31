import { assertGraphDocument } from "./graph-validation.js";
import { createDefaultNodeUi } from "./ecs-entity-state.js";
import { normalizePluginMount } from "./ecs-plugin-tree.js";
import { buildNodePresetState } from "./node-presets.js";

function createDefaultNodeData() {
  return {
    x: 0,
    y: 0,
    summary: "",
    messages: [],
  };
}

function createEmptyNodeRuntime() {
  return {
    components: {},
    eventQueue: [],
  };
}

export function createPresetNode(id, presetKey, x = 0, y = 0) {
  const preset = buildNodePresetState(presetKey);
  return {
    id,
    data: {
      ...createDefaultNodeData(),
      ...(preset.data || {}),
      x,
      y,
    },
    runtime: createEmptyNodeRuntime(),
    ui: createDefaultNodeUi(),
    mounts: Array.isArray(preset.mounts) ? preset.mounts : [],
  };
}

function normalizeNode(node) {
  const data = node?.data && typeof node.data === "object" ? { ...node.data } : {};
  const normalizedData = {
    ...createDefaultNodeData(),
    ...data,
    x: Number(data.x) || 0,
    y: Number(data.y) || 0,
    messages: Array.isArray(data.messages) ? data.messages : [],
  };
  return {
    id: Number(node.id),
    data: normalizedData,
    runtime: createEmptyNodeRuntime(),
    ui: createDefaultNodeUi(),
    mounts: Array.isArray(node?.mounts) && node.mounts.length
      ? node.mounts.map(normalizePluginMount).filter(Boolean)
      : [],
  };
}

function createInitialGraph() {
  return {
    nodes: [createPresetNode(1, "build")],
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
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      data: node.data && typeof node.data === "object" ? { ...node.data } : {},
      mounts: Array.isArray(node?.mounts)
        ? node.mounts.map(normalizePluginMount).filter(Boolean)
        : [],
    })),
  };
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

export function upsertNodeLink(graph, sourceId, targetId, link = {}) {
  if (!Number.isFinite(sourceId) || !Number.isFinite(targetId) || sourceId === targetId) {
    return false;
  }

  const source = getNodeById(graph, sourceId);
  const target = getNodeById(graph, targetId);
  if (!source || !target) {
    return false;
  }

  if (!Array.isArray(source.data.links)) {
    source.data.links = [];
  }

  const nextLink = {
    entityId: targetId,
    type: typeof link.type === "string" && link.type ? link.type : "reference",
    label: typeof link.label === "string" ? link.label : "",
    config: link.config && typeof link.config === "object" ? { ...link.config } : {},
  };
  const existingIndex = source.data.links.findIndex((item) => Number(item?.entityId) === targetId);
  if (existingIndex >= 0) {
    source.data.links[existingIndex] = nextLink;
  } else {
    source.data.links.push(nextLink);
  }

  return true;
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

export function getNodePosition(node) {
  return {
    x: Number(node?.data?.x) || 0,
    y: Number(node?.data?.y) || 0,
  };
}
