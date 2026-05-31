import { registerEcsPlugin } from "./ecs-plugin-registry.js";
import {
  getEntityLinks,
  getMessages,
  getTaskBoardItems,
  getSummary,
  setDialogStatus,
  setMessages,
  setNodeUiBlocks,
  setNodeUiCanvasSummary,
  setNodeUiComposer,
  setNodeUiMessageLabels,
  setSummary,
} from "./ecs-entity-state.js";
import { emitEntityEvent, ensureEntityRuntimeComponent, getEntityRuntimeComponent } from "./ecs-world.js";

function getMountRuntime(entity, mountPath) {
  return ensureEntityRuntimeComponent(entity, mountPath, () => ({}));
}

function getRequiredRuntimeComponent(entity, pluginKey) {
  const runtimeComponent = getEntityRuntimeComponent(entity, pluginKey);
  if (runtimeComponent) {
    return runtimeComponent;
  }

  throw new Error(`缺少必需插件运行时：${pluginKey}`);
}

registerEcsPlugin({
  key: "summary-capability",
  meta: {
    label: "摘要能力",
    description: "为节点提供摘要字段。",
    category: "foundation",
    mountTargets: ["node"],
    selectable: false,
    defaultConfig: { defaultSummary: "" },
  },
  init({ entity, mount }) {
    if (typeof entity.data.summary !== "string") {
      entity.data.summary = mount.config?.defaultSummary || "";
    }
  },
});

registerEcsPlugin({
  key: "message-log-capability",
  meta: {
    label: "消息记录",
    description: "为节点提供消息日志。",
    category: "foundation",
    mountTargets: ["node"],
    selectable: false,
  },
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
  meta: {
    label: "连接能力",
    description: "允许节点维护对其他实体的连接。",
    category: "capability",
    mountTargets: ["node"],
    selectable: false,
    defaultConfig: { sourceField: "links" },
  },
  init({ entity, mount }) {
    const sourceField = mount.config?.sourceField || "links";
    if (!Array.isArray(entity.data[sourceField])) {
      entity.data[sourceField] = [];
    }
  },
});

registerEcsPlugin({
  key: "task-board-capability",
  meta: {
    label: "待办清单",
    description: "为节点提供任务项列表。",
    category: "capability",
    mountTargets: ["node"],
    selectable: false,
    conflicts: ["agent-behavior"],
    provides: ["task-node"],
  },
  init({ entity }) {
    if (!Array.isArray(entity.data.items)) {
      entity.data.items = [];
    }
  },
});

registerEcsPlugin({
  key: "message-queue-capability",
  meta: {
    label: "消息队列",
    description: "为节点提供运行时消息队列。",
    category: "runtime",
    mountTargets: ["node"],
    selectable: false,
    requires: ["agent-node"],
  },
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
  key: "note-behavior",
  meta: {
    label: "记录行为",
    description: "让节点以记录模式接收和展示文本。",
    category: "behavior",
    mountTargets: ["node"],
    conflicts: ["agent-behavior", "task-board-behavior"],
    requires: ["summary-capability", "message-log-capability"],
    provides: ["record-node"],
    dialog: { submit: true },
  },
  init({ entity }) {
    setNodeUiBlocks(entity, ["messageThread"]);
    setNodeUiComposer(entity, "输入一条记录、问题或说明", "发送");
    setNodeUiMessageLabels(entity, {
      user: "输入",
      agent: "记录",
      agentWithNameTemplate: "{agent} Agent",
    });
    setNodeUiCanvasSummary(entity, getSummary(entity));
  },
  step({ entity }) {
    setDialogStatus(entity, "输入一条记录、问题或说明后发送到当前节点。");
    setNodeUiCanvasSummary(entity, getSummary(entity));
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
  meta: {
    label: "待办行为",
    description: "让节点以待办清单模式工作。",
    category: "behavior",
    mountTargets: ["node"],
    conflicts: ["agent-behavior", "note-behavior"],
    requires: ["summary-capability", "message-log-capability", "task-board-capability"],
    provides: ["task-node"],
    dialog: { submit: true },
  },
  init({ entity }) {
    setNodeUiBlocks(entity, ["taskBoardItems", "messageThread"]);
    setNodeUiComposer(entity, "输入一条任务内容", "记入");
    setNodeUiMessageLabels(entity, {
      user: "新增任务",
      agent: "任务板记录",
      agentWithNameTemplate: "{agent} Agent",
    });
    setNodeUiCanvasSummary(entity, getSummary(entity));
  },
  step({ entity }) {
    const openCount = getTaskBoardItems(entity).filter((item) => item.status !== "done").length;
    const preview = getTaskBoardItems(entity)
      .slice(0, 2)
      .map((item) => `${item.status === "done" ? "[x]" : "[ ]"}${item.text}`)
      .join(" ");
    setNodeUiCanvasSummary(entity, preview ? `${getSummary(entity)} ${preview}`.trim() : getSummary(entity));
    setDialogStatus(entity, `输入一条任务后加入任务板。当前待办 ${openCount} 项。`);
  },
  onEvent({ entity, event }) {
    if (event.type !== "dialog.submit" && event.type !== "task.add") {
      return;
    }

    const text = String(
      event.type === "task.add" ? event.payload?.text || "" : event.payload?.input || ""
    ).trim();
    if (!text) {
      if (event.type === "dialog.submit") {
        setDialogStatus(entity, "先输入一条任务内容。");
        event.meta.result = {
          ok: false,
          isError: true,
          statusMessage: "先输入一条任务内容。",
        };
      }
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
      ...(event.type === "dialog.submit" ? [{ role: "user", agent: "", content: text }] : []),
      { role: "agent", agent: "task_board", content: `已加入任务板：${text}` },
    ]);
    setDialogStatus(entity, "任务已加入任务板。");
    if (event.type === "dialog.submit") {
      event.meta.result = {
        ok: true,
        statusMessage: "任务已加入任务板。",
      };
    }
  },
});

