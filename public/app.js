import {
  getLocalFallbackConfig,
  loadStoredConfig,
  loadTree,
  saveConfig,
  saveTree,
} from "./config-store.js";
import {
  createEmptyNode,
  createInitialForest,
  createMessage,
  deleteNodeFromForest,
  findNodeInForest,
  getMaxId,
  normalizeForest,
} from "./tree-model.js";
import {
  buildInitialConfig,
  createLlmConfigController,
} from "./llm-config-ui.js";
import { createTreeCanvas, TREE_CANVAS_THEME } from "./tree-canvas.js";

const AGENT_DEFINITIONS = [
  { key: "generator", label: "推演 Agent" },
  { key: "oracle", label: "卜卦 Agent" },
];

const canvas = document.getElementById("tree-canvas");

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
  cfgCandidateMultiplier: document.getElementById("cfg-candidate-multiplier"),
  modelOptions: document.getElementById("model-options"),
  configTabTriggerBase: document.getElementById("config-tab-trigger-base"),
  configAgentTabs: document.getElementById("config-agent-tabs"),
  configAgentPanels: document.getElementById("config-agent-panels"),
  nodeContextMenu: document.getElementById("node-context-menu"),
  contextEditNode: document.getElementById("context-edit-node"),
  contextAddChildNode: document.getElementById("context-add-child-node"),
  contextDeleteNode: document.getElementById("context-delete-node"),
  canvasContextMenu: document.getElementById("canvas-context-menu"),
  contextAddRootNode: document.getElementById("context-add-root-node"),
  contextDeleteSelectedNodes: document.getElementById("context-delete-selected-nodes"),
  nodeDialog: document.getElementById("node-dialog"),
  nodeDialogSummary: document.getElementById("node-dialog-summary"),
  nodeDialogMessages: document.getElementById("node-dialog-messages"),
  nodeDialogDirection: document.getElementById("node-dialog-direction"),
  nodeDialogExpand: document.getElementById("node-dialog-expand"),
  nodeDialogStatus: document.getElementById("node-dialog-status"),
};

