import {
  getLocalFallbackConfig,
  loadStoredConfig,
  loadTree,
  saveConfig,
  saveTree,
} from "./config-store.js";
import {
  getModelCapabilities,
  getModelOptionDefaults,
  normalizeOptionValue,
} from "./model-options.js";
import { createInitialTree, findNode, getMaxId } from "./tree-model.js";
import { createTreeCanvas } from "./tree-canvas.js";

const canvas = document.getElementById("tree-canvas");

const elements = {
  selectedTitle: document.getElementById("selected-title"),
  chainSummaryText: document.getElementById("chain-summary-text"),
  nodeTitle: document.getElementById("node-title"),
  nodeDetail: document.getElementById("node-detail"),
  branchCount: document.getElementById("branch-count"),
  status: document.getElementById("status"),
  composer: document.getElementById("composer"),
  saveNode: document.getElementById("save-node"),
  addChild: document.getElementById("add-child"),
  expandNode: document.getElementById("expand-node"),
  floatingConfig: document.getElementById("floating-config"),
  configDialog: document.getElementById("config-dialog"),
  saveConfig: document.getElementById("save-config"),
  cfgBaseUrl: document.getElementById("cfg-base-url"),
  cfgApiKey: document.getElementById("cfg-api-key"),
  cfgModelSelect: document.getElementById("cfg-model-select"),
  cfgModelCustomField: document.getElementById("cfg-model-custom-field"),
  cfgModel: document.getElementById("cfg-model"),
  cfgOracleBaseUrl: document.getElementById("cfg-oracle-base-url"),
  cfgOracleApiKey: document.getElementById("cfg-oracle-api-key"),
  cfgOracleModel: document.getElementById("cfg-oracle-model"),
  cfgCandidateMultiplier: document.getElementById("cfg-candidate-multiplier"),
  modelOptions: document.getElementById("model-options"),
  nodeDialog: document.getElementById("node-dialog"),
  nodeDialogTitle: document.getElementById("node-dialog-title"),
  nodeDialogInputTitle: document.getElementById("node-dialog-input-title"),
  nodeDialogInputDetail: document.getElementById("node-dialog-input-detail"),
  nodeDialogSave: document.getElementById("node-dialog-save"),
};

const serverConfig = getLocalFallbackConfig();
let modelCapabilities = {};
let knownModels = [];
let dynamicOptionInputs = {};
let tree = loadTree() || createInitialTree();
let llmConfig = buildInitialConfig(serverConfig, loadStoredConfig(), modelCapabilities);
let nodeId = Math.max(3, getMaxId(tree) + 1);
let selectedId = tree.id;

const treeCanvas = createTreeCanvas(canvas, {
  onNodeSelect: (id) => {
    selectedId = id;
    syncSelection();
  },
  onNodeOpen: (id) => {
    selectedId = id;
    syncSelection();
    openNodeDialog();
  },
  onBackgroundSelect: () => {
    selectedId = null;
    syncSelection();
  },
  onNodeMove: (id, deltaX, deltaY) => {
    const found = findNode(tree, id);
    if (!found) {
      return;
    }

    found.node.offsetX = (found.node.offsetX || 0) + deltaX;
    found.node.offsetY = (found.node.offsetY || 0) + deltaY;
    saveTree(tree);
    if (selectedId === id) {
      treeCanvas.render(tree, selectedId);
    }
  },
});

function buildInitialConfig(baseConfig, storedConfig, capabilities) {
  const resolvedModel = storedConfig.model || baseConfig.model;
  return {
    ...baseConfig,
    ...getModelOptionDefaults(capabilities, baseConfig.model),
    ...storedConfig,
    ...getModelOptionDefaults(capabilities, resolvedModel),
  };
}

function renderModelSelect() {
  const options = knownModels.length ? knownModels : [serverConfig.model];
  const currentModel = llmConfig.model || serverConfig.model;
  const isKnownModel = options.includes(currentModel);

  elements.cfgModelSelect.innerHTML = "";
  options.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    elements.cfgModelSelect.appendChild(option);
  });

  const customOption = document.createElement("option");
  customOption.value = "__custom__";
  customOption.textContent = "Custom...";
  elements.cfgModelSelect.appendChild(customOption);

  elements.cfgModelSelect.value = isKnownModel ? currentModel : "__custom__";
  elements.cfgModelCustomField.style.display = isKnownModel ? "none" : "flex";
}

