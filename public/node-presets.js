import { getAgentRole, listAgentRoles } from "./agent-roles.js";

function cloneMounts(mounts) {
  return mounts.map((mount) => ({
    key: mount.key,
    config: mount.config && typeof mount.config === "object" ? { ...mount.config } : {},
    mounts: Array.isArray(mount.mounts) ? cloneMounts(mount.mounts) : [],
  }));
}

export function listNodePresets() {
  return listAgentRoles().map((role) => ({
    key: role.key,
    label: role.label,
    description: role.description,
  }));
}

export function buildNodePresetState(roleKey = "build") {
  const role = getAgentRole(roleKey);
  return {
    data: {
      nodeType: "agent",
      agentRole: role.key,
      agentKey: "assistant",
      summary: role.defaultSummary,
      systemPrompt: role.systemPrompt,
      toolProfile: role.toolProfile,
      permissionProfile: role.permissionProfile,
      links: [],
      messages: [],
    },
    mounts: cloneMounts([
      { key: "summary-capability", config: { defaultSummary: role.defaultSummary } },
      { key: "message-log-capability", config: {} },
      { key: "entity-links-capability", config: { sourceField: "links" } },
      { key: "message-queue-capability", config: {} },
      { key: "agent-behavior", config: { agentKeyField: "agentKey" } },
    ]),
  };
}

export function getNodePreset(roleKey = "build") {
  return getAgentRole(roleKey);
}
