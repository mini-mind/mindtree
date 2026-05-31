const GRAPH_CONTEXT_VERSION = 4;

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
  return {
    id: Number(entity.id),
    data: {
      summary: typeof data.summary === "string" ? data.summary : "",
      messages: Array.isArray(data.messages)
        ? data.messages.map(normalizeMessage).filter(Boolean)
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
  };
}

function normalizeGraphContext(context) {
  if (!context || typeof context !== "object") {
    return {
      ok: false,
      error: "context is required",
    };
  }

  if (context.version !== GRAPH_CONTEXT_VERSION) {
    return {
      ok: false,
      error: `context version must be ${GRAPH_CONTEXT_VERSION}`,
    };
  }

  const focusEntity = normalizeEntitySnapshot(context.focusEntity);
  if (!focusEntity) {
    return {
      ok: false,
      error: "focusEntity is invalid",
    };
  }

  const linkedEntities = Array.isArray(context?.linkedEntities)
    ? context.linkedEntities.map(normalizeLinkedEntity)
    : [];

  if (linkedEntities.some((item) => !item)) {
    return {
      ok: false,
      error: "linkedEntities contain invalid snapshots",
    };
  }

  return {
    ok: true,
    context: {
      version: GRAPH_CONTEXT_VERSION,
      focusEntity,
      linkedEntities,
    },
  };
}

module.exports = {
  GRAPH_CONTEXT_VERSION,
  normalizeGraphContext,
};