function renderModelOptions(model) {
  const capability = getModelCapabilities(modelCapabilities, model);
  dynamicOptionInputs = {};
  elements.modelOptions.innerHTML = "";

  capability.options.forEach((option) => {
    const wrapper = document.createElement("label");
    wrapper.className = "field";

    const label = document.createElement("span");
    label.textContent = option.label;
    wrapper.appendChild(label);

    let input;
    if (option.type === "boolean" || option.type === "select") {
      input = document.createElement("select");
      const choices =
        option.type === "boolean"
          ? [
              { value: "true", label: "true" },
              { value: "false", label: "false" },
            ]
          : option.choices.map((choice) => ({ value: choice, label: choice }));
      choices.forEach((choice) => {
        const item = document.createElement("option");
        item.value = choice.value;
        item.textContent = choice.label;
        input.appendChild(item);
      });
      input.value = String(
        normalizeOptionValue(option, llmConfig[option.key] ?? option.defaultValue)
      );
    } else {
      input = document.createElement("input");
      input.type = option.type;
      if (option.min !== undefined) {
        input.min = String(option.min);
      }
      if (option.step !== undefined) {
        input.step = String(option.step);
      }
      input.value = String(
        normalizeOptionValue(option, llmConfig[option.key] ?? option.defaultValue)
      );
    }

    wrapper.appendChild(input);
    elements.modelOptions.appendChild(wrapper);
    dynamicOptionInputs[option.key] = { input, option };
  });
}

function hydrateConfigForm() {
  elements.cfgBaseUrl.value = llmConfig.baseUrl || "";
  elements.cfgApiKey.value = llmConfig.apiKey || "";
  elements.cfgModel.value = llmConfig.model || "";
  renderModelSelect();
  elements.cfgOracleBaseUrl.value = llmConfig.oracleBaseUrl || "";
  elements.cfgOracleApiKey.value = llmConfig.oracleApiKey || "";
  elements.cfgOracleModel.value = llmConfig.oracleModel || "";
  elements.cfgCandidateMultiplier.value = llmConfig.candidateMultiplier || 3;
  renderModelOptions(llmConfig.model || serverConfig.model);
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function syncSelection() {
  if (selectedId === null) {
    elements.selectedTitle.textContent = "未选中";
    elements.chainSummaryText.textContent = "点击任意节点开始编辑";
    elements.nodeTitle.value = "";
    elements.nodeDetail.value = "";
    elements.composer.classList.add("is-hidden");
    treeCanvas.render(tree, null);
    return;
  }

  const found = findNode(tree, selectedId);
  if (!found) {
    selectedId = null;
    return syncSelection();
  }

  elements.selectedTitle.textContent = found.node.title;
  elements.chainSummaryText.textContent = found.path.map((node) => node.title).join(" / ");
  elements.nodeTitle.value = found.node.title;
  elements.nodeDetail.value = found.node.detail || "";
  elements.composer.classList.remove("is-hidden");
  treeCanvas.render(tree, selectedId);
}

function openNodeDialog() {
  const found = findNode(tree, selectedId);
  if (!found) {
    return;
  }

  elements.nodeDialogTitle.textContent = found.node.title || "节点编辑";
  elements.nodeDialogInputTitle.value = found.node.title || "";
  elements.nodeDialogInputDetail.value = found.node.detail || "";
  elements.nodeDialog.showModal();
}

function addChildNode(parentId, title = "新分支", detail = "补充这个方向的进一步推理。") {
  const found = findNode(tree, parentId);
  if (!found) {
    return;
  }

  found.node.children.push({
    id: nodeId++,
    title,
    detail,
    offsetX: 0,
    offsetY: 0,
    children: [],
  });
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
    llmConfig = buildInitialConfig(serverConfig, loadStoredConfig(), modelCapabilities);
    hydrateConfigForm();
  } catch {
    modelCapabilities = {};
    knownModels = [];
  }
}

