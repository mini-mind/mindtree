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

function normalizeEntitySnapshot(entity) {
  if (!entity || typeof entity !== "object") {
    return null;
  }

  if (!isFiniteId(entity.id)) {
    return null;
  }

  const data = entity.data && typeof entity.data === "object" ? entity.data : {};
  const normalizedData = { ...data };
  return {
    id: Number(entity.id),
    type: typeof entity.type === "string" ? entity.type : "note",
    data: {
      ...normalizedData,
      summary: typeof normalizedData.summary === "string" ? normalizedData.summary : "",
      messages: Array.isArray(normalizedData.messages)
        ? normalizedData.messages.map(normalizeMessage).filter(Boolean)
        : [],
    },
  };
}

function normalizeLinkedEntity(linkedEntity) {
  if (!linkedEntity || typeof linkedEntity !== "object") {
    return null;
  }

  const entityId = Number(linkedEntity.entityId);
  if (!isFiniteId(entityId)) {
    return null;
  }

  const entity = normalizeEntitySnapshot(linkedEntity.entity);
  if (!entity || entity.id !== entityId) {
    return null;
  }

  return {
    entityId,
    type: typeof linkedEntity.type === "string" && linkedEntity.type ? linkedEntity.type : "link",
    label: typeof linkedEntity.label === "string" ? linkedEntity.label : "",
    entity,
    data: linkedEntity.data && typeof linkedEntity.data === "object" ? { ...linkedEntity.data } : {},
  };
}

function normalizeGraphContext(context) {
  if (!context || typeof context !== "object") {
    return null;
  }

  const focusEntity = normalizeEntitySnapshot(context.focusEntity);
  const linkedEntities = Array.isArray(context?.linkedEntities)
    ? context.linkedEntities.map(normalizeLinkedEntity)
    : [];

  if (!focusEntity) {
    return null;
  }

  if (linkedEntities.some((item) => !item)) {
    return null;
  }

  return {
    version: 4,
    focusEntity,
    linkedEntities,
  };
}

module.exports = {
  normalizeGraphContext,
};
