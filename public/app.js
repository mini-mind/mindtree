import {
  loadStoredConfig,
} from "./config-store.js";
import { createBootstrapLlmConfigFallback } from "./bootstrap-config.js";
import { DEFAULT_LLM_BOOTSTRAP } from "./llm-provider-defaults.js";
import { createGraphCanvas, GRAPH_CANVAS_THEME } from "./graph-canvas.js";
import { bindAppEvents, bindDialogBackdropClose } from "./app-bindings.js";
import {
  fetchServerDefaultConfig,
  restoreGraphFromStorage,
} from "./app-bootstrap.js";
import { buildInitialConfig, createLlmConfigController } from "./llm-config-ui.js";
import { createContextMenuController } from "./app-context-menus.js";
import { createCreateNodeController } from "./app-create-node.js";
import { createAppRuntime } from "./app-runtime.js";
import { createSelectionController } from "./app-selection.js";
import { createTestApi } from "./app-test-api.js";
import "./ecs-plugins.js";
import { getEntityCanvasSummary } from "./ecs-node-ui.js";
import "./ecs-node-ui.js";
import { createNodeDialogController } from "./node-dialog-controller.js";
import { createPluginBackpackController } from "./plugin-backpack-ui.js";
import { emitEntityEvent, stepWorld } from "./ecs-world.js";

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
  openPluginBackpack: document.getElementById("open-plugin-backpack"),
  createNodeDialog: document.getElementById("create-node-dialog"),
  confirmCreateNode: document.getElementById("confirm-create-node"),
  pluginBackpackDialog: document.getElementById("plugin-backpack-dialog"),
  pluginBackpackList: document.getElementById("plugin-backpack-list"),
  pluginBackpackDescription: document.getElementById("plugin-backpack-description"),
  pluginInstalledTree: document.getElementById("plugin-installed-tree"),
  pluginBackpackTarget: document.getElementById("plugin-backpack-target"),
  pluginConfigPanel: document.getElementById("plugin-config-panel"),
  closePluginBackpackAction: document.getElementById("close-plugin-backpack-action"),
  removeSelectedPlugin: document.getElementById("remove-selected-plugin"),
  attachSelectedPlugin: document.getElementById("attach-selected-plugin"),
};

elements.cfgBaseUrl.placeholder = DEFAULT_LLM_BOOTSTRAP.baseUrl;
elements.cfgModel.placeholder = DEFAULT_LLM_BOOTSTRAP.model;

const defaultConfig = createBootstrapLlmConfigFallback();
const restoredGraph = restoreGraphFromStorage({
  onCorruptedGraph: (error) => {
    setStatus(`已重置损坏图数据：${error.message}`, true);
  },
});
const runtime = createAppRuntime({
  initialGraph: restoredGraph,
  initialDefaultConfig: defaultConfig,
  initialConfig: buildInitialConfig(
    AGENT_DEFINITIONS,
    defaultConfig,
    loadStoredConfig(),
    {}
  ),
});
const selection = createSelectionController(
  runtime.getGraph().nodes[0]?.id == null ? [] : [runtime.getGraph().nodes[0].id]
);

function getGraph() {
  return runtime.getGraph();
}

function getSelectedNode() {
  return runtime.getNodeById(selection.get().selectedId);
}

