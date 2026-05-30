import {
  normalizeMessages,
  normalizeSummary,
  normalizeTaskBoardItems,
} from "./shared.js";

export function createTaskBoardData(summary = "", items = [], messages = []) {
  return {
    summary: normalizeSummary(summary),
    items: normalizeTaskBoardItems(items),
    messages: normalizeMessages(messages),
  };
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

export const taskBoardNodeType = {
  type: "task_board",
  label: "Task Board",
  creationLabel: "任务板节点",
  description: "用于维护共享任务项清单。",
  createData() {
    return createTaskBoardData("共享任务板");
  },
  normalizeData(_node, data = {}) {
    return {
      ...createTaskBoardData(),
      ...data,
      summary: normalizeSummary(data.summary, "共享任务板"),
      items: createTaskBoardData("", data.items || []).items,
      messages: normalizeMessages(data.messages),
    };
  },
  getSummary(node) {
    return normalizeSummary(node?.data?.summary, "共享任务板");
  },
  setSummary(node, summary) {
    node.data.summary = normalizeSummary(summary, "共享任务板");
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
};
