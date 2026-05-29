import {
  getIncomingEdges,
  getNodeById,
  getNodeMessages,
  getNodeSummary,
  getOutgoingEdges,
} from "./graph-model.js";
import { assertGraphDocument } from "./graph-validation.js";

function createNodeSnapshot(node) {
  if (!node) {
    return null;
  }

  return {
    id: node.id,
    type: node.type,
    data: {
      ...node.data,
      summary: getNodeSummary(node),
      messages: getNodeMessages(node).map((message) => ({ ...message })),
    },
  };
}

function createRelationSnapshot(graph, edge, direction) {
  const relatedNode =
    direction === "incoming" ? getNodeById(graph, edge.source) : getNodeById(graph, edge.target);

  return {
    id: edge.id,
    type: edge.type,
    direction,
    node: createNodeSnapshot(relatedNode),
    data: edge.data && typeof edge.data === "object" ? { ...edge.data } : {},
  };
}

function bucketRelationsByType(relations) {
  return relations.reduce((buckets, relation) => {
    if (!buckets[relation.type]) {
      buckets[relation.type] = [];
    }
    buckets[relation.type].push(relation);
    return buckets;
  }, {});
}

export function extractGraphContext(graph, focusNodeId) {
  assertGraphDocument(graph);
  const focusNode = getNodeById(graph, focusNodeId);
  if (!focusNode) {
    return null;
  }

  const incoming = getIncomingEdges(graph, focusNodeId).map((edge) =>
    createRelationSnapshot(graph, edge, "incoming")
  );
  const outgoing = getOutgoingEdges(graph, focusNodeId).map((edge) =>
    createRelationSnapshot(graph, edge, "outgoing")
  );

  const nodeIndex = new Map();
  [createNodeSnapshot(focusNode), ...incoming.map((item) => item.node), ...outgoing.map((item) => item.node)]
    .filter(Boolean)
    .forEach((node) => {
      nodeIndex.set(node.id, node);
    });

  return {
    version: 2,
    focusNode: createNodeSnapshot(focusNode),
    relations: {
      incoming,
      outgoing,
      byType: {
        incoming: bucketRelationsByType(incoming),
        outgoing: bucketRelationsByType(outgoing),
      },
    },
    subgraph: {
      nodes: [...nodeIndex.values()],
      edges: [...incoming, ...outgoing].map((relation) => ({
        id: relation.id,
        type: relation.type,
        direction: relation.direction,
        nodeId: relation.node?.id ?? null,
        data: { ...relation.data },
      })),
    },
  };
}
