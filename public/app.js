import {
  clearStoredGraph,
  getLocalFallbackConfig,
  loadStoredConfig,
  loadGraph,
  saveConfig,
  saveGraph,
} from "./config-store.js";
import {
  addGraphEdge,
  addGraphNode,
  createEdge,
  createMessage,
  createInitialGraphDocument,
  createNode,
  deleteNodeFromGraph,
  findNodeInGraph,
  getNodeMessages,
  getNodeSummary,
  getMaxGraphEdgeId,
  getMaxGraphId,
  normalizeGraph,
  setNodeMessages,
  setNodeSummary,
} from "./graph-model.js";
import {
  buildInitialConfig,
  createLlmConfigController,
} from "./llm-config-ui.js";
import {
  getNodeDialogStatus,
  getNodeDialogTitle,
  getNodeMessageLabel,
  getNodeSubmitButtonLabel,
  getTaskBoardItems,
  listNodeTypes,
  setTaskBoardItems,
} from "./node-types.js";
import { DEFAULT_EDGE_TYPE, listEdgeTypes } from "./edge-types.js";
import { extractGraphContext } from "./graph-context.js";
import { GraphValidationError } from "./graph-validation.js";
import { createGraphCanvas, GRAPH_CANVAS_THEME } from "./graph-canvas.js";

const AGENT_DEFINITIONS = [
  { key: "assistant", label: "Assistant" },
];

const canvas = document.getElementById("graph-canvas");

const elements = {
  status: document.getElementById("status"),
  helpDialog: document.getElementById("help-dialog"),
  floatingHelp: document.getElementById("floating-help"),
  floatingConfig: document.getElementById("floating-config"),
  configDialog: document.getElementById("config-dialog"),
  saveConfig: document.getElementById("save-config"),
  cfgBaseUrl: document.getElementById("cfg-base-url"),
  cfgApiKey: document.getElementById("cfg-api-key"),
  cfgModelSelect: document.getElementById("cfg-model-select"),
  cfgModelCustomField: document.getElementById("cfg-model-custom-field"),
  cfgModel: document.getElementById("cfg-model"),
  modelOptions: document.getElementById("model-options"),
  configTabTriggerBase: document.getElementById("config-tab-trigger-base"),
  configAgentTabs: document.getElementById("config-agent-tabs"),
  configAgentPanels: document.getElementById("config-agent-panels"),
  nodeContextMenu: document.getElementById("node-context-menu"),
  contextEditNode: document.getElementById("context-edit-node"),
  contextDeleteNode: document.getElementById("context-delete-node"),
  canvasContextMenu: document.getElementById("canvas-context-menu"),
  contextAddNode: document.getElementById("context-add-node"),
  contextDeleteSelectedNodes: document.getElementById("context-delete-selected-nodes"),
  nodeDialog: document.getElementById("node-dialog"),
  nodeDialogSummary: document.getElementById("node-dialog-summary"),
  nodeDialogPanel: document.getElementById("node-dialog-panel"),
  nodeDialogMessages: document.getElementById("node-dialog-messages"),
  nodeDialogDirection: document.getElementById("node-dialog-direction"),
  nodeDialogSubmit: document.getElementById("node-dialog-submit"),
  nodeDialogStatus: document.getElementById("node-dialog-status"),
  createNodeDialog: document.getElementById("create-node-dialog"),
  createNodeTypeList: document.getElementById("create-node-type-list"),
  createNodeDescription: document.getElementById("create-node-description"),
  confirmCreateNode: document.getElementById("confirm-create-node"),
  createEdgeDialog: document.getElementById("create-edge-dialog"),
  createEdgeTypeList: document.getElementById("create-edge-type-list"),
  createEdgeLabel: document.getElementById("create-edge-label"),
  createEdgeNote: document.getElementById("create-edge-note"),
  createEdgeDescription: document.getElementById("create-edge-description"),
  confirmCreateEdge: document.getElementById("confirm-create-edge"),
};

