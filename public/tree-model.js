export function createMessage(role, content, agent = "") {
  return {
    role,
    agent,
    content,
  };
}

function normalizeMessages(node) {
  if (Array.isArray(node.messages) && node.messages.length) {
    return node.messages.map((message) => ({
      role: message.role || "agent",
      agent: message.agent || "",
      content: String(message.content || "").trim(),
    }));
  }

  if (node.detail) {
    return [createMessage("agent", String(node.detail).trim(), "generator")];
  }

  return [];
}

export function normalizeNode(node) {
  return {
    id: node.id,
    summary: typeof node.summary === "string" ? node.summary : "",
    offsetX: node.offsetX || 0,
    offsetY: node.offsetY || 0,
    messages: normalizeMessages(node),
    children: (node.children || []).map(normalizeNode),
  };
}

export function normalizeForest(forest) {
  const nodes = Array.isArray(forest)
    ? forest
    : forest
      ? [forest]
      : createInitialForest();

  return nodes.map(normalizeNode);
}

export function getMaxId(forest) {
  const visitNode = (node) =>
    Math.max(node.id, ...node.children.map(visitNode), 0);

  return Math.max(0, ...forest.map(visitNode));
}

export function walkForest(forest, visit) {
  const walkNode = (node, depth, parent = null) => {
    visit(node, depth, parent);
    node.children.forEach((child) => walkNode(child, depth + 1, node));
  };

  forest.forEach((node) => walkNode(node, 0, null));
}

export function findNodeInForest(forest, id) {
  const findNode = (node, path = []) => {
    if (node.id === id) {
      return { node, path: [...path, node] };
    }

    for (const child of node.children) {
      const found = findNode(child, [...path, node]);
      if (found) {
        return found;
      }
    }

    return null;
  };

  for (const root of forest) {
    const found = findNode(root, []);
    if (found) {
      return found;
    }
  }

  return null;
}

export function deleteNodeFromForest(forest, id) {
  const prune = (nodes) => {
    const next = [];
    let deleted = false;

    nodes.forEach((node) => {
      if (node.id === id) {
        deleted = true;
        return;
      }

      const result = prune(node.children);
      node.children = result.nodes;
      deleted = deleted || result.deleted;
      next.push(node);
    });

    return { nodes: next, deleted };
  };

  return prune(forest);
}

export function createEmptyNode(id, offsetX = 0, offsetY = 0) {
  return {
    id,
    summary: "",
    offsetX,
    offsetY,
    messages: [],
    children: [],
  };
}

export function createInitialForest() {
  return [createEmptyNode(1)];
}
