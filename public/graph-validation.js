export class GraphValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "GraphValidationError";
  }
}

function fail(message) {
  throw new GraphValidationError(message);
}

export function assertGraphDocument(graph) {
  if (!graph || typeof graph !== "object") {
    fail("graph must be an object");
  }

  if (!Array.isArray(graph.nodes)) {
    fail("graph must contain a nodes array");
  }

  const ids = new Set();
  graph.nodes.forEach((node, index) => {
    if (!Number.isFinite(node?.id)) {
      fail(`nodes[${index}].id must be a finite number`);
    }
    if (ids.has(node.id)) {
      fail(`duplicate node id: ${node.id}`);
    }
    ids.add(node.id);
  });

  graph.nodes.forEach((node) => {
    if (!Array.isArray(node?.data?.links)) {
      return;
    }

    node.data.links.forEach((item) => {
      if (!ids.has(Number(item?.entityId))) {
        fail(`entity ${node.id} links missing target entity ${item?.entityId}`);
      }
    });
  });

  return graph;
}