const serverConfig = getLocalFallbackConfig();
let modelCapabilities = {};
let knownModels = [];
let graph = createInitialGraphDocument();
let llmConfig = buildInitialConfig(
  AGENT_DEFINITIONS,
  serverConfig,
  loadStoredConfig(),
  modelCapabilities
);
let nodeId = Math.max(2, getMaxGraphId(graph) + 1);
let edgeId = Math.max(1, getMaxGraphEdgeId(graph) + 1);
const interactionState = {
  selectedIds: graph.nodes[0]?.id == null ? [] : [graph.nodes[0].id],
  contextMenuNodeId: null,
  canvasContextMenuPosition: null,
  createNodeIntent: null,
  selectedCreateNodeType: "note",
  createEdgeIntent: null,
  selectedCreateEdgeType: DEFAULT_EDGE_TYPE,
};

function normalizeSelectedIds(ids = []) {
  return [...new Set(ids.filter((id) => Number.isFinite(id)))];
}

function setSelection(nextSelectedIds = []) {
  interactionState.selectedIds = normalizeSelectedIds(nextSelectedIds);
}

function getSelection() {
  return {
    selectedId: interactionState.selectedIds[0] ?? null,
    selectedIds: [...interactionState.selectedIds],
  };
}

function selectSingleNode(id) {
  setSelection(id === null ? [] : [id]);
}

function clearSelection() {
  setSelection([]);
}

function persistGraph() {
  saveGraph(graph);
}

function replaceGraph(nextGraph) {
  graph = nextGraph;
  persistGraph();
  syncSelection();
}

function getContextMenuNodeId() {
  return interactionState.contextMenuNodeId;
}

function getCanvasContextPosition() {
  return interactionState.canvasContextMenuPosition || { x: 0, y: 0 };
}

function setNodeContextTarget(nodeId) {
  interactionState.contextMenuNodeId = nodeId;
}

function clearNodeContextTarget() {
  interactionState.contextMenuNodeId = null;
}

function setCanvasContextPosition(position) {
  interactionState.canvasContextMenuPosition = position;
}

function clearCanvasContextPosition() {
  interactionState.canvasContextMenuPosition = null;
}

function setCreateNodeIntent(intent) {
  interactionState.createNodeIntent = intent;
}

function getCreateNodeIntent() {
  return interactionState.createNodeIntent;
}

function setSelectedCreateNodeType(type) {
  interactionState.selectedCreateNodeType = type;
}

function setCreateEdgeIntent(intent) {
  interactionState.createEdgeIntent = intent;
}

function getCreateEdgeIntent() {
  return interactionState.createEdgeIntent;
}

function setSelectedCreateEdgeType(type) {
  interactionState.selectedCreateEdgeType = type;
}

function clampToViewport(element, position, margin = 12) {
  const previousHidden = element.hidden;
  const previousVisibility = element.style.visibility;

  element.hidden = false;
  element.style.visibility = "hidden";
  element.style.left = "0px";
  element.style.top = "0px";

  const rect = element.getBoundingClientRect();
  const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);

  element.style.left = `${Math.min(Math.max(position.x, margin), maxLeft)}px`;
  element.style.top = `${Math.min(Math.max(position.y, margin), maxTop)}px`;
  element.style.visibility = previousVisibility;
  element.hidden = previousHidden;
}

function buildCreateNodeDescription(nodeType) {
  if (!nodeType) {
    return "选择节点类型后创建。";
  }

  return `将在当前画布位置创建一个“${nodeType.creationLabel || nodeType.label}”。`;
}

function buildCreateEdgeDescription(edgeType, intent) {
  if (!edgeType || !intent) {
    return "选择关系类型并填写可选属性后创建。";
  }

  const sourceNode = findNodeInGraph(graph, intent.sourceId)?.node;
  const targetNode = findNodeInGraph(graph, intent.targetId)?.node;
  const sourceLabel = getNodeDialogTitle(sourceNode || { data: {} });
  const targetLabel = getNodeDialogTitle(targetNode || { data: {} });

  return `将在“${sourceLabel}”与“${targetLabel}”之间创建“${edgeType.creationLabel || edgeType.label}”关系。`;
}

