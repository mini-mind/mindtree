import {
  getNodeById,
  getNodeConnections,
  getNodeMessages,
  getNodeSummary,
} from "./graph-model.js";
import { assertGraphDocument } from "./graph-validation.js";

function createNodeSnapshot(node) {
  if (!node) {
    return null;
  }

  const data = node.data && typeof node.data === "object" ? { ...node.data } : {};
  delete data.taskBoards;

  return {
    id: node.id,
    type: node.type,
    data: {
      ...data,
      summary: getNodeSummary(node),
      messages: getNodeMessages(node).map((message) => ({ ...message })),
    },
  };
}

function createLinkedNodeSnapshot(graph, connection) {
  const relatedNode = getNodeById(graph, connection.nodeId);

  return {
    nodeId: connection.nodeId,
    type: connection.type,
    label: typeof connection.label === "string" ? connection.label : "",
    node: createNodeSnapshot(relatedNode),
    data: connection.data && typeof connection.data === "object" ? { ...connection.data } : {},
  };
}

export function extractGraphContext(graph, focusNodeId) {
  assertGraphDocument(graph);
  const focusNode = getNodeById(graph, focusNodeId);
  if (!focusNode) {
    return null;
  }

  const linkedNodes = getNodeConnections(focusNode)
    .map((connection) => createLinkedNodeSnapshot(graph, connection))
    .filter((item) => item.node);

  return {
    version: 4,
    focusNode: createNodeSnapshot(focusNode),
    linkedNodes,
  };
}
