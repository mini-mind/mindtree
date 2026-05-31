export function bindDialogBackdropClose(dialog) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
}

export function bindAppEvents({
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
  openHelp,
  deleteSelectedNode,
  deleteSelectedNodes,
}) {
  elements.cfgModelSelect.addEventListener("change", () => {
    const isCustom = elements.cfgModelSelect.value === "__custom__";
    elements.cfgModelCustomField.style.display = isCustom ? "flex" : "none";
    llmConfigUi.renderModelOptions(
      isCustom ? elements.cfgModel.value.trim() || llmConfigUi.getDefaultModel() : elements.cfgModelSelect.value
    );
  });

  elements.cfgModel.addEventListener("input", () => {
    if (elements.cfgModelSelect.value === "__custom__") {
      llmConfigUi.renderModelOptions(elements.cfgModel.value.trim() || llmConfigUi.getDefaultModel());
    }
  });

  elements.configTabTriggerBase.addEventListener("click", () => {
    llmConfigUi.setActiveTab("base");
  });

  elements.floatingConfig.addEventListener("click", () => {
    openConfig();
  });

  elements.floatingHelp.addEventListener("click", () => {
    openHelp();
  });

  elements.contextEditNode.addEventListener("click", () => {
    const nodeId = contextMenus.getNodeId();
    if (nodeId === null) {
      return;
    }

    selection.selectSingle(nodeId);
    contextMenus.closeNode();
    nodeDialogController.open();
  });

  elements.contextDeleteNode.addEventListener("click", () => {
    const nodeId = contextMenus.getNodeId();
    if (nodeId === null) {
      return;
    }

    deleteSelectedNode(nodeId);
  });

  elements.contextAddNode.addEventListener("click", () => {
    const offset = getNodeOffsetAtScreenPosition(contextMenus.getCanvasPosition() || { x: 0, y: 0 });
    contextMenus.closeCanvas();
    createNodeController.open({ offset });
  });

  elements.contextDeleteSelectedNodes.addEventListener("click", () => {
    deleteSelectedNodes(selection.get().selectedIds);
  });

  elements.nodeDialogSubmit.addEventListener("click", () => {
    nodeDialogController.submit();
  });

  elements.openPluginBackpack.addEventListener("click", () => {
    pluginBackpack.open();
  });

  elements.confirmCreateNode.addEventListener("click", () => {
    createNodeController.confirm();
  });

  elements.createNodeDialog.addEventListener("close", () => {
    createNodeController.clear();
  });

  elements.attachSelectedPlugin.addEventListener("click", () => {
    pluginBackpack.attachSelectedPlugin();
  });

  elements.removeSelectedPlugin.addEventListener("click", () => {
    pluginBackpack.removeSelectedPluginMount();
  });

  elements.closePluginBackpackAction.addEventListener("click", () => {
    elements.pluginBackpackDialog.close();
  });

  window.addEventListener("resize", () => {
    contextMenus.closeAll();
    graphCanvas.resize();
  });

  window.addEventListener("pointerdown", (event) => {
    contextMenus.dismissFromTarget(event.target);
  });
}