function renderCreateNodeDialogOptions() {
  const nodeTypes = listNodeTypes();

  elements.createNodeTypeList.innerHTML = "";
  nodeTypes.forEach((nodeType) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `option-card${
      interactionState.selectedCreateNodeType === nodeType.type ? " is-active" : ""
    }`;
    button.dataset.nodeType = nodeType.type;
    button.innerHTML = `
      <span class="option-card-title">${nodeType.creationLabel || nodeType.label}</span>
      <span class="option-card-desc">${nodeType.description || ""}</span>
    `;
    button.addEventListener("click", () => {
      setSelectedCreateNodeType(nodeType.type);
      renderCreateNodeDialogOptions();
    });
    elements.createNodeTypeList.appendChild(button);
  });

  const selectedNodeType = nodeTypes.find(
    (nodeType) => nodeType.type === interactionState.selectedCreateNodeType
  );
  elements.createNodeDescription.textContent = buildCreateNodeDescription(selectedNodeType);
}

function renderCreateEdgeDialogOptions() {
  const edgeTypes = listEdgeTypes();
  elements.createEdgeTypeList.innerHTML = "";

  edgeTypes.forEach((edgeType) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `option-card${
      interactionState.selectedCreateEdgeType === edgeType.type ? " is-active" : ""
    }`;
    button.dataset.edgeType = edgeType.type;
    button.innerHTML = `
      <span class="option-card-title">${edgeType.creationLabel || edgeType.label}</span>
      <span class="option-card-desc">${edgeType.description || ""}</span>
    `;
    button.addEventListener("click", () => {
      setSelectedCreateEdgeType(edgeType.type);
      renderCreateEdgeDialogOptions();
    });
    elements.createEdgeTypeList.appendChild(button);
  });

  const selectedEdgeType = edgeTypes.find(
    (edgeType) => edgeType.type === interactionState.selectedCreateEdgeType
  );
  elements.createEdgeDescription.textContent = buildCreateEdgeDescription(
    selectedEdgeType,
    getCreateEdgeIntent()
  );
}

function getNodeOffsetAtScreenPosition(position) {
  const point = graphCanvas.projectScreenToWorld(position.x, position.y);
  return {
    x: point.x - GRAPH_CANVAS_THEME.nodeWidth / 2,
    y: point.y - GRAPH_CANVAS_THEME.nodeMinHeight / 2,
  };
}

const graphCanvas = createGraphCanvas(canvas, {
  onNodeSelect: (id) => {
    closeAllContextMenus();
    selectSingleNode(id);
    syncSelection();
  },
  onNodesSelect: (ids) => {
    closeAllContextMenus();
    setSelection(ids);
    syncSelection();
  },
  onNodeOpen: (id) => {
    closeAllContextMenus();
    selectSingleNode(id);
    syncSelection();
    openNodeDialog();
  },
  onBackgroundSelect: () => {
    closeAllContextMenus();
    clearSelection();
    syncSelection();
  },
  onNodeMove: (id, deltaX, deltaY) => {
    const found = findNodeInGraph(graph, id);
    if (!found) {
      return;
    }

    found.node.x = (found.node.x || 0) + deltaX;
    found.node.y = (found.node.y || 0) + deltaY;
    persistGraph();
    syncSelection();
  },
  onNodeContextMenu: (id, position) => {
    const { selectedIds } = getSelection();
    if (selectedIds.length > 1 && selectedIds.includes(id)) {
      openCanvasContextMenu(position);
      return;
    }
    openNodeContextMenu(id, position);
  },
  onBackgroundContextMenu: (position) => {
    openCanvasContextMenu(position);
  },
  onEdgeCreate: (sourceId, targetId) => {
    closeAllContextMenus();
    openCreateEdgeDialog({ sourceId, targetId });
  },
});
const llmConfigUi = createLlmConfigController({
  agentDefinitions: AGENT_DEFINITIONS,
  elements,
  serverConfig,
  getConfig: () => llmConfig,
  setConfig: (nextConfig) => {
    llmConfig = nextConfig;
  },
  getKnownModels: () => knownModels,
  getModelCapabilitiesMap: () => modelCapabilities,
});

function openConfig() {
  llmConfigUi.hydrateForm();
  elements.configDialog.showModal();
}

