import { getEcsUiComponent } from "./ecs-ui-registry.js";
import {
  dispatchDialogSubmit,
  getEmptyEntityStatusMessage,
  getEntityDialogConfig,
  getEntityPluginCount,
  getEntityDialogTitle,
  getEntityMessageLabel,
} from "./ecs-node-ui.js";
import { stepWorld } from "./ecs-world.js";

export function createNodeDialogController({
  elements,
  getSelectedNode,
  getWorld,
  setStatus,
  persistGraph,
  syncSelection,
  openConfig,
}) {
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
    elements.nodeDialogDirection.disabled = Boolean(config.composer?.disabled);
    elements.nodeDialogSubmit.textContent = config.composer?.actionLabel || "发送";
    elements.nodeDialogSubmit.disabled = Boolean(config.composer?.disabled);
  }

  function getDialogStatusMessage(node) {
    return getEntityDialogConfig(node).statusMessage || getEmptyEntityStatusMessage();
  }

  async function refreshNodeDialog(node, { resetInput = true } = {}) {
    await stepWorld(getWorld());
    elements.nodeDialogSummary.textContent = getEntityDialogTitle(node);
    if (resetInput) {
      elements.nodeDialogDirection.value = "";
    }
    renderEntityDialogBody(node);
    setNodeDialogStatus(getDialogStatusMessage(node));
  }

  return {
    async open() {
      const node = getSelectedNode();
      if (!node) {
        return;
      }

      await refreshNodeDialog(node);
      elements.nodeDialog.showModal();
    },
    async refresh(node, options) {
      if (!node) {
        return;
      }

      await refreshNodeDialog(node, options);
    },
    async submit() {
      const node = getSelectedNode();
      if (!node) {
        return;
      }

      elements.nodeDialogSubmit.disabled = true;
      try {
        const result = await dispatchDialogSubmit(getWorld(), node, elements.nodeDialogDirection.value);
        if (result.requiresConfig) {
          openConfig();
        }
        await refreshNodeDialog(node);
        persistGraph();
        syncSelection();
        setNodeDialogStatus(result.statusMessage || "", Boolean(result.isError));
        if (result.statusMessage) {
          setStatus(result.statusMessage, Boolean(result.isError));
        }
      } catch (error) {
        const message = error?.message || "节点提交失败";
        setNodeDialogStatus(message, true);
        setStatus(message, true);
      } finally {
        elements.nodeDialogSubmit.disabled = Boolean(
          getEntityDialogConfig(node).composer?.disabled
        );
      }
    },
  };
}
