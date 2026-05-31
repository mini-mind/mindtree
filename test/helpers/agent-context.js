const { GRAPH_CONTEXT_VERSION } = require("../../server/graph-context");

function createEntitySnapshot(id, { summary = "", messages = [] } = {}) {
  return {
    id,
    data: {
      summary,
      messages: [...messages],
    },
  };
}

function createLinkedEntity(entityId, { type = "link", label = "", entity } = {}) {
  return {
    entityId,
    type,
    label,
    entity: entity || createEntitySnapshot(entityId),
  };
}

function createAgentContext({ focusEntity, linkedEntities = [] } = {}) {
  return {
    version: GRAPH_CONTEXT_VERSION,
    focusEntity: focusEntity || createEntitySnapshot(1),
    linkedEntities: [...linkedEntities],
  };
}

module.exports = {
  createAgentContext,
  createEntitySnapshot,
  createLinkedEntity,
};