function saveConfigFromDialog() {
  llmConfigUi.updateConfig(llmConfigUi.collectForm());
  saveConfig(llmConfig);
  llmConfigUi.hydrateForm();
  elements.configDialog.close();
  setStatus("LLM 配置已保存到本地。");
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function setNodeDialogStatus(message, isError = false) {
  elements.nodeDialogStatus.textContent = message;
  elements.nodeDialogStatus.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function renderNodeMessages(node) {
  elements.nodeDialogMessages.innerHTML = "";
  getNodeMessages(node).forEach((message) => {
    const article = document.createElement("article");
    article.className = `message-card is-${message.role}`;

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = getNodeMessageLabel(node, message);
    article.appendChild(meta);

    const body = document.createElement("p");
    body.className = "message-body";
    body.textContent = message.content;
    article.appendChild(body);

    elements.nodeDialogMessages.appendChild(article);
  });
}

function renderNodePanel(node) {
  elements.nodeDialogPanel.innerHTML = "";
  elements.nodeDialogPanel.hidden = true;

  if (node.type !== "task_board") {
    return;
  }

  const items = getTaskBoardItems(node);
  const title = document.createElement("div");
  title.className = "message-meta";
  title.textContent = `任务项 ${items.length} 条`;
  elements.nodeDialogPanel.appendChild(title);

  const list = document.createElement("div");
  list.className = "task-board-list";
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "task-board-item";
    row.innerHTML = `
      <span class="task-board-item-status">${item.status === "done" ? "[x]" : "[ ]"}</span>
      <span>${item.text}</span>
    `;
    list.appendChild(row);
  });

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "task-board-item";
    empty.innerHTML = `<span class="task-board-item-status">[ ]</span><span>暂无任务项</span>`;
    list.appendChild(empty);
  }

  elements.nodeDialogPanel.appendChild(list);
  elements.nodeDialogPanel.hidden = false;
}

function syncSelection() {
  const { selectedId, selectedIds } = getSelection();
  graphCanvas.render(graph, selectedId, selectedIds);
}

function openNodeDialog() {
  const { selectedId } = getSelection();
  const found = findNodeInGraph(graph, selectedId);
  if (!found) {
    return;
  }

  elements.nodeDialogSummary.textContent = getNodeDialogTitle(found.node);
  elements.nodeDialogSubmit.textContent = getNodeSubmitButtonLabel(found.node);
  elements.nodeDialogDirection.value = "";
  renderNodePanel(found.node);
  renderNodeMessages(found.node);
  setNodeDialogStatus(getNodeDialogStatus(found.node));
  elements.nodeDialog.showModal();
}

function resetNodeDialog(foundNode) {
  elements.nodeDialogSummary.textContent = getNodeDialogTitle(foundNode);
  elements.nodeDialogSubmit.textContent = getNodeSubmitButtonLabel(foundNode);
  elements.nodeDialogDirection.value = "";
  renderNodePanel(foundNode);
  renderNodeMessages(foundNode);
}

function appendNode(offsetX = 0, offsetY = 0, type = "note") {
  const node = createNode(nodeId++, offsetX, offsetY, type);
  addGraphNode(graph, node);
  selectSingleNode(node.id);
  persistGraph();
  syncSelection();
}

function openCreateNodeDialog(intent) {
  setCreateNodeIntent(intent);
  setSelectedCreateNodeType("note");
  renderCreateNodeDialogOptions();
  elements.createNodeDialog.showModal();
}

function confirmCreateNodeFromDialog() {
  const intent = getCreateNodeIntent();
  if (!intent) {
    return;
  }

  appendNode(
    intent.offset.x,
    intent.offset.y,
    interactionState.selectedCreateNodeType
  );
  setStatus("已新增节点。");

  elements.createNodeDialog.close();
}

function openCreateEdgeDialog(intent) {
  setCreateEdgeIntent(intent);
  setSelectedCreateEdgeType(DEFAULT_EDGE_TYPE);
  elements.createEdgeLabel.value = "";
  elements.createEdgeNote.value = "";
  renderCreateEdgeDialogOptions();
  elements.createEdgeDialog.showModal();
}

