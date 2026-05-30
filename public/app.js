import {
  clearStoredGraph,
  getLocalFallbackConfig,
  loadGraph,
  loadStoredConfig,
  saveConfig,
  saveGraph,
} from "./config-store.js";
import {
  addGraphNode,
  createInitialGraphDocument,
  createNode,
  deleteNodeFromGraph,
  getMaxGraphId,
  getNodeById,
  normalizeGraph,
} from "./graph-model.js";
import { GraphValidationError } from "./graph-validation.js";
import { createGraphCanvas, GRAPH_CANVAS_THEME } from "./graph-canvas.js";
import { buildInitialConfig, createLlmConfigController } from "./llm-config-ui.js";
import { BASE_NODE_BLUEPRINTS } from "./ecs-defaults.js";
import { getEcsUiComponent } from "./ecs-ui-registry.js";
import {
  buildEntityContext,
  dispatchDialogSubmit,
  getEntityDialogConfig,
  getEntityDialogTitle,
  getEntityMessageLabel,
} from "./ecs-plugins.js";
import "./ecs-plugins.js";
import {
  createWorld,
  emitEntityEvent,
  initializeEntity,
  stepWorld,
} from "./ecs-world.js";

const AGENT_DEFINITIONS = [{ key: "assistant", label: "Assistant" }];
const isTestMode = new URLSearchParams(window.location.search).has("test");

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
};

