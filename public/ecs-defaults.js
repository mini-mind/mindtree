export const BASE_NODE_BLUEPRINTS = [
  {
    key: "note",
    label: "通用节点",
    creationLabel: "通用节点",
    description: "用于承载摘要、消息记录和一般图上下文。",
    plugins: [
      { key: "summary-capability", config: { defaultSummary: "" } },
      { key: "message-log-capability", config: {} },
      {
        key: "dialog-ui",
        config: {
          title: "Node Record",
          body: ["messageThread"],
          composer: {
            placeholder: "输入一条记录、问题或说明",
            actionLabel: "发送",
          },
        },
      },
      { key: "note-behavior", config: {} },
    ],
  },
  {
    key: "agent",
    label: "Agent",
    creationLabel: "Agent 节点",
    description: "用于挂载一个可复用 agent，并基于上下文执行单轮响应。",
    plugins: [
      { key: "summary-capability", config: { defaultSummary: "新 Agent" } },
      { key: "message-log-capability", config: {} },
      { key: "entity-links-capability", config: { sourceField: "links" } },
      { key: "message-queue-capability", config: {} },
      {
        key: "dialog-ui",
        config: {
          title: "Node Record",
          body: ["entityLinks", "messageThread"],
          composer: {
            placeholder: "输入这次希望 agent 处理的任务",
            actionLabel: "运行",
          },
        },
      },
      { key: "agent-behavior", config: { agentKeyField: "agentKey" } },
    ],
  },
  {
    key: "task_board",
    label: "Task Board",
    creationLabel: "任务板节点",
    description: "用于维护共享任务项清单。",
    plugins: [
      { key: "summary-capability", config: { defaultSummary: "共享任务板" } },
      { key: "message-log-capability", config: {} },
      { key: "task-board-capability", config: {} },
      {
        key: "dialog-ui",
        config: {
          title: "Node Record",
          body: ["taskBoardItems", "messageThread"],
          composer: {
            placeholder: "输入一条任务内容",
            actionLabel: "记入",
          },
        },
      },
      { key: "task-board-behavior", config: {} },
    ],
  },
];