function confirmCreateEdgeFromDialog() {
  const intent = getCreateEdgeIntent();
  if (!intent) {
    return;
  }

  const sourceNode = findNodeInGraph(graph, intent.sourceId)?.node;
  const targetNode = findNodeInGraph(graph, intent.targetId)?.node;
  if (!sourceNode || !targetNode) {
    setStatus("创建连接失败：节点不存在。", true);
    return;
  }

  const edge = createEdge(
    edgeId++,
    intent.sourceId,
    intent.targetId,
    interactionState.selectedCreateEdgeType
  );
  edge.data = {
    ...edge.data,
    label: elements.createEdgeLabel.value.trim(),
    note: elements.createEdgeNote.value.trim(),
  };

  addGraphEdge(graph, edge);
  persistGraph();
  syncSelection();
  elements.createEdgeDialog.close();
  setStatus("已创建连接。");
}

async function loadServerDefaults() {
  try {
    const response = await fetch("/api/default-config");
    if (!response.ok) {
      return;
    }

    const serverDefaults = await response.json();
    modelCapabilities = serverDefaults.modelCapabilities || {};
    knownModels = serverDefaults.knownModels || Object.keys(modelCapabilities);
    delete serverDefaults.modelCapabilities;
    delete serverDefaults.knownModels;

    Object.assign(serverConfig, serverDefaults);
    llmConfig = buildInitialConfig(
      AGENT_DEFINITIONS,
      serverConfig,
      loadStoredConfig(),
      modelCapabilities
    );
    llmConfigUi.hydrateForm();
  } catch {
    modelCapabilities = {};
    knownModels = [];
  }
}

function restoreGraphFromStorage() {
  try {
    return normalizeGraph(loadGraph() || createInitialGraphDocument());
  } catch (error) {
    if (!(error instanceof GraphValidationError)) {
      throw error;
    }

    clearStoredGraph();
    setStatus(`已重置损坏图数据：${error.message}`, true);
    return createInitialGraphDocument();
  }
}

async function requestAgentRun(found, promptText) {
  const context = extractGraphContext(graph, found.node.id);
  const response = await fetch("/api/agent-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentKey: found.node.data?.agentKey || "assistant",
      context,
      prompt: promptText,
      config: llmConfig,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }

  return data;
}

async function appendNoteMessageFromDialog() {
  const { selectedId } = getSelection();
  const found = findNodeInGraph(graph, selectedId);
  if (!found) {
    return;
  }
  const messageText = elements.nodeDialogDirection.value.trim();
  if (!messageText) {
    setNodeDialogStatus("先输入一条记录、问题或说明。", true);
    return;
  }

  setNodeMessages(found.node, [...getNodeMessages(found.node), createMessage("user", messageText)]);
  if (!getNodeSummary(found.node)) {
    setNodeSummary(found.node, messageText.slice(0, 48));
  }
  resetNodeDialog(found.node);
  persistGraph();
  syncSelection();
  setNodeDialogStatus("记录已加入当前节点。");
  setStatus("记录已加入当前节点。");
}

async function runAgentNodeFromDialog() {
  const { selectedId } = getSelection();
  const found = findNodeInGraph(graph, selectedId);
  if (!found) {
    return;
  }

  if (!llmConfig.apiKey || !llmConfig.baseUrl || !llmConfig.model) {
    setNodeDialogStatus("先填写 LLM 配置。", true);
    llmConfigUi.setActiveTab("base");
    openConfig();
    return;
  }

  const promptText = elements.nodeDialogDirection.value.trim();
  if (!promptText) {
    setNodeDialogStatus("先输入这次希望 agent 处理的任务。", true);
    return;
  }

  elements.nodeDialogSubmit.disabled = true;
  setNodeDialogStatus("Agent 处理中...");

  try {
    setNodeMessages(found.node, [...getNodeMessages(found.node), createMessage("user", promptText)]);
    const result = await requestAgentRun(found, promptText);
    setNodeMessages(found.node, [
      ...getNodeMessages(found.node),
      createMessage("agent", result.message || "", found.node.data?.agentKey || "assistant"),
    ]);
    if (result.summary) {
      setNodeSummary(found.node, result.summary);
    }
    resetNodeDialog(found.node);
    persistGraph();
    syncSelection();
    setNodeDialogStatus("Agent 已完成本轮响应。");
    setStatus("Agent 已完成本轮响应。");
  } catch (error) {
    const currentMessages = getNodeMessages(found.node);
    setNodeMessages(
      found.node,
      currentMessages.filter(
        (message, index) =>
          !(
            index === currentMessages.length - 1 &&
            message.role === "user" &&
            message.content === promptText
          )
      )
    );
    renderNodeMessages(found.node);
    setNodeDialogStatus(error.message || "Agent 请求失败", true);
  } finally {
    elements.nodeDialogSubmit.disabled = false;
  }
}

