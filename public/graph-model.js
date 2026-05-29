import {
  cascadesDeleteThroughEdgeType,
  createEdgeData,
  DEFAULT_EDGE_TYPE,
  normalizeEdgeData,
} from "./edge-types.js";
import { assertGraphDocument } from "./graph-validation.js";
import {
  createNodeData,
  DEFAULT_NODE_TYPE,
  getNodeMessages,
  getNodeSummary,
  normalizeNodeData,
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

export { getNodeSummary, setNodeSummary, getNodeMessages, setNodeMessages };

export function createNode(id, x = 0, y = 0, type = DEFAULT_NODE_TYPE) {
  return {
    id,
    type,
    x,
    y,
    data: createNodeData(type),
  };
}

export function createEdge(id, source, target, type = DEFAULT_EDGE_TYPE) {
  return {
    id,
    type,
    source,
    target,
    data: createEdgeData(type),
  };
}

function normalizeGraphNode(node) {
  const normalized = {
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

  return normalized;
}

function normalizeGraphEdge(edge) {
  return {
    id: Number(edge.id),
    type: typeof edge.type === "string" ? edge.type : DEFAULT_EDGE_TYPE,
    source: Number(edge.source),
    target: Number(edge.target),
    data: normalizeEdgeData(
      {
        ...edge,
        type: typeof edge.type === "string" ? edge.type : DEFAULT_EDGE_TYPE,
      },
      edge.data && typeof edge.data === "object" ? { ...edge.data } : {}
    ),
  };
}

function createInitialGraph() {
  return {
    nodes: [createNode(1)],
    edges: [],
  };
}

function isGraphShape(value) {
  return (
    value &&
    typeof value === "object" &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges)
  );
}

export function normalizeGraph(input) {
  if (!input) {
    return createInitialGraph();
  }

  if (isGraphShape(input)) {
    const normalized = {
      nodes: input.nodes.map(normalizeGraphNode),
      edges: input.edges.map(normalizeGraphEdge),
    };
    return assertGraphDocument(normalized);
  }

  return createInitialGraph();
}

export function getMaxGraphId(graph) {
  return graph.nodes.reduce((maxId, node) => Math.max(maxId, Number(node.id) || 0), 0);
}

export function getMaxGraphEdgeId(graph) {
  return graph.edges.reduce((maxId, edge) => Math.max(maxId, Number(edge.id) || 0), 0);
}

export function getNodeById(graph, id) {
  return graph.nodes.find((node) => node.id === id) || null;
}

export function getOutgoingEdges(graph, nodeId, type = null) {
  return graph.edges.filter(
    (edge) => edge.source === nodeId && (type === null || edge.type === type)
  );
}

export function getIncomingEdges(graph, nodeId, type = null) {
  return graph.edges.filter(
    (edge) => edge.target === nodeId && (type === null || edge.type === type)
  );
}

export function findNodeInGraph(graph, id) {
  const node = getNodeById(graph, id);
  if (!node) {
    return null;
  }

  return {
    node,
    path: [node],
  };
}

export function addGraphNode(graph, node) {
  graph.nodes.push(node);
}

export function addGraphEdge(graph, edge) {
  graph.edges.push(edge);
}

export function deleteNodeFromGraph(graph, id) {
  const targetIds = new Set([id]);
  const queue = [id];

  while (queue.length) {
    const currentId = queue.shift();
    getOutgoingEdges(graph, currentId).forEach((edge) => {
      if (!cascadesDeleteThroughEdgeType(edge.type)) {
        return;
      }
      if (!targetIds.has(edge.target)) {
        targetIds.add(edge.target);
        queue.push(edge.target);
      }
    });
  }

  const nextNodes = graph.nodes.filter((node) => !targetIds.has(node.id));
  const nextEdges = graph.edges.filter(
    (edge) => !targetIds.has(edge.source) && !targetIds.has(edge.target)
  );

  return {
    deleted: targetIds.size > 0 && nextNodes.length !== graph.nodes.length,
    graph: {
      nodes: nextNodes,
      edges: nextEdges,
    },
  };
}

export function createInitialGraphDocument() {
  return createInitialGraph();
}
