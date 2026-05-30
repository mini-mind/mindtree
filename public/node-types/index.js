import { agentNodeType } from "./agent.js";
import { noteNodeType } from "./note.js";
import { getTaskBoardItems, setTaskBoardItems, taskBoardNodeType } from "./task-board.js";
import { DEFAULT_AGENT_NODE_KEY } from "./shared.js";

export const DEFAULT_NODE_TYPE = "note";
export { DEFAULT_AGENT_NODE_KEY };

const nodeTypeRegistry = {
  note: noteNodeType,
  agent: agentNodeType,
  task_board: taskBoardNodeType,
};

export function getNodeTypeDefinition(type) {
  return nodeTypeRegistry[type] || nodeTypeRegistry[DEFAULT_NODE_TYPE];
}

export function listNodeTypes() {
  return Object.values(nodeTypeRegistry);
}

export function createNodeData(type = DEFAULT_NODE_TYPE) {
  return getNodeTypeDefinition(type).createData();
}

export function normalizeNodeData(node, data = {}) {
  return getNodeTypeDefinition(node?.type).normalizeData(node, data);
}

export function getNodeSummary(node) {
  return getNodeTypeDefinition(node?.type).getSummary(node);
}

export function setNodeSummary(node, summary) {
  getNodeTypeDefinition(node?.type).setSummary(node, summary);
}

export function getNodeMessages(node) {
  return getNodeTypeDefinition(node?.type).getMessages(node);
}

export function setNodeMessages(node, messages) {
  getNodeTypeDefinition(node?.type).setMessages(node, messages);
}

export function getNodeDialogTitle(node) {
  return getNodeTypeDefinition(node?.type).getDialogTitle(node);
}

export function getNodeDialogStatus(node) {
  return getNodeTypeDefinition(node?.type).getDialogStatus(node);
}

export function getNodeMessageLabel(node, message) {
  return getNodeTypeDefinition(node?.type).getMessageLabel(node, message);
}

export function getCanvasNodeSummary(node) {
  return getNodeTypeDefinition(node?.type).getCanvasSummary(node);
}

export function getNodeSubmitButtonLabel(node) {
  return getNodeTypeDefinition(node?.type).getSubmitButtonLabel(node);
}

export function getNodeConnections(node) {
  const definition = getNodeTypeDefinition(node?.type);
  if (typeof definition.getConnections === "function") {
    return definition.getConnections(node);
  }

  return [];
}

export function pruneNodeConnections(node, deletedNodeIds) {
  const definition = getNodeTypeDefinition(node?.type);
  if (typeof definition.pruneConnections === "function") {
    definition.pruneConnections(node, deletedNodeIds);
  }
}

export function describeNodeConnection(node, connection) {
  const definition = getNodeTypeDefinition(node?.type);
  if (typeof definition.describeConnection === "function") {
    return definition.describeConnection(connection);
  }

  return `${connection?.type || "connection"}: #${connection?.nodeId ?? "?"}`;
}
export { getTaskBoardItems, setTaskBoardItems };