async function updateTaskBoardFromDialog() {
  const { selectedId } = getSelection();
  const found = findNodeInGraph(graph, selectedId);
  if (!found) {
    return;
  }

  const taskText = elements.nodeDialogDirection.value.trim();
  if (!taskText) {
    setNodeDialogStatus("先输入一条任务内容。", true);
    return;
  }

  const nextItems = [
    ...getTaskBoardItems(found.node),
    {
      id: Date.now(),
      text: taskText,
      status: "todo",
    },
  ];
  setTaskBoardItems(found.node, nextItems);
  setNodeMessages(found.node, [
    ...getNodeMessages(found.node),
    createMessage("user", taskText),
    createMessage("agent", `已加入任务板：${taskText}`, "task_board"),
  ]);
  resetNodeDialog(found.node);
  persistGraph();
  syncSelection();
  setNodeDialogStatus("任务已加入任务板。");
  setStatus("任务已加入任务板。");
}

async function submitNodeDialog() {
  const { selectedId } = getSelection();
  const found = findNodeInGraph(graph, selectedId);
  if (!found) {
    return;
  }

  if (found.node.type === "agent") {
    await runAgentNodeFromDialog();
    return;
  }

  if (found.node.type === "task_board") {
    await updateTaskBoardFromDialog();
    return;
  }

  await appendNoteMessageFromDialog();
}

function bindDialogBackdropClose(dialog) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
}

function deleteSelectedNode(targetId) {
  const result = deleteNodeFromGraph(graph, targetId);
  if (!result.deleted) {
    return;
  }

  setSelection(result.graph.nodes[0] ? [result.graph.nodes[0].id] : []);
  replaceGraph(result.graph);
  closeNodeContextMenu();
  setStatus("节点已删除。");
}

function deleteSelectedNodes(targetIds) {
  const ids = [...new Set(targetIds)].sort((left, right) => right - left);
  let nextGraph = graph;
  let deletedCount = 0;

  ids.forEach((id) => {
    const result = deleteNodeFromGraph(nextGraph, id);
    if (result.deleted) {
      nextGraph = result.graph;
      deletedCount += 1;
    }
  });

  if (!deletedCount) {
    return;
  }

  clearSelection();
  replaceGraph(nextGraph);
  closeAllContextMenus();
  setStatus(deletedCount === 1 ? "节点已删除。" : `已删除 ${deletedCount} 个节点。`);
}

function openNodeContextMenu(nodeId, position) {
  const found = findNodeInGraph(graph, nodeId);
  if (!found) {
    return;
  }

  closeCanvasContextMenu();
  setNodeContextTarget(nodeId);
  selectSingleNode(nodeId);
  syncSelection();
  elements.nodeContextMenu.hidden = false;
  clampToViewport(elements.nodeContextMenu, position);
}

function closeNodeContextMenu() {
  clearNodeContextTarget();
  elements.nodeContextMenu.hidden = true;
}

function openCanvasContextMenu(position) {
  closeNodeContextMenu();
  const { selectedIds } = getSelection();
  setCanvasContextPosition(position);
  elements.contextDeleteSelectedNodes.hidden = selectedIds.length < 2;
  elements.canvasContextMenu.hidden = false;
  clampToViewport(elements.canvasContextMenu, position);
}

function closeCanvasContextMenu() {
  clearCanvasContextPosition();
  elements.canvasContextMenu.hidden = true;
}

function closeAllContextMenus() {
  closeNodeContextMenu();
  closeCanvasContextMenu();
}

elements.cfgModelSelect.addEventListener("change", () => {
  const isCustom = elements.cfgModelSelect.value === "__custom__";
  elements.cfgModelCustomField.style.display = isCustom ? "flex" : "none";
  llmConfigUi.renderModelOptions(
    isCustom ? elements.cfgModel.value.trim() || serverConfig.model : elements.cfgModelSelect.value
  );
});

