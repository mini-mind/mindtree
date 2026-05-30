import { registerEcsPlugin } from "./ecs-plugin-registry.js";
import { registerEcsUiComponent } from "./ecs-ui-registry.js";
import {
  emitEntityEvent,
  ensureEntityRuntimeComponent,
  getEntityById,
} from "./ecs-world.js";

function getMessages(entity) {
  return Array.isArray(entity?.data?.messages) ? entity.data.messages : [];
}

function setMessages(entity, messages) {
  entity.data.messages = Array.isArray(messages) ? messages : [];
}

function getSummary(entity, fallback = "") {
  return typeof entity?.data?.summary === "string" ? entity.data.summary : fallback;
}

function setSummary(entity, summary) {
  entity.data.summary = typeof summary === "string" ? summary : "";
}

function getTaskBoardItems(entity) {
  return Array.isArray(entity?.data?.items) ? entity.data.items : [];
}

function getEntityLinks(entity) {
  return Array.isArray(entity?.data?.links) ? entity.data.links : [];
}

function setDialogStatus(entity, statusMessage) {
  const dialogRuntime = ensureEntityRuntimeComponent(entity, "dialog-ui", () => ({
    statusMessage: "",
  }));
  dialogRuntime.statusMessage = statusMessage;
}

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

registerEcsPlugin({
  key: "summary-capability",
  init({ entity, mount }) {
    if (typeof entity.data.summary !== "string") {
      entity.data.summary = mount.config?.defaultSummary || "";
    }
  },
});

registerEcsPlugin({
  key: "message-log-capability",
  init({ entity }) {
    if (!Array.isArray(entity.data.messages)) {
      entity.data.messages = [];
    }
  },
  onEvent({ entity, event }) {
    if (event.type !== "message.append") {
      return;
    }

    setMessages(entity, [...getMessages(entity), event.payload]);
  },
});

registerEcsPlugin({
  key: "entity-links-capability",
  init({ entity, mount }) {
    const sourceField = mount.config?.sourceField || "links";
    if (!Array.isArray(entity.data[sourceField])) {
      entity.data[sourceField] = [];
    }
  },
});

registerEcsPlugin({
  key: "task-board-capability",
  init({ entity }) {
    if (!Array.isArray(entity.data.items)) {
      entity.data.items = [];
    }
  },
});

registerEcsPlugin({
  key: "message-queue-capability",
  createRuntimeComponent() {
    return {
      queue: [],
    };
  },
  onEvent({ event, runtimeComponent }) {
    if (event.type !== "message.enqueue") {
      return;
    }

    runtimeComponent.queue.push({
      at: Date.now(),
      payload: event.payload && typeof event.payload === "object" ? { ...event.payload } : {},
    });
  },
});

registerEcsPlugin({
  key: "dialog-ui",
  createRuntimeComponent() {
    return {
      statusMessage: "",
    };
  },
  init({ mount, runtimeComponent }) {
    if (!runtimeComponent.statusMessage) {
      runtimeComponent.statusMessage = mount.config?.initialStatus || "";
    }
  },
});

registerEcsPlugin({
  key: "note-behavior",
  init({ entity }) {
    setDialogStatus(entity, "输入一条记录、问题或说明后发送到当前节点。");
  },
  onEvent({ entity, event }) {
    if (event.type !== "dialog.submit") {
      return;
    }

    const text = String(event.payload?.input || "").trim();
    if (!text) {
      setDialogStatus(entity, "先输入一条记录、问题或说明。");
      event.meta.result = {
        ok: false,
        isError: true,
        statusMessage: "先输入一条记录、问题或说明。",
      };
      return;
    }

    setMessages(entity, [...getMessages(entity), { role: "user", agent: "", content: text }]);
    if (!getSummary(entity)) {
      setSummary(entity, text.slice(0, 48));
    }
    setDialogStatus(entity, "记录已加入当前节点。");
    event.meta.result = {
      ok: true,
      statusMessage: "记录已加入当前节点。",
    };
  },
});

registerEcsPlugin({
  key: "task-board-behavior",
  init({ entity }) {
    const openCount = getTaskBoardItems(entity).filter((item) => item.status !== "done").length;
    setDialogStatus(entity, `输入一条任务后加入任务板。当前待办 ${openCount} 项。`);
  },
  onEvent({ entity, event }) {
    if (event.type !== "dialog.submit") {
      return;
    }

    const text = String(event.payload?.input || "").trim();
    if (!text) {
      setDialogStatus(entity, "先输入一条任务内容。");
      event.meta.result = {
        ok: false,
        isError: true,
        statusMessage: "先输入一条任务内容。",
      };
      return;
    }

    entity.data.items = [
      ...getTaskBoardItems(entity),
      {
        id: Date.now(),
        text,
        status: "todo",
      },
    ];
    setMessages(entity, [
      ...getMessages(entity),
      { role: "user", agent: "", content: text },
      { role: "agent", agent: "task_board", content: `已加入任务板：${text}` },
    ]);
    setDialogStatus(entity, "任务已加入任务板。");
    event.meta.result = {
      ok: true,
      statusMessage: "任务已加入任务板。",
    };
  },
});

