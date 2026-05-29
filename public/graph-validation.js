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

  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    fail("graph must contain nodes and edges arrays");
  }
}

function ensureFiniteId(value, label) {
  if (!Number.isFinite(value)) {
    fail(`${label} must be a finite number`);
  }
}

function ensureUniqueIds(items, label) {
  const seen = new Set();
  items.forEach((item, index) => {
    ensureFiniteId(item?.id, `${label}[${index}].id`);
    if (seen.has(item.id)) {
      fail(`duplicate ${label} id: ${item.id}`);
    }
    seen.add(item.id);
  });
}

function ensureEdgeEndpoints(graph, nodeIds) {
  graph.edges.forEach((edge, index) => {
    ensureFiniteId(edge?.source, `edges[${index}].source`);
    ensureFiniteId(edge?.target, `edges[${index}].target`);

    if (!nodeIds.has(edge.source)) {
      fail(`edge ${edge.id} references missing source node ${edge.source}`);
    }

    if (!nodeIds.has(edge.target)) {
      fail(`edge ${edge.id} references missing target node ${edge.target}`);
    }
  });
}

export function assertGraphDocument(graph) {
  ensureGraphShape(graph);
  ensureUniqueIds(graph.nodes, "node");
  ensureUniqueIds(graph.edges, "edge");

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  ensureEdgeEndpoints(graph, nodeIds);

  return graph;
}

export function validateGraphDocument(graph) {
  try {
    assertGraphDocument(graph);
    return { valid: true, error: "" };
  } catch (error) {
    if (error instanceof GraphValidationError) {
      return { valid: false, error: error.message };
    }

    throw error;
  }
}