elements.cfgModel.addEventListener("input", () => {
  if (elements.cfgModelSelect.value === "__custom__") {
    llmConfigUi.renderModelOptions(elements.cfgModel.value.trim() || serverConfig.model);
  }
});

elements.configTabTriggerBase.addEventListener("click", () => {
  llmConfigUi.setActiveTab("base");
});

elements.floatingConfig.addEventListener("click", openConfig);
elements.floatingHelp.addEventListener("click", () => {
  elements.helpDialog.showModal();
});

elements.contextEditNode.addEventListener("click", () => {
  const nodeId = getContextMenuNodeId();
  if (nodeId === null) {
    return;
  }
  selectSingleNode(nodeId);
  closeNodeContextMenu();
  openNodeDialog();
});

elements.contextDeleteNode.addEventListener("click", () => {
  const nodeId = getContextMenuNodeId();
  if (nodeId === null) {
    return;
  }
  deleteSelectedNode(nodeId);
});

elements.contextAddNode.addEventListener("click", () => {
  const offset = getNodeOffsetAtScreenPosition(getCanvasContextPosition());
  closeCanvasContextMenu();
  openCreateNodeDialog({ offset });
});

elements.contextDeleteSelectedNodes.addEventListener("click", () => {
  deleteSelectedNodes(getSelection().selectedIds);
});

elements.saveConfig.addEventListener("click", (event) => {
  event.preventDefault();
  saveConfigFromDialog();
});

elements.nodeDialogSubmit.addEventListener("click", () => {
  submitNodeDialog();
});

elements.confirmCreateNode.addEventListener("click", () => {
  confirmCreateNodeFromDialog();
});

elements.confirmCreateEdge.addEventListener("click", () => {
  confirmCreateEdgeFromDialog();
});

window.addEventListener("resize", () => {
  closeAllContextMenus();
  graphCanvas.resize();
});

window.addEventListener("pointerdown", (event) => {
  if (!elements.nodeContextMenu.hidden && !elements.nodeContextMenu.contains(event.target)) {
    closeNodeContextMenu();
  }

  if (!elements.canvasContextMenu.hidden && !elements.canvasContextMenu.contains(event.target)) {
    closeCanvasContextMenu();
  }
});

bindDialogBackdropClose(elements.helpDialog);
bindDialogBackdropClose(elements.configDialog);
bindDialogBackdropClose(elements.nodeDialog);
bindDialogBackdropClose(elements.createNodeDialog);
bindDialogBackdropClose(elements.createEdgeDialog);
llmConfigUi.renderAgentPanels();
graph = restoreGraphFromStorage();
nodeId = Math.max(2, getMaxGraphId(graph) + 1);
edgeId = Math.max(1, getMaxGraphEdgeId(graph) + 1);
setSelection(graph.nodes[0] ? [graph.nodes[0].id] : []);
syncSelection();
graphCanvas.resize();
loadServerDefaults();

window.__mindtreeTestApi = {
  openNodeById(id) {
    selectSingleNode(id);
    syncSelection();
    openNodeDialog();
  },
  getSelection() {
    return {
      ...getSelection(),
      nodeContextMenuHidden: elements.nodeContextMenu.hidden,
      canvasContextMenuHidden: elements.canvasContextMenu.hidden,
      batchDeleteHidden: elements.contextDeleteSelectedNodes.hidden,
    };
  },
  getGraph() {
    return JSON.parse(JSON.stringify(graph));
  },
  setGraph(nextGraph) {
    graph = normalizeGraph(nextGraph);
    nodeId = Math.max(2, getMaxGraphId(graph) + 1);
    edgeId = Math.max(1, getMaxGraphEdgeId(graph) + 1);
    setSelection(graph.nodes[0] ? [graph.nodes[0].id] : []);
    persistGraph();
    syncSelection();
  },
  listEdgeTypes() {
    return listEdgeTypes().map((definition) => ({
      type: definition.type,
      label: definition.label,
      cascadesDelete: definition.cascadesDelete,
    }));
  },
  extractGraphContext(nodeId) {
    return extractGraphContext(graph, nodeId);
  },
  getEdgeCount() {
    return graph.edges.length;
  },
  getNodeScreenBox(id) {
    return graphCanvas.getNodeScreenBox(id);
  },
};
