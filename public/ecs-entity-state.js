export function createDefaultNodeUi() {
  return {
    display: {
      body: ["messageThread"],
      composer: {
        placeholder: "输入内容",
        actionLabel: "发送",
      },
      statusMessage: "",
      messageLabels: {
        user: "输入",
        agent: "记录",
        agentWithNameTemplate: "{agent} Agent",
      },
      canvasSummary: "",
    },
  };
}

export function ensureNodeUi(entity) {
  if (!entity.ui || typeof entity.ui !== "object") {
    entity.ui = {};
  }

  const defaults = createDefaultNodeUi();
  if (!entity.ui.display || typeof entity.ui.display !== "object") {
    entity.ui.display = {};
  }

  if (!Array.isArray(entity.ui.display.body)) {
    entity.ui.display.body = [...defaults.display.body];
  }

  if (!entity.ui.display.composer || typeof entity.ui.display.composer !== "object") {
    entity.ui.display.composer = {};
  }

  if (typeof entity.ui.display.composer.placeholder !== "string") {
    entity.ui.display.composer.placeholder = defaults.display.composer.placeholder;
  }

  if (typeof entity.ui.display.composer.actionLabel !== "string") {
    entity.ui.display.composer.actionLabel = defaults.display.composer.actionLabel;
  }

  if (typeof entity.ui.display.statusMessage !== "string") {
    entity.ui.display.statusMessage = defaults.display.statusMessage;
  }

  if (!entity.ui.display.messageLabels || typeof entity.ui.display.messageLabels !== "object") {
    entity.ui.display.messageLabels = {};
  }

  if (typeof entity.ui.display.messageLabels.user !== "string") {
    entity.ui.display.messageLabels.user = defaults.display.messageLabels.user;
  }

  if (typeof entity.ui.display.messageLabels.agent !== "string") {
    entity.ui.display.messageLabels.agent = defaults.display.messageLabels.agent;
  }

  if (typeof entity.ui.display.messageLabels.agentWithNameTemplate !== "string") {
    entity.ui.display.messageLabels.agentWithNameTemplate =
      defaults.display.messageLabels.agentWithNameTemplate;
  }

  if (typeof entity.ui.display.canvasSummary !== "string") {
    entity.ui.display.canvasSummary = defaults.display.canvasSummary;
  }

  return entity.ui;
}

export function getNodeDisplay(entity) {
  return ensureNodeUi(entity).display;
}

export function getMessages(entity) {
  return Array.isArray(entity?.data?.messages) ? entity.data.messages : [];
}

export function setMessages(entity, messages) {
  entity.data.messages = Array.isArray(messages) ? messages : [];
}

export function getSummary(entity, fallback = "") {
  return typeof entity?.data?.summary === "string" ? entity.data.summary : fallback;
}

export function setSummary(entity, summary) {
  entity.data.summary = typeof summary === "string" ? summary : "";
}

export function getTaskBoardItems(entity) {
  return Array.isArray(entity?.data?.items) ? entity.data.items : [];
}

export function getEntityLinks(entity) {
  return Array.isArray(entity?.data?.links) ? entity.data.links : [];
}

export function setDialogStatus(entity, statusMessage) {
  getNodeDisplay(entity).statusMessage = statusMessage;
}

export function setNodeUiComposer(entity, placeholder, actionLabel) {
  const display = getNodeDisplay(entity);
  display.composer.placeholder = placeholder;
  display.composer.actionLabel = actionLabel;
}

export function setNodeUiBlocks(entity, blocks) {
  const display = getNodeDisplay(entity);
  display.body = Array.isArray(blocks) && blocks.length ? [...blocks] : ["messageThread"];
}

export function setNodeUiMessageLabels(entity, messageLabels = {}) {
  const display = getNodeDisplay(entity);
  display.messageLabels = {
    ...display.messageLabels,
    ...messageLabels,
  };
}

export function getNodeUiMessageLabels(entity) {
  return getNodeDisplay(entity).messageLabels;
}

export function setNodeUiCanvasSummary(entity, canvasSummary) {
  getNodeDisplay(entity).canvasSummary = typeof canvasSummary === "string" ? canvasSummary : "";
}

export function getNodeUiCanvasSummary(entity) {
  return getNodeDisplay(entity).canvasSummary;
}