const serverConfig = getLocalFallbackConfig();
let modelCapabilities = {};
let knownModels = [];
let forest = normalizeForest(loadTree() || createInitialForest());
let llmConfig = buildInitialConfig(
  AGENT_DEFINITIONS,
  serverConfig,
  loadStoredConfig(),
  modelCapabilities
);
let nodeId = Math.max(2, getMaxId(forest) + 1);
const interactionState = {
  selectedIds: forest[0]?.id == null ? [] : [forest[0].id],
  contextMenuNodeId: null,
  canvasContextMenuPosition: null,
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

function persistForest() {
  saveTree(forest);
}

function replaceForest(nextForest) {
  forest = nextForest;
  persistForest();
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

function createNodeNearParent(parentNode, index = 0, total = 1) {
  const angleStart = -0.52;
  const angleEnd = 0.78;
  const angle =
    total === 1
      ? 0.12
      : angleStart + ((angleEnd - angleStart) * index) / Math.max(1, total - 1);
  const radius = 220 + ((index % 3) * 28);
  const jitterX = ((index % 2) * 18) - 9;
  const jitterY = ((index % 4) * 14) - 21;
  return createEmptyNode(
    nodeId++,
    (parentNode.offsetX || 0) + Math.cos(angle) * radius + jitterX,
    (parentNode.offsetY || 0) + Math.sin(angle) * radius + jitterY
  );
}

function getRootNodeOffsetAtScreenPosition(position) {
  const point = treeCanvas.projectScreenToWorld(position.x, position.y);
  return {
    x: point.x - TREE_CANVAS_THEME.nodeWidth / 2,
    y: point.y - TREE_CANVAS_THEME.nodeMinHeight / 2,
  };
}

const treeCanvas = createTreeCanvas(canvas, {
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
    const found = findNodeInForest(forest, id);
    if (!found) {
      return;
    }

    found.node.offsetX = (found.node.offsetX || 0) + deltaX;
    found.node.offsetY = (found.node.offsetY || 0) + deltaY;
    persistForest();
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

function getNodeLabel(node) {
  return node.summary || "未命名节点";
}

function renderNodeMessages(node) {
  elements.nodeDialogMessages.innerHTML = "";
  node.messages.forEach((message) => {
    const article = document.createElement("article");
    article.className = `message-card is-${message.role}`;

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent =
      message.role === "user"
        ? "推演方向"
        : message.agent === "oracle"
          ? "卜卦 Agent"
          : "推演 Agent";
    article.appendChild(meta);

    const body = document.createElement("p");
    body.className = "message-body";
    body.textContent = message.content;
    article.appendChild(body);

    elements.nodeDialogMessages.appendChild(article);
  });
}

function syncSelection() {
  const { selectedId, selectedIds } = getSelection();
  treeCanvas.render(forest, selectedId, selectedIds);
}

function openNodeDialog() {
  const { selectedId } = getSelection();
  const found = findNodeInForest(forest, selectedId);
  if (!found) {
    return;
  }

  elements.nodeDialogSummary.textContent = getNodeLabel(found.node);
  elements.nodeDialogDirection.value = "";
  renderNodeMessages(found.node);
  setNodeDialogStatus("输入新的方向后，继续推演这个节点。");
  elements.nodeDialog.showModal();
}

function resetNodeDialog(foundNode) {
  elements.nodeDialogSummary.textContent = getNodeLabel(foundNode);
  elements.nodeDialogDirection.value = "";
  renderNodeMessages(foundNode);
}

function appendRootNode(offsetX = 0, offsetY = 0) {
  const node = createEmptyNode(nodeId++, offsetX, offsetY);
  forest.push(node);
  selectSingleNode(node.id);
  persistForest();
  syncSelection();
}

function appendChildNode(parentId) {
  const found = findNodeInForest(forest, parentId);
  if (!found) {
    return;
  }

  const node = createNodeNearParent(found.node);
  found.node.children.push(node);
  selectSingleNode(node.id);
  persistForest();
  syncSelection();
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

async function requestExpansion(found, directionText, branchCount) {
  const response = await fetch("/api/expand", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chain: found.path.map(({ id, summary, messages }) => ({
        id,
        summary,
        detail: messages
          .map((message) => `${message.role === "user" ? "方向" : "反馈"}：${message.content}`)
          .join("\n"),
      })),
      branchCount,
      direction: directionText,
      config: llmConfig,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    if (Array.isArray(data.knownModels) && data.knownModels.length) {
      knownModels = data.knownModels;
      llmConfigUi.renderModelSelect();
    }
    throw new Error(data.error || "请求失败");
  }

  return data.branches || [];
}

async function expandFromNodeDialog() {
  const { selectedId } = getSelection();
  const found = findNodeInForest(forest, selectedId);
  if (!found) {
    return;
  }

  if (!llmConfig.apiKey || !llmConfig.baseUrl || !llmConfig.model) {
    setNodeDialogStatus("先填写 LLM 配置。", true);
    llmConfigUi.setActiveTab("base");
    openConfig();
    return;
  }

  const directionText = elements.nodeDialogDirection.value.trim();
  if (!directionText) {
    setNodeDialogStatus("先输入这次想继续推演的方向。", true);
    return;
  }

  elements.nodeDialogExpand.disabled = true;
  setNodeDialogStatus("模型推演中...");

  try {
    found.node.messages.push(createMessage("user", directionText));
    const branches = await requestExpansion(found, directionText, 3);

    if (!branches.length) {
      throw new Error("模型没有返回可用分支");
    }

    branches.forEach((branch, index) => {
      const childNode = createNodeNearParent(found.node, index, branches.length);
      childNode.messages = [
        createMessage("user", directionText),
        createMessage("agent", branch.detail || "", "generator"),
      ];
      childNode.summary = branch.summary || "";
      found.node.children.push(childNode);
    });

    found.node.messages.push(
      createMessage(
        "agent",
        `已生成 ${branches.length} 个候选分支：${branches
          .map((branch) => branch.summary || "未命名")
          .join(" / ")}`,
        "oracle"
      )
    );

    resetNodeDialog(found.node);
    persistForest();
    syncSelection();
    setNodeDialogStatus(`已生成 ${branches.length} 个新的推演分支。`);
    setStatus(`已生成 ${branches.length} 个新的推演分支。`);
  } catch (error) {
    found.node.messages = found.node.messages.filter(
      (message, index) =>
        !(index === found.node.messages.length - 1 && message.role === "user" && message.content === directionText)
    );
    renderNodeMessages(found.node);
    setNodeDialogStatus(error.message || "模型请求失败", true);
  } finally {
    elements.nodeDialogExpand.disabled = false;
  }
}

function bindDialogBackdropClose(dialog) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
}

function deleteSelectedNode(targetId) {
  const result = deleteNodeFromForest(forest, targetId);
  if (!result.deleted) {
    return;
  }

  setSelection(result.nodes[0] ? [result.nodes[0].id] : []);
  replaceForest(result.nodes);
  closeNodeContextMenu();
  setStatus("节点已删除。");
}

function deleteSelectedNodes(targetIds) {
  const ids = [...new Set(targetIds)].sort((left, right) => {
    const leftDepth = findNodeInForest(forest, left)?.path.length || 0;
    const rightDepth = findNodeInForest(forest, right)?.path.length || 0;
    return rightDepth - leftDepth;
  });
  let nextForest = forest;
  let deletedCount = 0;

  ids.forEach((id) => {
    const result = deleteNodeFromForest(nextForest, id);
    if (result.deleted) {
      nextForest = result.nodes;
      deletedCount += 1;
    }
  });

  if (!deletedCount) {
    return;
  }

  clearSelection();
  replaceForest(nextForest);
  closeAllContextMenus();
  setStatus(deletedCount === 1 ? "节点已删除。" : `已删除 ${deletedCount} 个节点。`);
}

function openNodeContextMenu(nodeId, position) {
  const found = findNodeInForest(forest, nodeId);
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

elements.contextAddChildNode.addEventListener("click", () => {
  const nodeId = getContextMenuNodeId();
  if (nodeId === null) {
    return;
  }
  appendChildNode(nodeId);
  closeNodeContextMenu();
  setStatus("已衍生空节点。");
});

elements.contextDeleteNode.addEventListener("click", () => {
  const nodeId = getContextMenuNodeId();
  if (nodeId === null) {
    return;
  }
  deleteSelectedNode(nodeId);
});

elements.contextAddRootNode.addEventListener("click", () => {
  const position = getCanvasContextPosition();
  const offset = getRootNodeOffsetAtScreenPosition(position);
  closeCanvasContextMenu();
  appendRootNode(offset.x, offset.y);
  setStatus("已新增空节点。");
});

elements.contextDeleteSelectedNodes.addEventListener("click", () => {
  deleteSelectedNodes(getSelection().selectedIds);
});

elements.saveConfig.addEventListener("click", (event) => {
  event.preventDefault();
  saveConfigFromDialog();
});

elements.nodeDialogExpand.addEventListener("click", () => {
  expandFromNodeDialog();
});

window.addEventListener("resize", () => {
  closeAllContextMenus();
  treeCanvas.resize();
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
llmConfigUi.renderAgentPanels();
syncSelection();
treeCanvas.resize();
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
  getTree() {
    return JSON.parse(JSON.stringify(forest));
  },
  getNodeScreenBox(id) {
    return treeCanvas.getNodeScreenBox(id);
  },
};
