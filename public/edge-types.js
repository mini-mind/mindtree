export const DEFAULT_EDGE_TYPE = "relates_to";

function createDefaultEdgeDefinition({
  type,
  label,
  creationLabel = label,
  description = "",
  cascadesDelete = false,
  rendersOnCanvas = true,
  strokeStyle = "rgba(70, 84, 98, 0.18)",
  pulseColor = "rgba(126, 136, 145, ALPHA)",
}) {
  return {
    type,
    label,
    creationLabel,
    description,
    createData() {
      return {};
    },
    normalizeData(_edge, data = {}) {
      return data && typeof data === "object" ? { ...data } : {};
    },
    cascadesDelete,
    rendersOnCanvas,
    getCanvasStyle() {
      return {
        strokeStyle,
        lineWidth: 2,
        pulseColor,
        pulseLineWidth: 2.2,
      };
    },
  };
}

const edgeTypeRegistry = {
  relates_to: createDefaultEdgeDefinition({
    type: "relates_to",
    label: "关联",
    creationLabel: "关联",
    description: "表示一个节点与另一个节点存在一般有向关联。",
    strokeStyle: "rgba(70, 84, 98, 0.28)",
    pulseColor: "rgba(166, 123, 53, ALPHA)",
  }),
  depends_on: createDefaultEdgeDefinition({
    type: "depends_on",
    label: "依赖",
    creationLabel: "依赖关系",
    description: "表示当前节点依赖另一个节点完成或成立。",
    strokeStyle: "rgba(59, 94, 143, 0.26)",
    pulseColor: "rgba(78, 122, 184, ALPHA)",
  }),
  feeds_context: createDefaultEdgeDefinition({
    type: "feeds_context",
    label: "提供上下文",
    creationLabel: "上下文输入",
    description: "表示一个节点为另一个节点持续提供上下文。",
    strokeStyle: "rgba(57, 132, 98, 0.26)",
    pulseColor: "rgba(78, 166, 123, ALPHA)",
  }),
  assigns_to: createDefaultEdgeDefinition({
    type: "assigns_to",
    label: "分配给",
    creationLabel: "任务分配",
    description: "表示一个节点将工作或责任分配给另一个节点。",
    strokeStyle: "rgba(122, 88, 152, 0.24)",
    pulseColor: "rgba(152, 112, 194, ALPHA)",
  }),
  blocks: createDefaultEdgeDefinition({
    type: "blocks",
    label: "阻塞",
    creationLabel: "阻塞关系",
    description: "表示一个节点会阻塞另一个节点继续推进。",
    strokeStyle: "rgba(160, 88, 78, 0.24)",
    pulseColor: "rgba(204, 112, 96, ALPHA)",
  }),
};

export function getEdgeTypeDefinition(type) {
  return edgeTypeRegistry[type] || edgeTypeRegistry[DEFAULT_EDGE_TYPE];
}

export function listEdgeTypes() {
  return Object.values(edgeTypeRegistry);
}

export function createEdgeData(type = DEFAULT_EDGE_TYPE) {
  return getEdgeTypeDefinition(type).createData();
}

export function normalizeEdgeData(edge, data = {}) {
  return getEdgeTypeDefinition(edge?.type).normalizeData(edge, data);
}

export function cascadesDeleteThroughEdgeType(type) {
  return Boolean(getEdgeTypeDefinition(type).cascadesDelete);
}

export function rendersEdgeOnCanvas(edge) {
  return Boolean(getEdgeTypeDefinition(edge?.type).rendersOnCanvas);
}

export function getEdgeCanvasStyle(edge) {
  return getEdgeTypeDefinition(edge?.type).getCanvasStyle(edge);
}
