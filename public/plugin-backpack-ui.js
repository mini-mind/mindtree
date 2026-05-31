import { getEcsPlugin } from "./ecs-plugin-registry.js";
import {
  listSelectablePluginsForEntries,
  pruneUnusedImplicitPlugins,
  resolvePluginAttachmentForEntries,
} from "./ecs-plugin-selection.js";
import {
  attachMountsToEntity,
  countEntityPluginMounts,
  getEntityPluginMountByPath,
  listEntityPluginEntries,
  removeMountFromEntity,
  ROOT_PLUGIN_TARGET,
  updateMountConfigInEntity,
} from "./ecs-plugin-tree.js";

function buildPluginRequirementText(plugin) {
  if (!plugin.meta.requires.length) {
    return "无依赖";
  }
  return `依赖: ${plugin.meta.requires.join(" / ")}`;
}

function buildPluginConflictText(plugin) {
  if (!plugin.meta.conflicts.length) {
    return "无互斥";
  }
  return `互斥: ${plugin.meta.conflicts.join(" / ")}`;
}

export function createPluginBackpackController({
  elements,
  getSelectedNode,
  onNodeMutated,
  setStatus,
}) {
  const state = {
    selectedAttachTargetPath: ROOT_PLUGIN_TARGET,
    selectedPluginKey: null,
    selectedInstalledPath: ROOT_PLUGIN_TARGET,
  };

  function resetState() {
    state.selectedAttachTargetPath = ROOT_PLUGIN_TARGET;
    state.selectedPluginKey = null;
    state.selectedInstalledPath = ROOT_PLUGIN_TARGET;
  }

  function getSelectedPluginMount(node) {
    if (state.selectedInstalledPath === ROOT_PLUGIN_TARGET) {
      return null;
    }
    return getEntityPluginMountByPath(node, state.selectedInstalledPath);
  }

  function createPluginGroup(title, subtitle, targetPath, targetKey) {
    const section = document.createElement("section");
    section.className = "plugin-group";

    const heading = document.createElement("h3");
    heading.className = "plugin-group-title";
    heading.textContent = title;
    section.appendChild(heading);

    if (subtitle) {
      const text = document.createElement("p");
      text.className = "plugin-group-subtitle";
      text.textContent = subtitle;
      section.appendChild(text);
    }

    const container = document.createElement("div");
    container.className = "option-list";
    section.appendChild(container);

    elements.pluginBackpackList.appendChild(section);
    return { container, targetPath, targetKey };
  }

  function renderPluginOption(group, plugin, selectionState) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `option-card${selectionState.selected ? " is-active" : ""}`;
    button.disabled = selectionState.installed || Boolean(selectionState.validationError);
    button.innerHTML = `
      <span class="option-card-title">${plugin.meta.label}</span>
      <span class="option-card-desc">${plugin.meta.description || ""}</span>
      <span class="option-card-meta">
        <span class="option-pill">${plugin.meta.category}</span>
        <span class="option-pill">${buildPluginRequirementText(plugin)}</span>
        <span class="option-pill">${buildPluginConflictText(plugin)}</span>
      </span>
      <span class="option-card-actions">
        <span class="option-card-state">${
          selectionState.installed ? "已安装" : selectionState.validationError || "可安装"
        }</span>
      </span>
    `;
    button.addEventListener("click", () => {
      state.selectedPluginKey = selectionState.selected ? null : plugin.key;
      state.selectedAttachTargetPath = group.targetPath;
      state.selectedInstalledPath = group.targetPath;
      render();
    });
    group.container.appendChild(button);
  }

  function renderPluginTreeNode(entries, entry = null, depth = 0) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `plugin-tree-item${
      state.selectedInstalledPath === (entry?.path || ROOT_PLUGIN_TARGET) ? " is-active" : ""
    }`;
    button.style.setProperty("--plugin-depth", String(depth));

    const title = entry ? getEcsPlugin(entry.mount.key)?.meta.label || entry.mount.key : "节点本体";
    const description = entry
      ? getEcsPlugin(entry.mount.key)?.meta.description || entry.mount.key
      : "根节点。直接挂载基础能力或行为插件。";
    button.innerHTML = `
      <span class="plugin-tree-item-title">${title}</span>
      <span class="plugin-tree-item-desc">${description}</span>
    `;
    button.addEventListener("click", () => {
      state.selectedInstalledPath = entry?.path || ROOT_PLUGIN_TARGET;
      state.selectedAttachTargetPath = entry?.path || ROOT_PLUGIN_TARGET;
      state.selectedPluginKey = null;
      render();
    });
    elements.pluginInstalledTree.appendChild(button);

    const parentPath = entry?.path || ROOT_PLUGIN_TARGET;
    entries
      .filter((candidate) => candidate.parentPath === parentPath)
      .forEach((childEntry) => {
        renderPluginTreeNode(entries, childEntry, depth + 1);
      });
  }

  function renderPluginConfigPanel(node) {
    const selectedMount = getSelectedPluginMount(node);
    const selectedPlugin = selectedMount ? getEcsPlugin(selectedMount.key) : null;
    const configFields = selectedPlugin?.meta.configFields || [];

    elements.pluginConfigPanel.innerHTML = "";
    if (!selectedMount || !selectedPlugin || !configFields.length) {
      elements.pluginConfigPanel.hidden = true;
      return;
    }

    const header = document.createElement("div");
    header.className = "plugin-config-head";
    header.innerHTML = `
      <p class="section-title">插件配置</p>
      <p class="config-hint">${selectedPlugin.meta.label}</p>
    `;
    elements.pluginConfigPanel.appendChild(header);

    const form = document.createElement("div");
    form.className = "plugin-config-fields";

    configFields.forEach((field) => {
      const wrapper = document.createElement("label");
      wrapper.className = "field";

      const label = document.createElement("span");
      label.textContent = field.label;
      wrapper.appendChild(label);

      const value =
        typeof selectedMount.config?.[field.key] === "string" ? selectedMount.config[field.key] : "";
      const input = field.type === "textarea"
        ? document.createElement("textarea")
        : document.createElement("input");
      if (field.type === "textarea") {
        input.rows = 4;
      } else {
        input.type = "text";
      }
      input.value = value;
      input.placeholder = field.placeholder || "";
      input.dataset.configKey = field.key;
      wrapper.appendChild(input);

      if (field.description) {
        const hint = document.createElement("p");
        hint.className = "config-hint";
        hint.textContent = field.description;
        wrapper.appendChild(hint);
      }

      form.appendChild(wrapper);
    });

    const actions = document.createElement("div");
    actions.className = "actions actions-end";
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "primary-button";
    saveButton.textContent = "保存插件配置";
    saveButton.addEventListener("click", async () => {
      const nextConfig = {};
      form.querySelectorAll("[data-config-key]").forEach((input) => {
        nextConfig[input.dataset.configKey] = input.value;
      });
      if (!updateMountConfigInEntity(node, state.selectedInstalledPath, nextConfig)) {
        setStatus("插件配置保存失败。", true);
        return;
      }
      await onNodeMutated(node);
      render();
      setStatus(`已保存插件配置：${selectedPlugin.meta.label}`);
    });
    actions.appendChild(saveButton);

    elements.pluginConfigPanel.appendChild(form);
    elements.pluginConfigPanel.appendChild(actions);
    elements.pluginConfigPanel.hidden = false;
  }

  function renderPluginAttachBrowser(node, installedEntries) {
    const selectedPath = state.selectedAttachTargetPath || ROOT_PLUGIN_TARGET;
    const selectedMount = selectedPath === ROOT_PLUGIN_TARGET
      ? null
      : getEntityPluginMountByPath(node, selectedPath);
    const targetKey = selectedMount?.key || ROOT_PLUGIN_TARGET;
    const targetPlugin = selectedMount ? getEcsPlugin(selectedMount.key) : null;

    elements.pluginBackpackTarget.innerHTML = `
      <p class="section-title">安装目标</p>
      <p class="config-hint">${
        selectedMount
          ? `当前选中 ${targetPlugin?.meta.label || selectedMount.key}，可向其继续挂载兼容插件。`
          : "当前选中节点本体，可直接挂载基础能力或行为插件。"
      }</p>
    `;

    elements.pluginBackpackList.innerHTML = "";
    const group = createPluginGroup(
      selectedMount ? (targetPlugin?.meta.label || selectedMount.key) : "节点本体",
      selectedMount
        ? `挂载到 ${targetPlugin?.meta.label || selectedMount.key} 的插件。`
        : "这些插件直接挂载到节点上。",
      selectedPath,
      targetKey
    );

    listSelectablePluginsForEntries(targetKey, installedEntries).forEach((plugin) => {
      let validationError = "";
      try {
        resolvePluginAttachmentForEntries([plugin.key], { installedEntries, targetKey });
      } catch (error) {
        validationError = error.message || "不可挂载";
      }

      renderPluginOption(group, plugin, {
        installed: installedEntries.some((entry) => entry.mount.key === plugin.key),
        validationError,
        selected: state.selectedAttachTargetPath === selectedPath && state.selectedPluginKey === plugin.key,
      });
    });
  }

  function render() {
    const node = getSelectedNode();
    if (!node) {
      return;
    }

    const installedEntries = listEntityPluginEntries(node);
    elements.pluginBackpackList.innerHTML = "";
    elements.pluginInstalledTree.innerHTML = "";
    elements.pluginBackpackDescription.textContent = installedEntries.length
      ? `当前节点共挂载 ${countEntityPluginMounts(node)} 个插件。可继续向节点或已安装插件添加兼容插件。`
      : "当前节点尚未挂载插件。先向节点本体添加一个插件。";

    const selectedMountExists =
      state.selectedInstalledPath === ROOT_PLUGIN_TARGET ||
      Boolean(getEntityPluginMountByPath(node, state.selectedInstalledPath));
    if (!selectedMountExists) {
      resetState();
    }

    renderPluginTreeNode(installedEntries);
    renderPluginConfigPanel(node);
    renderPluginAttachBrowser(node, installedEntries);

    elements.attachSelectedPlugin.disabled = !(state.selectedPluginKey && state.selectedAttachTargetPath);
    elements.removeSelectedPlugin.disabled = state.selectedInstalledPath === ROOT_PLUGIN_TARGET;
  }

  async function open() {
    const node = getSelectedNode();
    if (!node) {
      return;
    }

    resetState();
    render();
    elements.pluginBackpackDialog.showModal();
  }

  async function attachSelectedPlugin() {
    const node = getSelectedNode();
    const targetPath = state.selectedAttachTargetPath;
    const targetMount = targetPath === ROOT_PLUGIN_TARGET
      ? null
      : getEntityPluginMountByPath(node, targetPath);
    const targetKey = targetMount?.key || ROOT_PLUGIN_TARGET;
    if (!node || !state.selectedPluginKey || !targetPath) {
      return;
    }

    try {
      const pluginKey = state.selectedPluginKey;
      const mounts = resolvePluginAttachmentForEntries([pluginKey], {
        installedEntries: listEntityPluginEntries(node),
        targetKey,
      });
      if (!attachMountsToEntity(node, targetPath, mounts)) {
        throw new Error("插件挂载目标不存在。");
      }
      await onNodeMutated(node);
      state.selectedInstalledPath = targetPath;
      state.selectedAttachTargetPath = targetPath;
      state.selectedPluginKey = null;
      render();
      setStatus(`已添加插件：${getEcsPlugin(pluginKey)?.meta.label || pluginKey}`);
    } catch (error) {
      setStatus(error.message || "插件添加失败。", true);
      render();
    }
  }

  async function removeSelectedPluginMount() {
    const node = getSelectedNode();
    if (!node || state.selectedInstalledPath === ROOT_PLUGIN_TARGET) {
      return;
    }

    const mount = getEntityPluginMountByPath(node, state.selectedInstalledPath);
    const pluginLabel = getEcsPlugin(mount?.key || "")?.meta.label || mount?.key || "插件";
    if (!removeMountFromEntity(node, state.selectedInstalledPath)) {
      setStatus("插件移除失败。", true);
      return;
    }

    pruneUnusedImplicitPlugins(node);
    resetState();
    await onNodeMutated(node);
    render();
    setStatus(`已移除插件：${pluginLabel}`);
  }

  return {
    open,
    render,
    attachSelectedPlugin,
    removeSelectedPluginMount,
  };
}
