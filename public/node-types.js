export const DEFAULT_NODE_TYPE = "note";
export const DEFAULT_AGENT_NODE_KEY = "assistant";

function normalizeMessage(message) {
  return {
    role: message.role || "agent",
    agent: message.agent || "",
    content: String(message.content || "").trim(),
  };
}

function createNoteData(summary = "", messages = []) {
  return {
    summary: typeof summary === "string" ? summary : "",
    messages: Array.isArray(messages) ? messages.map(normalizeMessage) : [],
  };
}

function createAgentData(summary = "", messages = [], agentKey = DEFAULT_AGENT_NODE_KEY) {
  return {
    summary: typeof summary === "string" ? summary : "",
    messages: Array.isArray(messages) ? messages.map(normalizeMessage) : [],
    agentKey: typeof agentKey === "string" && agentKey ? agentKey : DEFAULT_AGENT_NODE_KEY,
  };
}

function createTaskBoardData(summary = "", items = [], messages = []) {
  return {
    summary: typeof summary === "string" ? summary : "",
    items: Array.isArray(items)
      ? items
          .map((item) => ({
            id: Number(item?.id) || Date.now(),
            text: String(item?.text || "").trim(),
            status: item?.status === "done" ? "done" : "todo",
          }))
          .filter((item) => item.text)
      : [],
    messages: Array.isArray(messages) ? messages.map(normalizeMessage) : [],
  };
}

