import { getEcsPlugin } from "./ecs-plugin-registry.js";
import { registerEcsUiComponent } from "./ecs-ui-registry.js";
import {
  ensureNodeUi,
  getEntityLinks,
  getMessages,
  getNodeDisplay,
  getNodeUiCanvasSummary,
  getNodeUiMessageLabels,
  getSummary,
  getTaskBoardItems,
} from "./ecs-entity-state.js";
import { listEntityPluginEntries } from "./ecs-plugin-tree.js";
import { emitEntityEvent } from "./ecs-world.js";

registerEcsUiComponent("messageThread", ({ entity, elements, helpers }) => {
  const list = document.createElement("div");
  list.className = "message-thread";

  getMessages(entity).forEach((message) => {
    const article = document.createElement("article");
    article.className = `message-card is-${message.role}`;

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = helpers.getMessageLabel(entity, message);
    article.appendChild(meta);

    const body = document.createElement("p");
    body.className = "message-body";
    body.textContent = message.content;
    article.appendChild(body);

    list.appendChild(article);
  });

  elements.nodeDialogMessages.appendChild(list);
});

registerEcsUiComponent("entityLinks", ({ entity, panel }) => {
  const items = getEntityLinks(entity);
  if (!items.length) {
    return;
  }

  const section = document.createElement("section");
  section.className = "node-section";
  const title = document.createElement("div");
  title.className = "message-meta";
  title.textContent = `关联节点 ${items.length} 个`;
  section.appendChild(title);

  const list = document.createElement("div");
  list.className = "task-board-list";
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "task-board-item";
    row.innerHTML = `
      <span class="task-board-item-status">-></span>
      <span>${item.type || "link"}: #${item.entityId}${item.label ? ` (${item.label})` : ""}</span>
    `;
    list.appendChild(row);
  });
  section.appendChild(list);
  panel.appendChild(section);
});

registerEcsUiComponent("taskBoardItems", ({ entity, panel }) => {
  const items = getTaskBoardItems(entity);
  const section = document.createElement("section");
  section.className = "node-section";
  const title = document.createElement("div");
  title.className = "message-meta";
  title.textContent = `任务项 ${items.length} 条`;
  section.appendChild(title);

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

  section.appendChild(list);
  panel.appendChild(section);
});

export function getEntityDialogTitle(entity) {
  return getSummary(entity) || "未命名节点";
}

function hasDialogSubmitHandler(entity) {
  return listEntityPluginEntries(entity).some((entry) => {
    const plugin = getEcsPlugin(entry.mount.key);
    return plugin?.meta?.dialog?.submit === true;
  });
}

export function getEntityCanvasSummary(entity) {
  return getNodeUiCanvasSummary(entity) || getSummary(entity);
}

export function getEntityMessageLabel(entity, message) {
  const labels = getNodeUiMessageLabels(entity);
  if (message.role === "user") {
    return labels.user || "输入";
  }

  if (message.agent) {
    return (labels.agentWithNameTemplate || "{agent} Agent").replace("{agent}", message.agent);
  }

  return labels.agent || "记录";
}

export function getEntityDialogConfig(entity) {
  ensureNodeUi(entity);
  const display = getNodeDisplay(entity);
  if (!Array.isArray(entity?.mounts) || !entity.mounts.length) {
    return {
      body: [],
      composer: {
        placeholder: "先添加插件，再输入内容",
        actionLabel: "发送",
        disabled: true,
      },
      statusMessage: display.statusMessage,
    };
  }

  if (!hasDialogSubmitHandler(entity)) {
    return {
      body: Array.isArray(display.body) ? display.body : [],
      composer: {
        placeholder: "当前插件组合不接收输入",
        actionLabel: "发送",
        disabled: true,
      },
      statusMessage: display.statusMessage || "当前插件组合没有可处理输入的行为。",
    };
  }

  return {
    body: Array.isArray(display.body) ? display.body : ["messageThread"],
    composer: {
      placeholder: display.composer?.placeholder || "输入内容",
      actionLabel: display.composer?.actionLabel || "发送",
      disabled: false,
    },
    statusMessage: display.statusMessage || "",
  };
}

export function getEmptyEntityStatusMessage() {
  return "当前节点还没有可处理输入的能力。";
}

export function getEntityPluginCount(entity) {
  return listEntityPluginEntries(entity).length;
}

export async function dispatchDialogSubmit(world, entity, input) {
  if (!Array.isArray(entity?.mounts) || !entity.mounts.length) {
    return {
      ok: false,
      isError: true,
      statusMessage: getEmptyEntityStatusMessage(),
    };
  }

  if (!hasDialogSubmitHandler(entity)) {
    return {
      ok: false,
      isError: true,
      statusMessage: "当前插件组合没有可处理输入的行为。",
    };
  }

  const event = {
    type: "dialog.submit",
    payload: { input },
    meta: { result: null },
  };
  const handled = emitEntityEvent(world, entity.id, event);
  if (!handled) {
    return {
      ok: false,
      isError: true,
      statusMessage: "节点不存在。",
    };
  }

  await world.services.step();
  if (event.meta.result) {
    return event.meta.result;
  }

  return {
    ok: false,
    isError: true,
    statusMessage: "当前插件没有处理本次输入。",
  };
}
