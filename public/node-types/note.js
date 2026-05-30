import { normalizeMessages, normalizeSummary } from "./shared.js";

function createNoteData(summary = "", messages = []) {
  return {
    summary: normalizeSummary(summary),
    messages: normalizeMessages(messages),
  };
}

export const noteNodeType = {
  type: "note",
  label: "通用节点",
  creationLabel: "通用节点",
  description: "用于承载摘要、消息记录和一般图上下文。",
  createData() {
    return createNoteData();
  },
  normalizeData(_node, data = {}) {
    return {
      ...createNoteData(),
      ...data,
      summary: normalizeSummary(data.summary),
      messages: normalizeMessages(data.messages),
    };
  },
  getSummary(node) {
    return normalizeSummary(node?.data?.summary);
  },
  setSummary(node, summary) {
    node.data.summary = normalizeSummary(summary);
  },
  getMessages(node) {
    return Array.isArray(node?.data?.messages) ? node.data.messages : [];
  },
  setMessages(node, messages) {
    node.data.messages = normalizeMessages(messages);
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
};