registerEcsPlugin({
  key: "agent-behavior",
  meta: {
    label: "Agent 行为",
    description: "让节点具备调用模型并产出响应的能力。",
    category: "behavior",
    mountTargets: ["node"],
    conflicts: ["task-board-behavior", "note-behavior"],
    requires: [
      "summary-capability",
      "message-log-capability",
      "entity-links-capability",
      "message-queue-capability",
    ],
    provides: ["agent-node"],
    defaultConfig: { agentKeyField: "agentKey" },
    dialog: { submit: true },
  },
  init({ entity }) {
    if (typeof entity.data.agentKey !== "string" || !entity.data.agentKey) {
      entity.data.agentKey = "assistant";
    }
    if (!Array.isArray(entity.data.links)) {
      entity.data.links = [];
    }
    setNodeUiBlocks(entity, ["entityLinks", "messageThread"]);
    setNodeUiComposer(entity, "输入这次希望 agent 处理的任务", "运行");
    setNodeUiMessageLabels(entity, {
      user: "任务输入",
      agent: "Agent 输出",
      agentWithNameTemplate: "{agent} Agent",
    });
    setNodeUiCanvasSummary(entity, getSummary(entity));
  },
  async onEvent({ world, entity, event, runtimeComponent }) {
    if (event.type !== "dialog.submit") {
      return;
    }

    const queueComponent = getRequiredRuntimeComponent(entity, "message-queue-capability");
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

      getEntityLinks(entity)
        .filter((item) => item?.type === "agent/task_board" && Number.isFinite(Number(item?.entityId)))
        .forEach((item) => {
          emitEntityEvent(world, Number(item.entityId), {
            type: "task.add",
            payload: {
              text: result.summary || result.message || prompt,
              sourceEntityId: entity.id,
            },
            meta: {},
          });
        });
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
    const queueComponent = getRequiredRuntimeComponent(entity, "message-queue-capability");
    const queued = Array.isArray(queueComponent.queue) ? queueComponent.queue.length : 0;
    const suffix = queued > 0 ? ` 当前队列 ${queued} 条。` : "";
    setNodeUiCanvasSummary(entity, getSummary(entity));
    runtimeComponent.statusMessage = `输入新的任务或问题后，调用 ${
      entity.data?.agentKey || "assistant"
    } agent 响应这个节点。${suffix}`;
    setDialogStatus(entity, runtimeComponent.statusMessage);
  },
});

registerEcsPlugin({
  key: "agent-analysis-skill",
  meta: {
    label: "分析技能",
    description: "为 Agent 输入增加结构化分析前缀，适合规划、审查和拆解任务。",
    category: "skill",
    mountTargets: ["agent-behavior"],
    defaultConfig: {
      prefix: "请先进行目标拆解、约束检查、风险识别，再给出执行建议：",
    },
    configFields: [
      {
        key: "prefix",
        label: "分析前缀",
        type: "textarea",
        placeholder: "输入要自动加在用户输入前面的分析提示词",
        description: "每次提交前都会先注入这段前缀。",
      },
    ],
  },
  init({ entity, mountPath, mount }) {
    const runtimeComponent = getMountRuntime(entity, mountPath);
    runtimeComponent.prefix = mount.config?.prefix || "";
  },
  onEvent({ entity, event, runtimeComponent }) {
    if (event.type !== "dialog.submit") {
      return;
    }

    const text = String(event.payload?.input || "").trim();
    const prefix = runtimeComponent.prefix || "";
    if (!text || !prefix) {
      return;
    }

    event.payload.input = `${prefix}\n${text}`;
    setDialogStatus(entity, "已通过分析技能增强本轮输入。");
  },
  step({ mount, runtimeComponent }) {
    runtimeComponent.prefix = mount.config?.prefix || "";
  },
});