function getCurrentModelCapabilities() {
  return runtime.getModelCapabilities();
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

function syncSelection() {
  const { selectedId, selectedIds } = selection.get();
  graphCanvas.render(getGraph(), selectedId, selectedIds);
}

function appendNode(offsetX = 0, offsetY = 0) {
  const node = runtime.appendNode(offsetX, offsetY);
  selection.selectSingle(node.id);
  syncSelection();
}

function openConfig() {
  llmConfigUi.hydrateForm();
  elements.configDialog.showModal();
}

function saveConfigFromForm() {
  llmConfigUi.updateConfig(llmConfigUi.collectForm());
  runtime.saveConfig();
  llmConfigUi.hydrateForm();
  elements.configDialog.close();
  setStatus("LLM 配置已保存到本地。");
}

async function initializeServerDefaults() {
  const serverDefaults = await fetchServerDefaultConfig();
  if (!serverDefaults) {
    runtime.setModelCapabilities({});
    return;
  }

  const nextModelCapabilities = serverDefaults.modelCapabilities || {};
  const nextDefaultConfig = { ...serverDefaults };
  delete nextDefaultConfig.modelCapabilities;

  runtime.setModelCapabilities(nextModelCapabilities);
  runtime.setDefaultConfig(nextDefaultConfig);
  runtime.setConfig(
    buildInitialConfig(
      AGENT_DEFINITIONS,
      runtime.getDefaultConfig(),
      loadStoredConfig(),
      nextModelCapabilities
    )
  );
  llmConfigUi.hydrateForm();
}

async function refreshNodeAfterMutation(node) {
  await runtime.refreshNodeAfterMutation(node, (currentNode) => nodeDialogController.refresh(currentNode));
  syncSelection();
}

function deleteSelectedNode(targetId) {
  const result = runtime.deleteNode(targetId);
  if (!result.deleted) {
    return;
  }

  selection.set(getGraph().nodes[0] ? [getGraph().nodes[0].id] : []);
  contextMenus.closeNode();
  setStatus("节点已删除。");
  syncSelection();
}

function deleteSelectedNodes(targetIds) {
  const result = runtime.deleteNodes(targetIds);

  if (!result.deletedCount) {
    return;
  }

  selection.clear();
  contextMenus.closeAll();
  setStatus(result.deletedCount === 1 ? "节点已删除。" : `已删除 ${result.deletedCount} 个节点。`);
  syncSelection();
}

const pluginBackpack = createPluginBackpackController({
  elements,
  getSelectedNode: () => getSelectedNode(),
  onNodeMutated: refreshNodeAfterMutation,
  setStatus,
});

const graphCanvas = createGraphCanvas(canvas, {
  getNodeSummary: (node) => getEntityCanvasSummary(node),
  onNodeSelect: (id) => {
    contextMenus.closeAll();
    selection.selectSingle(id);
    syncSelection();
  },
  onNodesSelect: (ids) => {
    contextMenus.closeAll();
    selection.set(ids);
    syncSelection();
  },
  onNodeOpen: (id) => {
    contextMenus.closeAll();
    selection.selectSingle(id);
    syncSelection();
    nodeDialogController.open();
  },
  onBackgroundSelect: () => {
    contextMenus.closeAll();
    selection.clear();
    syncSelection();
  },
  onNodeMove: (id, deltaX, deltaY) => {
    if (!runtime.moveNode(id, deltaX, deltaY)) {
      return;
    }
    syncSelection();
  },
  onNodeContextMenu: (id, position) => {
    const { selectedIds } = selection.get();
    if (selectedIds.length > 1 && selectedIds.includes(id)) {
      contextMenus.openCanvas(position);
      return;
    }
    contextMenus.openNode(id, position);
  },
  onBackgroundContextMenu: (position) => {
    contextMenus.openCanvas(position);
  },
});

const llmConfigUi = createLlmConfigController({
  agentDefinitions: AGENT_DEFINITIONS,
  elements,
  getDefaultConfig: () => runtime.getDefaultConfig(),
  getConfig: () => runtime.getConfig(),
  setConfig: (nextConfig) => {
    runtime.setConfig(nextConfig);
  },
  getKnownModels: () => Object.keys(getCurrentModelCapabilities()),
  getModelCapabilitiesMap: () => getCurrentModelCapabilities(),
});

const contextMenus = createContextMenuController({
  elements,
  getSelection: () => selection.get(),
  selectSingleNode: (id) => selection.selectSingle(id),
  syncSelection,
  hasNode: (id) => Boolean(runtime.getNodeById(id)),
});

const nodeDialogController = createNodeDialogController({
  elements,
  getSelectedNode: () => getSelectedNode(),
  getWorld: () => runtime.getWorld(),
  setStatus,
  persistGraph: () => runtime.persistGraph(),
  syncSelection,
  openConfig: () => {
    llmConfigUi.setActiveTab("base");
    openConfig();
  },
});

const createNodeController = createCreateNodeController({
  dialog: elements.createNodeDialog,
  onCreate: (intent) => {
    appendNode(intent.offset.x, intent.offset.y);
    setStatus("已新增节点。");
  },
});

bindAppEvents({
  elements,
  llmConfigUi,
  contextMenus,
  selection,
  graphCanvas,
  nodeDialogController,
  pluginBackpack,
  createNodeController,
  getNodeOffsetAtScreenPosition,
  openConfig,
  openHelp: () => elements.helpDialog.showModal(),
  deleteSelectedNode,
  deleteSelectedNodes,
});

elements.saveConfig.addEventListener("click", (event) => {
  event.preventDefault();
  saveConfigFromForm();
});

bindDialogBackdropClose(elements.helpDialog);
bindDialogBackdropClose(elements.configDialog);
bindDialogBackdropClose(elements.nodeDialog);
bindDialogBackdropClose(elements.createNodeDialog);
bindDialogBackdropClose(elements.pluginBackpackDialog);
llmConfigUi.renderAgentPanels();
selection.set(getGraph().nodes[0] ? [getGraph().nodes[0].id] : []);
syncSelection();
graphCanvas.resize();
initializeServerDefaults();

if (isTestMode) {
  window.__mindzooTestApi = createTestApi({
    graphCanvas,
    enqueueNodeMessage: async (targetNodeId, payload) => {
      const delivered = emitEntityEvent(runtime.getWorld(), targetNodeId, {
        type: "message.enqueue",
        payload,
      });
      if (delivered) {
        await stepWorld(runtime.getWorld());
      }
      return { delivered };
    },
  });
}