const nodeTypeRegistry = {
  note: {
    type: "note",
    label: "通用节点",
    creationLabel: "通用节点",
    description: "用于承载摘要、消息记录和一般图上下文。",
    createData() {
      return createNoteData();
    },
    normalizeData(node, data = {}) {
      return {
        ...createNoteData(),
        ...data,
        summary: typeof data.summary === "string" ? data.summary : "",
        messages: Array.isArray(data.messages) ? data.messages.map(normalizeMessage) : [],
      };
    },
    getSummary(node) {
      return typeof node?.data?.summary === "string" ? node.data.summary : "";
    },
    setSummary(node, summary) {
      node.data.summary = typeof summary === "string" ? summary : "";
    },
    getMessages(node) {
      return Array.isArray(node?.data?.messages) ? node.data.messages : [];
    },
    setMessages(node, messages) {
      node.data.messages = Array.isArray(messages) ? messages.map(normalizeMessage) : [];
    },
    getDialogTitle(node) {
      return this.getSummary(node) || "未命名节点";
    },
    getDialogStatus() {
      return "输入一条记录、问题或说明后发送到当前节点。";
    },
    getMessageLabel(message) {
      if (message.role === "user") {
        return "输入";
      }

      if (message.agent) {
        return `${message.agent} Agent`;
      }

      return "记录";
    },
    getCanvasSummary(node) {
      return this.getSummary(node);
    },
    getSubmitButtonLabel() {
      return "发送";
    },
    getCreateEdgeType() {
      return "relates_to";
    },
  },
  agent: {
    type: "agent",
    label: "Agent",
    creationLabel: "Agent 节点",
    description: "用于挂载一个可复用 agent，并基于上下文执行单轮响应。",
    createData() {
      return createAgentData("新 Agent");
    },
    normalizeData(node, data = {}) {
      return {
        ...createAgentData(),
        ...data,
        summary: typeof data.summary === "string" ? data.summary : "新 Agent",
        messages: Array.isArray(data.messages) ? data.messages.map(normalizeMessage) : [],
        agentKey:
          typeof data.agentKey === "string" && data.agentKey
            ? data.agentKey
            : DEFAULT_AGENT_NODE_KEY,
      };
    },
    getSummary(node) {
      return typeof node?.data?.summary === "string" ? node.data.summary : "新 Agent";
    },
    setSummary(node, summary) {
      node.data.summary = typeof summary === "string" ? summary : "新 Agent";
    },
    getMessages(node) {
      return Array.isArray(node?.data?.messages) ? node.data.messages : [];
    },
    setMessages(node, messages) {
      node.data.messages = Array.isArray(messages) ? messages.map(normalizeMessage) : [];
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
    getCreateEdgeType() {
      return "assigns_to";
    },
  },
  task_board: {
    type: "task_board",
    label: "Task Board",
    creationLabel: "任务板节点",
    description: "用于维护共享任务项清单，并通过节点关系连接上下文与执行者。",
    createData() {
      return createTaskBoardData("共享任务板");
    },
    normalizeData(node, data = {}) {
      return {
        ...createTaskBoardData(),
        ...data,
        summary: typeof data.summary === "string" ? data.summary : "共享任务板",
        items: createTaskBoardData("", data.items || []).items,
        messages: Array.isArray(data.messages) ? data.messages.map(normalizeMessage) : [],
      };
    },
    getSummary(node) {
      return typeof node?.data?.summary === "string" ? node.data.summary : "共享任务板";
    },
    setSummary(node, summary) {
      node.data.summary = typeof summary === "string" ? summary : "共享任务板";
    },
    getMessages(node) {
      return Array.isArray(node?.data?.messages) ? node.data.messages : [];
    },
    setMessages(node, messages) {
      node.data.messages = Array.isArray(messages) ? messages.map(normalizeMessage) : [];
    },
    getDialogTitle(node) {
      return this.getSummary(node);
    },
    getDialogStatus(node) {
      const items = Array.isArray(node?.data?.items) ? node.data.items : [];
      const openCount = items.filter((item) => item.status !== "done").length;
      return `输入一条任务后加入任务板。当前待办 ${openCount} 项。`;
    },
    getMessageLabel(_node, message) {
      return message.role === "user" ? "新增任务" : "任务板记录";
    },
    getCanvasSummary(node) {
      const items = Array.isArray(node?.data?.items) ? node.data.items : [];
      const preview = items
        .slice(0, 2)
        .map((item) => `${item.status === "done" ? "[x]" : "[ ]"}${item.text}`)
        .join(" ");
      return preview ? `${this.getSummary(node)} ${preview}` : this.getSummary(node);
    },
    getSubmitButtonLabel() {
      return "记入";
    },
    getCreateEdgeType() {
      return "feeds_context";
    },
  },
};

export function getNodeTypeDefinition(type) {
  return nodeTypeRegistry[type] || nodeTypeRegistry[DEFAULT_NODE_TYPE];
}

export function listNodeTypes() {
  return Object.values(nodeTypeRegistry);
}

export function createNodeData(type = DEFAULT_NODE_TYPE) {
  return getNodeTypeDefinition(type).createData();
}

export function normalizeNodeData(node, data = {}) {
  return getNodeTypeDefinition(node?.type).normalizeData(node, data);
}

export function getNodeSummary(node) {
  return getNodeTypeDefinition(node?.type).getSummary(node);
}

export function setNodeSummary(node, summary) {
  getNodeTypeDefinition(node?.type).setSummary(node, summary);
}

export function getNodeMessages(node) {
  return getNodeTypeDefinition(node?.type).getMessages(node);
}

export function setNodeMessages(node, messages) {
  getNodeTypeDefinition(node?.type).setMessages(node, messages);
}

export function getNodeDialogTitle(node) {
  return getNodeTypeDefinition(node?.type).getDialogTitle(node);
}

export function getNodeDialogStatus(node) {
  return getNodeTypeDefinition(node?.type).getDialogStatus(node);
}

export function getNodeMessageLabel(node, message) {
  return getNodeTypeDefinition(node?.type).getMessageLabel(node, message);
}

export function getCanvasNodeSummary(node) {
  return getNodeTypeDefinition(node?.type).getCanvasSummary(node);
}

export function getNodeSubmitButtonLabel(node) {
  return getNodeTypeDefinition(node?.type).getSubmitButtonLabel(node);
}

export function getTaskBoardItems(node) {
  if (node?.type !== "task_board") {
    return [];
  }

  return Array.isArray(node?.data?.items) ? node.data.items : [];
}

export function setTaskBoardItems(node, items) {
  if (node?.type !== "task_board") {
    return;
  }

  node.data.items = createTaskBoardData("", items).items;
}
