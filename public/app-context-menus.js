export function clampToViewport(element, position, margin = 12) {
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

export function createContextMenuController({
  elements,
  getSelection,
  selectSingleNode,
  syncSelection,
  hasNode,
}) {
  let contextMenuNodeId = null;
  let canvasContextMenuPosition = null;

  function closeNode() {
    contextMenuNodeId = null;
    elements.nodeContextMenu.hidden = true;
  }

  function closeCanvas() {
    canvasContextMenuPosition = null;
    elements.canvasContextMenu.hidden = true;
  }

  return {
    openNode(nodeId, position) {
      if (!hasNode(nodeId)) {
        return false;
      }

      closeCanvas();
      contextMenuNodeId = nodeId;
      selectSingleNode(nodeId);
      syncSelection();
      elements.nodeContextMenu.hidden = false;
      clampToViewport(elements.nodeContextMenu, position);
      return true;
    },
    openCanvas(position) {
      closeNode();
      canvasContextMenuPosition = position;
      elements.contextDeleteSelectedNodes.hidden = getSelection().selectedIds.length < 2;
      elements.canvasContextMenu.hidden = false;
      clampToViewport(elements.canvasContextMenu, position);
    },
    closeNode,
    closeCanvas,
    closeAll() {
      closeNode();
      closeCanvas();
    },
    dismissFromTarget(target) {
      if (!elements.nodeContextMenu.hidden && !elements.nodeContextMenu.contains(target)) {
        closeNode();
      }

      if (!elements.canvasContextMenu.hidden && !elements.canvasContextMenu.contains(target)) {
        closeCanvas();
      }
    },
    getNodeId() {
      return contextMenuNodeId;
    },
    getCanvasPosition() {
      return canvasContextMenuPosition;
    },
  };
}
