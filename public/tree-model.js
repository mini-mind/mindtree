export function getMaxId(node) {
  return Math.max(node.id, ...node.children.map(getMaxId), 0);
}

export function walk(node, depth, visit, parent = null) {
  visit(node, depth, parent);
  node.children.forEach((child) => walk(child, depth + 1, visit, node));
}

export function findNode(node, id, path = []) {
  if (node.id === id) {
    return { node, path: [...path, node] };
  }

  for (const child of node.children) {
    const found = findNode(child, id, [...path, node]);
    if (found) {
      return found;
    }
  }

  return null;
}

export function createInitialTree() {
  return {
    id: 1,
    title: "根问题",
    detail: "在这里定义你的核心命题，然后从分支逐步推演可能性。",
    offsetX: 0,
    offsetY: 0,
    children: [
      {
        id: 2,
        title: "初始假设",
        detail: "给出一个先验判断，或将问题拆成最先要验证的方向。",
        offsetX: 0,
        offsetY: 0,
        children: [],
      },
    ],
  };
}
