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
  return {
    id: Number(node.id),
    type: typeof node.type === "string" ? node.type : "note",
    data: {
      ...data,
      summary: typeof data.summary === "string" ? data.summary : "",
      messages: Array.isArray(data.messages)
        ? data.messages.map(normalizeMessage).filter(Boolean)
        : [],
    },
  };
}

function normalizeRelation(relation) {
  if (!relation || typeof relation !== "object") {
    return null;
  }

  if (!isFiniteId(relation.id)) {
    return null;
  }

  return {
    id: Number(relation.id),
    type: typeof relation.type === "string" ? relation.type : "relates_to",
    direction: relation.direction === "incoming" ? "incoming" : "outgoing",
    node: normalizeNodeSnapshot(relation.node),
    data: relation.data && typeof relation.data === "object" ? { ...relation.data } : {},
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

function validateRelations(relations) {
  const relationIds = new Set();

  for (const relation of relations) {
    if (!relation?.node) {
      return false;
    }

    if (relationIds.has(relation.id)) {
      return false;
    }

    relationIds.add(relation.id);
  }

  return true;
}

function normalizeGraphContext(context) {
  if (!context || typeof context !== "object") {
    return null;
  }

  const focusNode = normalizeNodeSnapshot(context.focusNode);
  const incoming = Array.isArray(context?.relations?.incoming)
    ? context.relations.incoming.map(normalizeRelation).filter(Boolean)
    : [];
  const outgoing = Array.isArray(context?.relations?.outgoing)
    ? context.relations.outgoing.map(normalizeRelation).filter(Boolean)
    : [];

  if (!focusNode) {
    return null;
  }

  if (!validateRelations([...incoming, ...outgoing])) {
    return null;
  }

  const nodeIndex = new Map();
  [focusNode, ...incoming.map((item) => item.node), ...outgoing.map((item) => item.node)]
    .filter(Boolean)
    .forEach((node) => {
      nodeIndex.set(node.id, node);
    });

  return {
    version: 2,
    focusNode,
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

module.exports = {
  normalizeGraphContext,
};
