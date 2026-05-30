import { getNodeConnections } from "./node-types.js";

export class GraphValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "GraphValidationError";
  }
}

function fail(message) {
  throw new GraphValidationError(message);
}

function ensureGraphShape(graph) {
  if (!graph || typeof graph !== "object") {
    fail("graph must be an object");
  }

  if (!Array.isArray(graph.nodes)) {
    fail("graph must contain a nodes array");
  }
}

function ensureFiniteId(value, label) {
  if (!Number.isFinite(value)) {
    fail(`${label} must be a finite number`);
  }
}

function ensureUniqueNodeIds(nodes) {
  const seen = new Set();
  nodes.forEach((node, index) => {
    ensureFiniteId(node?.id, `nodes[${index}].id`);
    if (seen.has(node.id)) {
      fail(`duplicate node id: ${node.id}`);
    }
    seen.add(node.id);
  });
}

function ensureConnectionTargets(graph, nodeIds) {
  graph.nodes.forEach((node, index) => {
    getNodeConnections(node).forEach((connection, connectionIndex) => {
      ensureFiniteId(
        connection?.nodeId,
        `nodes[${index}] linked target[${connectionIndex}].nodeId`
      );

      if (!nodeIds.has(connection.nodeId)) {
        fail(`node ${node.id} links missing target node ${connection.nodeId}`);
      }
    });
  });
}

export function assertGraphDocument(graph) {
  ensureGraphShape(graph);
  ensureUniqueNodeIds(graph.nodes);

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  ensureConnectionTargets(graph, nodeIds);

  return graph;
}
