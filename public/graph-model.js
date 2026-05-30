import { assertGraphDocument } from "./graph-validation.js";
import {
  createNodeData,
  DEFAULT_NODE_TYPE,
  getNodeConnections,
  getNodeMessages,
  getNodeSummary,
  normalizeNodeData,
  pruneNodeConnections,
  setNodeMessages,
  setNodeSummary,
} from "./node-types.js";

export function createMessage(role, content, agent = "") {
  return {
    role,
    agent,
    content,
  };
}

export { getNodeSummary, setNodeSummary, getNodeMessages, setNodeMessages, getNodeConnections };

export function createNode(id, x = 0, y = 0, type = DEFAULT_NODE_TYPE) {
  return {
    id,
    type,
    x,
    y,
    data: createNodeData(type),
  };
}

function normalizeGraphNode(node) {
  return {
    id: Number(node.id),
    type: typeof node.type === "string" ? node.type : DEFAULT_NODE_TYPE,
    x: Number(node.x) || 0,
    y: Number(node.y) || 0,
    data: normalizeNodeData(
      {
        ...node,
        type: typeof node.type === "string" ? node.type : DEFAULT_NODE_TYPE,
      },
      node.data && typeof node.data === "object" ? { ...node.data } : {}
    ),
  };
}

function createInitialGraph() {
  return {
    nodes: [createNode(1)],
  };
}

function isGraphShape(value) {
  return value && typeof value === "object" && Array.isArray(value.nodes);
}

export function normalizeGraph(input) {
  if (!input) {
    return createInitialGraph();
  }

  if (isGraphShape(input)) {
    const normalized = {
      nodes: input.nodes.map(normalizeGraphNode),
    };
    return assertGraphDocument(normalized);
  }

  return createInitialGraph();
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
  const deletedNodeIds = new Set([id]);
  const nextNodes = graph.nodes
    .filter((node) => !deletedNodeIds.has(node.id))
    .map((node) => {
      pruneNodeConnections(node, deletedNodeIds);
      return node;
    });

  return {
    deleted: nextNodes.length !== graph.nodes.length,
    graph: {
      nodes: nextNodes,
    },
  };
}

export function createInitialGraphDocument() {
  return createInitialGraph();
}
