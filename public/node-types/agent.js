import {
  DEFAULT_AGENT_NODE_KEY,
  normalizeAgentTaskBoards,
  normalizeMessages,
  normalizeSummary,
} from "./shared.js";

function createAgentData(
  summary = "",
  messages = [],
  agentKey = DEFAULT_AGENT_NODE_KEY,
  taskBoards = []
) {
  return {
    summary: normalizeSummary(summary),
    messages: normalizeMessages(messages),
    agentKey: typeof agentKey === "string" && agentKey ? agentKey : DEFAULT_AGENT_NODE_KEY,
    taskBoards: normalizeAgentTaskBoards(taskBoards),
  };
}

function getAgentConnections(node) {
  return normalizeAgentTaskBoards(node?.data?.taskBoards).map((taskBoard) => ({
    type: "agent/task_board",
    nodeId: taskBoard.nodeId,
    label: taskBoard.label,
    data: {
      label: taskBoard.label,
      config: { ...taskBoard.config },
    },
  }));
}

function pruneAgentConnections(node, deletedNodeIds) {
  node.data.taskBoards = normalizeAgentTaskBoards(node?.data?.taskBoards).filter(
    (taskBoard) => !deletedNodeIds.has(taskBoard.nodeId)
  );
}

export const agentNodeType = {
  type: "agent",
  label: "Agent",
  creationLabel: "Agent 节点",
  description: "用于挂载一个可复用 agent，并基于上下文执行单轮响应。",
  createData() {
    return createAgentData("新 Agent");
  },
  normalizeData(_node, data = {}) {
    return {
      ...createAgentData(),
      ...data,
      summary: normalizeSummary(data.summary, "新 Agent"),
      messages: normalizeMessages(data.messages),
      agentKey:
        typeof data.agentKey === "string" && data.agentKey
          ? data.agentKey
          : DEFAULT_AGENT_NODE_KEY,
      taskBoards: normalizeAgentTaskBoards(data.taskBoards),
    };
  },
  getSummary(node) {
    return normalizeSummary(node?.data?.summary, "新 Agent");
  },
  setSummary(node, summary) {
    node.data.summary = normalizeSummary(summary, "新 Agent");
  },
  getMessages(node) {
    return Array.isArray(node?.data?.messages) ? node.data.messages : [];
  },
  setMessages(node, messages) {
    node.data.messages = normalizeMessages(messages);
  },
  getDialogTitle(node) {
    return this.getSummary(node);
  },
  getDialogStatus(node) {
    const agentKey =
      typeof node?.data?.agentKey === "string" && node.data.agentKey
        ? node.data.agentKey
        : DEFAULT_AGENT_NODE_KEY;
    return `输入新的任务或问题后，调用 ${agentKey} agent 响应这个节点。`;
  },
  getMessageLabel(_node, message) {
    if (message.role === "user") {
      return "任务输入";
    }

    return message.agent ? `${message.agent} Agent` : "Agent 输出";
  },
  getCanvasSummary(node) {
    return this.getSummary(node);
  },
  getSubmitButtonLabel() {
    return "运行";
  },
  getConnections(node) {
    return getAgentConnections(node);
  },
  pruneConnections(node, deletedNodeIds) {
    pruneAgentConnections(node, deletedNodeIds);
  },
  describeConnection(connection) {
    return `${connection.type}: #${connection.nodeId}${
      connection.label ? ` (${connection.label})` : ""
    }`;
  },
};
