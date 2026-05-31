import { getEntityLinks, getMessages, getSummary } from "./ecs-entity-state.js";

export const GRAPH_CONTEXT_VERSION = 4;

function createEntitySnapshot(entity) {
  return {
    id: entity.id,
    data: {
      summary: getSummary(entity),
      messages: getMessages(entity),
    },
  };
}

export function buildEntityContext(graph, entity) {
  const linkedEntities = getEntityLinks(entity)
    .map((item) => {
      const target = graph.nodes.find((node) => node.id === item.entityId) || null;
      return target
        ? {
            entityId: item.entityId,
            type: item.type || "link",
            label: item.label || "",
            entity: createEntitySnapshot(target),
          }
        : null;
    })
    .filter(Boolean);

  return {
    version: GRAPH_CONTEXT_VERSION,
    focusEntity: createEntitySnapshot(entity),
    linkedEntities,
  };
}