const serverConfig = getLocalFallbackConfig();
let modelCapabilities = {};
let graph = createInitialGraphDocument();
let llmConfig = buildInitialConfig(
  AGENT_DEFINITIONS,
  serverConfig,
  loadStoredConfig(),
  modelCapabilities
);
let nodeId = Math.max(2, getMaxGraphId(graph) + 1);
let world = null;
const interactionState = {
  selectedIds: graph.nodes[0]?.id == null ? [] : [graph.nodes[0].id],
  contextMenuNodeId: null,
  canvasContextMenuPosition: null,
  createNodeIntent: null,
  selectedCreateNodeType: "note",
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

function rebuildWorld() {
  world = createWorld(graph, {
    requestAgentRun: (node, promptText) => requestAgentRun(node, promptText),
    getConfig: () => llmConfig,
    step: () => stepWorld(world),
  });
}

function persistGraph() {
  saveGraph(graph);
}

function replaceGraph(nextGraph) {
  graph = nextGraph;
  rebuildWorld();
  persistGraph();
  syncSelection();
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

function buildCreateNodeDescription(blueprint) {
  if (!blueprint) {
    return "选择节点类型后创建。";
  }

  return `将在当前画布位置创建一个“${blueprint.creationLabel || blueprint.label}”。`;
}

function renderCreateNodeDialogOptions() {
  elements.createNodeTypeList.innerHTML = "";

  BASE_NODE_BLUEPRINTS.forEach((blueprint) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `option-card${
      interactionState.selectedCreateNodeType === blueprint.key ? " is-active" : ""
    }`;
    button.dataset.nodeType = blueprint.key;
    button.innerHTML = `
      <span class="option-card-title">${blueprint.creationLabel || blueprint.label}</span>
      <span class="option-card-desc">${blueprint.description || ""}</span>
    `;
    button.addEventListener("click", () => {
      interactionState.selectedCreateNodeType = blueprint.key;
      renderCreateNodeDialogOptions();
    });
    elements.createNodeTypeList.appendChild(button);
  });

  const selectedBlueprint = BASE_NODE_BLUEPRINTS.find(
    (item) => item.key === interactionState.selectedCreateNodeType
  );
  elements.createNodeDescription.textContent = buildCreateNodeDescription(selectedBlueprint);
}

function getNodeOffsetAtScreenPosition(position) {
  const point = graphCanvas.projectScreenToWorld(position.x, position.y);
  return {
    x: point.x - GRAPH_CANVAS_THEME.nodeWidth / 2,
    y: point.y - GRAPH_CANVAS_THEME.nodeMinHeight / 2,
  };
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function setNodeDialogStatus(message, isError = false) {
  elements.nodeDialogStatus.textContent = message;
  elements.nodeDialogStatus.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function renderEntityDialogBody(node) {
  elements.nodeDialogMessages.innerHTML = "";
  elements.nodeDialogPanel.innerHTML = "";
  const config = getEntityDialogConfig(node);
  const body = Array.isArray(config.body) ? config.body : [];

  body.forEach((component) => {
    const renderer = getEcsUiComponent(component);
    if (!renderer) {
      return;
    }

    renderer({
      entity: node,
      elements,
      panel: elements.nodeDialogPanel,
      helpers: {
        getMessageLabel: getEntityMessageLabel,
      },
    });
  });

  elements.nodeDialogPanel.hidden = elements.nodeDialogPanel.innerHTML.trim() === "";
  elements.nodeDialogDirection.placeholder = config.composer?.placeholder || "输入内容";
  elements.nodeDialogSubmit.textContent = config.composer?.actionLabel || "发送";
}

function syncSelection() {
  const { selectedId, selectedIds } = getSelection();
  graphCanvas.render(graph, selectedId, selectedIds);
}

async function openNodeDialog() {
  const { selectedId } = getSelection();
  const node = getNodeById(graph, selectedId);
  if (!node) {
    return;
  }

  await initializeEntity(world, node);
  await stepWorld(world);
  elements.nodeDialogSummary.textContent = getEntityDialogTitle(node);
  elements.nodeDialogDirection.value = "";
  renderEntityDialogBody(node);
  const dialogRuntime = node.runtime.components["dialog-ui"] || {};
  setNodeDialogStatus(dialogRuntime.statusMessage || "");
  elements.nodeDialog.showModal();
}

async function resetNodeDialog(node) {
  await stepWorld(world);
  elements.nodeDialogSummary.textContent = getEntityDialogTitle(node);
  elements.nodeDialogDirection.value = "";
  renderEntityDialogBody(node);
  const dialogRuntime = node.runtime.components["dialog-ui"] || {};
  setNodeDialogStatus(dialogRuntime.statusMessage || "");
}

function appendNode(offsetX = 0, offsetY = 0, type = "note") {
  const node = createNode(nodeId++, offsetX, offsetY, type);
  addGraphNode(graph, node);
  rebuildWorld();
  selectSingleNode(node.id);
  persistGraph();
  syncSelection();
}

function openCreateNodeDialog(intent) {
  interactionState.createNodeIntent = intent;
  interactionState.selectedCreateNodeType = "note";
  renderCreateNodeDialogOptions();
  elements.createNodeDialog.showModal();
}

function confirmCreateNodeFromDialog() {
  const intent = interactionState.createNodeIntent;
  if (!intent) {
    return;
  }

  appendNode(intent.offset.x, intent.offset.y, interactionState.selectedCreateNodeType);
  elements.createNodeDialog.close();
  setStatus("已新增节点。");
}

async function loadServerDefaults() {
  try {
    const response = await fetch("/api/default-config");
    if (!response.ok) {
      return;
    }

    const serverDefaults = await response.json();
    modelCapabilities = serverDefaults.modelCapabilities || {};
    delete serverDefaults.modelCapabilities;
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

async function requestAgentRun(node, promptText) {
  const context = buildEntityContext(graph, node);
  const response = await fetch("/api/agent-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentKey: node.data?.agentKey || "assistant",
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

async function submitNodeDialog() {
  const { selectedId } = getSelection();
  const node = getNodeById(graph, selectedId);
  if (!node) {
    return;
  }

  elements.nodeDialogSubmit.disabled = true;
  const result = await dispatchDialogSubmit(world, node, elements.nodeDialogDirection.value);
  if (result.requiresConfig) {
    llmConfigUi.setActiveTab("base");
    openConfig();
  }
  await resetNodeDialog(node);
  persistGraph();
  syncSelection();
  setNodeDialogStatus(result.statusMessage || "", Boolean(result.isError));
  if (result.statusMessage) {
    setStatus(result.statusMessage, Boolean(result.isError));
  }
  elements.nodeDialogSubmit.disabled = false;
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
  if (!getNodeById(graph, nodeId)) {
    return;
  }

  closeCanvasContextMenu();
  interactionState.contextMenuNodeId = nodeId;
  selectSingleNode(nodeId);
  syncSelection();
  elements.nodeContextMenu.hidden = false;
  clampToViewport(elements.nodeContextMenu, position);
}

function closeNodeContextMenu() {
  interactionState.contextMenuNodeId = null;
  elements.nodeContextMenu.hidden = true;
}

function openCanvasContextMenu(position) {
  closeNodeContextMenu();
  const { selectedIds } = getSelection();
  interactionState.canvasContextMenuPosition = position;
  elements.contextDeleteSelectedNodes.hidden = selectedIds.length < 2;
  elements.canvasContextMenu.hidden = false;
  clampToViewport(elements.canvasContextMenu, position);
}

function closeCanvasContextMenu() {
  interactionState.canvasContextMenuPosition = null;
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

elements.floatingConfig.addEventListener("click", () => {
  llmConfigUi.hydrateForm();
  elements.configDialog.showModal();
});
elements.floatingHelp.addEventListener("click", () => {
  elements.helpDialog.showModal();
});

elements.contextEditNode.addEventListener("click", () => {
  const nodeId = interactionState.contextMenuNodeId;
  if (nodeId === null) {
    return;
  }
  selectSingleNode(nodeId);
  closeNodeContextMenu();
  openNodeDialog();
});

elements.contextDeleteNode.addEventListener("click", () => {
  const nodeId = interactionState.contextMenuNodeId;
  if (nodeId === null) {
    return;
  }
  deleteSelectedNode(nodeId);
});

elements.contextAddNode.addEventListener("click", () => {
  const offset = getNodeOffsetAtScreenPosition(interactionState.canvasContextMenuPosition || { x: 0, y: 0 });
  closeCanvasContextMenu();
  openCreateNodeDialog({ offset });
});

elements.contextDeleteSelectedNodes.addEventListener("click", () => {
  deleteSelectedNodes(getSelection().selectedIds);
});

elements.saveConfig.addEventListener("click", (event) => {
  event.preventDefault();
  llmConfigUi.updateConfig(llmConfigUi.collectForm());
  saveConfig(llmConfig);
  llmConfigUi.hydrateForm();
  elements.configDialog.close();
  setStatus("LLM 配置已保存到本地。");
});

elements.nodeDialogSubmit.addEventListener("click", () => {
  submitNodeDialog();
});

elements.confirmCreateNode.addEventListener("click", () => {
  confirmCreateNodeFromDialog();
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
    const node = getNodeById(graph, id);
    if (!node) {
      return;
    }
    node.x = (node.x || 0) + deltaX;
    node.y = (node.y || 0) + deltaY;
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
});

const llmConfigUi = createLlmConfigController({
  agentDefinitions: AGENT_DEFINITIONS,
  elements,
  serverConfig,
  getConfig: () => llmConfig,
  setConfig: (nextConfig) => {
    llmConfig = nextConfig;
  },
  getKnownModels: () => Object.keys(modelCapabilities),
  getModelCapabilitiesMap: () => modelCapabilities,
});

bindDialogBackdropClose(elements.helpDialog);
bindDialogBackdropClose(elements.configDialog);
bindDialogBackdropClose(elements.nodeDialog);
bindDialogBackdropClose(elements.createNodeDialog);
llmConfigUi.renderAgentPanels();
graph = restoreGraphFromStorage();
rebuildWorld();
nodeId = Math.max(2, getMaxGraphId(graph) + 1);
setSelection(graph.nodes[0] ? [graph.nodes[0].id] : []);
syncSelection();
graphCanvas.resize();
loadServerDefaults();

if (isTestMode) {
  window.__mindzooTestApi = {
    getNodeScreenBox(id) {
      return graphCanvas.getNodeScreenBox(id);
    },
    async emitNodeEvent(targetNodeId, event) {
      const delivered = emitEntityEvent(world, targetNodeId, event);
      if (delivered) {
        await stepWorld(world);
      }
      return { delivered };
    },
  };
}