registerEcsPlugin({
  key: "agent-behavior",
  init({ entity }) {
    const queueComponent = ensureEntityRuntimeComponent(entity, "message-queue-capability", () => ({
      queue: [],
    }));
    const queued = Array.isArray(queueComponent.queue) ? queueComponent.queue.length : 0;
    const suffix = queued > 0 ? ` 当前队列 ${queued} 条。` : "";
    setDialogStatus(entity, `输入新的任务或问题后，调用 ${entity.data?.agentKey || "assistant"} agent 响应这个节点。${suffix}`);
  },
  async onEvent({ world, entity, event, runtimeComponent }) {
    if (event.type !== "dialog.submit") {
      return;
    }

    const queueComponent = ensureEntityRuntimeComponent(entity, "message-queue-capability", () => ({
      queue: [],
    }));
    const queued = Array.isArray(queueComponent.queue) ? [...queueComponent.queue] : [];
    queueComponent.queue = [];

    const directInput = String(event.payload?.input || "").trim();
    const queuedText = queued
      .map((item, index) => {
        const source = item?.payload?.source || `source-${index + 1}`;
        const content = String(item?.payload?.content || "").trim();
        return content ? `[${source}] ${content}` : "";
      })
      .filter(Boolean)
      .join("\n");
    const prompt = [queuedText, directInput].filter(Boolean).join("\n");

    if (!prompt) {
      setDialogStatus(entity, "先输入这次希望 agent 处理的任务。");
      event.meta.result = {
        ok: false,
        isError: true,
        statusMessage: "先输入这次希望 agent 处理的任务。",
      };
      return;
    }

    const config = world.services.getConfig();
    if (!config.apiKey || !config.baseUrl || !config.model) {
      if (queued.length) {
        queueComponent.queue = queued;
      }
      setDialogStatus(entity, "先填写 LLM 配置。");
      event.meta.result = {
        ok: false,
        isError: true,
        requiresConfig: true,
        statusMessage: "先填写 LLM 配置。",
      };
      return;
    }

    const previousMessages = [...getMessages(entity)];
    setMessages(entity, [...previousMessages, { role: "user", agent: "", content: prompt }]);

    try {
      const result = await world.services.requestAgentRun(entity, prompt);
      setMessages(entity, [
        ...getMessages(entity),
        {
          role: "agent",
          agent: entity.data?.agentKey || "assistant",
          content: result.message || "",
        },
      ]);
      if (result.summary) {
        setSummary(entity, String(result.summary).trim());
      }
      setDialogStatus(entity, "Agent 已完成本轮响应。");
      event.meta.result = {
        ok: true,
        statusMessage: "Agent 已完成本轮响应。",
      };
    } catch (error) {
      setMessages(entity, previousMessages);
      queueComponent.queue = [...queued, ...queueComponent.queue];
      setDialogStatus(entity, error.message || "Agent 请求失败");
      event.meta.result = {
        ok: false,
        isError: true,
        statusMessage: error.message || "Agent 请求失败",
      };
    }
  },
  step({ entity, runtimeComponent }) {
    const queueComponent = ensureEntityRuntimeComponent(entity, "message-queue-capability", () => ({
      queue: [],
    }));
    const queued = Array.isArray(queueComponent.queue) ? queueComponent.queue.length : 0;
    const suffix = queued > 0 ? ` 当前队列 ${queued} 条。` : "";
    runtimeComponent.statusMessage = `输入新的任务或问题后，调用 ${
      entity.data?.agentKey || "assistant"
    } agent 响应这个节点。${suffix}`;
    setDialogStatus(entity, runtimeComponent.statusMessage);
  },
});

export function getEntityDialogTitle(entity) {
  return getSummary(entity) || "未命名节点";
}

export function getEntityCanvasSummary(entity) {
  if (Array.isArray(entity?.data?.items)) {
    const preview = entity.data.items
      .slice(0, 2)
      .map((item) => `${item.status === "done" ? "[x]" : "[ ]"}${item.text}`)
      .join(" ");
    return preview ? `${getSummary(entity)} ${preview}` : getSummary(entity);
  }

  return getSummary(entity);
}

export function getEntityMessageLabel(entity, message) {
  if (Array.isArray(entity?.data?.items)) {
    return message.role === "user" ? "新增任务" : "任务板记录";
  }

  if (entity?.type === "agent") {
    if (message.role === "user") {
      return "任务输入";
    }
    return message.agent ? `${message.agent} Agent` : "Agent 输出";
  }

  if (message.role === "user") {
    return "输入";
  }

  return message.agent ? `${message.agent} Agent` : "记录";
}

export function getEntityDialogConfig(entity) {
  const mount = Array.isArray(entity?.plugins)
    ? entity.plugins.find((plugin) => plugin.key === "dialog-ui")
    : null;
  return mount?.config || { body: ["messageThread"], composer: { placeholder: "", actionLabel: "发送" } };
}

export async function dispatchDialogSubmit(world, entity, input) {
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
  return event.meta.result || {
    ok: true,
    statusMessage: "",
  };
}

export function buildEntityContext(graph, entity) {
  const linkedEntities = getEntityLinks(entity)
    .map((item) => {
      const target = getEntityById({ graph }, item.entityId);
      return target
        ? {
            entityId: item.entityId,
            type: item.type || "link",
            label: item.label || "",
            entity: {
              id: target.id,
              type: target.type,
              data: {
                ...target.data,
                summary: getSummary(target),
                messages: getMessages(target),
              },
            },
            data: {
              label: item.label || "",
              config: item.config && typeof item.config === "object" ? { ...item.config } : {},
            },
          }
        : null;
    })
    .filter(Boolean);

  return {
    version: 4,
    focusEntity: {
      id: entity.id,
      type: entity.type,
      data: {
        ...entity.data,
        summary: getSummary(entity),
        messages: getMessages(entity),
      },
    },
    linkedEntities,
  };
}
