export const DEFAULT_AGENT_NODE_KEY = "assistant";

export function normalizeMessage(message) {
  return {
    role: message?.role || "agent",
    agent: message?.agent || "",
    content: String(message?.content || "").trim(),
  };
}

export function normalizeMessages(messages) {
  return Array.isArray(messages) ? messages.map(normalizeMessage) : [];
}

export function normalizeSummary(summary, fallback = "") {
  return typeof summary === "string" ? summary : fallback;
}

export function normalizeAgentTaskBoard(taskBoard) {
  if (!taskBoard || typeof taskBoard !== "object") {
    return null;
  }

  const nodeId = Number(taskBoard.nodeId);
  if (!Number.isFinite(nodeId)) {
    return null;
  }

  return {
    nodeId,
    label: String(taskBoard.label || "").trim(),
    config:
      taskBoard.config && typeof taskBoard.config === "object"
        ? { ...taskBoard.config }
        : {},
  };
}

export function normalizeAgentTaskBoards(taskBoards) {
  return Array.isArray(taskBoards)
    ? taskBoards.map(normalizeAgentTaskBoard).filter(Boolean)
    : [];
}

export function normalizeTaskBoardItems(items) {
  return Array.isArray(items)
    ? items
        .map((item) => ({
          id: Number(item?.id) || Date.now(),
          text: String(item?.text || "").trim(),
          status: item?.status === "done" ? "done" : "todo",
        }))
        .filter((item) => item.text)
    : [];
}
