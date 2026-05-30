function isFiniteId(value) {
  return Number.isFinite(value);
}

function normalizeMessage(message) {
  if (!message || typeof message !== "object") {
    return null;
  }

  return {
    role: message?.role || "agent",
    agent: message?.agent || "",
    content: String(message?.content || "").trim(),
  };
}

function normalizeNodeSnapshot(node) {
  if (!node || typeof node !== "object") {
    return null;
  }

  if (!isFiniteId(node.id)) {
    return null;
  }

  const data = node.data && typeof node.data === "object" ? node.data : {};
  const normalizedData = { ...data };
  delete normalizedData.taskBoards;
  return {
    id: Number(node.id),
    type: typeof node.type === "string" ? node.type : "note",
    data: {
      ...normalizedData,
      summary: typeof normalizedData.summary === "string" ? normalizedData.summary : "",
      messages: Array.isArray(normalizedData.messages)
        ? normalizedData.messages.map(normalizeMessage).filter(Boolean)
        : [],
    },
  };
}

function normalizeLinkedNode(linkedNode) {
  if (!linkedNode || typeof linkedNode !== "object") {
    return null;
  }

  const nodeId = Number(linkedNode.nodeId);
  if (!isFiniteId(nodeId)) {
    return null;
  }

  const node = normalizeNodeSnapshot(linkedNode.node);
  if (!node || node.id !== nodeId) {
    return null;
  }

  return {
    nodeId,
    type: typeof linkedNode.type === "string" && linkedNode.type ? linkedNode.type : "link",
    label: typeof linkedNode.label === "string" ? linkedNode.label : "",
    node,
    data: linkedNode.data && typeof linkedNode.data === "object" ? { ...linkedNode.data } : {},
  };
}

function normalizeGraphContext(context) {
  if (!context || typeof context !== "object") {
    return null;
  }

  const focusNode = normalizeNodeSnapshot(context.focusNode);
  const linkedNodes = Array.isArray(context?.linkedNodes)
    ? context.linkedNodes.map(normalizeLinkedNode)
    : [];

  if (!focusNode) {
    return null;
  }

  if (linkedNodes.some((item) => !item)) {
    return null;
  }

  return {
    version: 4,
    focusNode,
    linkedNodes,
  };
}

module.exports = {
  normalizeGraphContext,
};