async function expandWithLlm() {
  const found = findNode(tree, selectedId);
  if (!found) {
    return;
  }

  if (!llmConfig.apiKey || !llmConfig.baseUrl || !llmConfig.model) {
    setStatus("先填写 LLM 配置。", true);
    elements.configDialog.showModal();
    return;
  }

  const branchCount = Number(elements.branchCount.value) || 3;
  setStatus("模型推演中...");
  elements.expandNode.disabled = true;

  try {
    const response = await fetch("/api/expand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chain: found.path.map(({ id, title, detail }) => ({ id, title, detail })),
        branchCount,
        config: llmConfig,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      if (Array.isArray(data.knownModels) && data.knownModels.length) {
        knownModels = data.knownModels;
        renderModelSelect();
      }
      throw new Error(data.error || "请求失败");
    }

    if (!data.branches?.length) {
      throw new Error("模型没有返回可用分支");
    }

    data.branches.forEach((branch) => addChildNode(found.node.id, branch.title, branch.detail));
    saveTree(tree);
    treeCanvas.render(tree, selectedId);
    setStatus(`已新增 ${data.branches.length} 个推演分支。`);
  } catch (error) {
    setStatus(error.message || "模型请求失败", true);
  } finally {
    elements.expandNode.disabled = false;
  }
}

function openConfig() {
  hydrateConfigForm();
  elements.configDialog.showModal();
}

elements.saveNode.addEventListener("click", () => {
  const found = findNode(tree, selectedId);
  if (!found) {
    return;
  }

  found.node.title = elements.nodeTitle.value.trim() || "未命名节点";
  found.node.detail = elements.nodeDetail.value.trim();
  saveTree(tree);
  syncSelection();
  setStatus("节点已保存。");
});

elements.addChild.addEventListener("click", () => {
  addChildNode(selectedId);
  saveTree(tree);
  treeCanvas.render(tree, selectedId);
  setStatus("已添加新的手动分支。");
});

elements.expandNode.addEventListener("click", () => {
  expandWithLlm();
});

elements.cfgModelSelect.addEventListener("change", () => {
  const isCustom = elements.cfgModelSelect.value === "__custom__";
  elements.cfgModelCustomField.style.display = isCustom ? "flex" : "none";
  renderModelOptions(
    isCustom ? elements.cfgModel.value.trim() || serverConfig.model : elements.cfgModelSelect.value
  );
});

elements.cfgModel.addEventListener("input", () => {
  if (elements.cfgModelSelect.value === "__custom__") {
    renderModelOptions(elements.cfgModel.value.trim() || serverConfig.model);
  }
});

elements.floatingConfig.addEventListener("click", openConfig);

elements.saveConfig.addEventListener("click", (event) => {
  event.preventDefault();
  llmConfig.baseUrl = elements.cfgBaseUrl.value.trim();
  llmConfig.apiKey = elements.cfgApiKey.value.trim();
  llmConfig.model =
    elements.cfgModelSelect.value === "__custom__"
      ? elements.cfgModel.value.trim()
      : elements.cfgModelSelect.value;
  llmConfig.oracleBaseUrl = elements.cfgOracleBaseUrl.value.trim();
  llmConfig.oracleApiKey = elements.cfgOracleApiKey.value.trim();
  llmConfig.oracleModel = elements.cfgOracleModel.value.trim();
  llmConfig.candidateMultiplier = Number(elements.cfgCandidateMultiplier.value) || 3;

  const capability = getModelCapabilities(modelCapabilities, llmConfig.model);
  Object.keys(dynamicOptionInputs).forEach((key) => {
    const { input, option } = dynamicOptionInputs[key];
    llmConfig[key] = normalizeOptionValue(option, input.value);
  });
  capability.options.forEach((option) => {
    if (!(option.key in llmConfig)) {
      llmConfig[option.key] = option.defaultValue;
    }
  });

  saveConfig(llmConfig);
  hydrateConfigForm();
  elements.configDialog.close();
  setStatus("LLM 配置已保存到本地。");
});

elements.nodeDialogSave.addEventListener("click", (event) => {
  event.preventDefault();
  const found = findNode(tree, selectedId);
  if (!found) {
    return;
  }

  found.node.title = elements.nodeDialogInputTitle.value.trim() || "未命名节点";
  found.node.detail = elements.nodeDialogInputDetail.value.trim();
  saveTree(tree);
  syncSelection();
  elements.nodeDialog.close();
  setStatus("节点已保存。");
});

window.addEventListener("resize", () => {
  treeCanvas.resize();
});

syncSelection();
treeCanvas.resize();
loadServerDefaults();
