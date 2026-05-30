import { getCanvasNodeSummary } from "./node-types.js";

export const GRAPH_CANVAS_THEME = {
  nodeWidth: 220,
  nodeMinHeight: 88,
};

const MINIMAP_THEME = {
  width: 196,
  height: 132,
  margin: 20,
  padding: 12,
};

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

export function createGraphCanvas(
  canvas,
  {
    onNodeSelect,
    onNodesSelect,
    onNodeOpen,
    onBackgroundSelect,
    onNodeMove,
    onNodeContextMenu,
    onBackgroundContextMenu,
  }
) {
  const ctx = canvas.getContext("2d");
  const contextMenuDragThreshold = 8;
  const animation = {
    frameId: null,
  };
  const view = {
    scale: 1,
    offsetX: window.innerWidth * 0.42,
    offsetY: 120,
    draggingCanvas: false,
    lastX: 0,
    lastY: 0,
  };
  const pointerState = {
    contextMenuCandidate: null,
    selectionBox: null,
  };
  let hitRegions = [];
  let currentGraph = null;
  let currentSelectedId = null;
  let currentSelectedIds = [];
  let lastHitId = null;
  let lastHitAt = 0;
  let draggingNodeId = null;

  function beginSelectionBox(x, y) {
    pointerState.selectionBox = {
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      moved: false,
    };
  }

  function worldToScreen(x, y) {
    return {
      x: x * view.scale + view.offsetX,
      y: y * view.scale + view.offsetY,
    };
  }

  function screenToWorld(x, y) {
    return {
      x: (x - view.offsetX) / view.scale,
      y: (y - view.offsetY) / view.scale,
    };
  }

  function truncateRows(text, maxChars, maxLines) {
    if (!text) {
      return [];
    }

    const rows = [];
    let current = "";
    let truncated = false;

    for (const char of text) {
      current += char;
      if (current.length >= maxChars) {
        rows.push(current);
        current = "";
        if (rows.length === maxLines) {
          truncated = true;
          break;
        }
      }
    }

    if (!truncated && current) {
      rows.push(current);
    }

    if (rows.length > maxLines) {
      rows.length = maxLines;
      truncated = true;
    }

    if (truncated && rows.length) {
      rows[rows.length - 1] = `${rows[rows.length - 1].slice(0, Math.max(0, maxChars - 3))}...`;
    }

    return rows;
  }

  function layoutGraph(graph) {
    const layout = new Map();

    graph.nodes.forEach((node) => {
      const summaryRows = truncateRows(getCanvasNodeSummary(node), 18, 3);
      const width = GRAPH_CANVAS_THEME.nodeWidth;
      const height = Math.max(GRAPH_CANVAS_THEME.nodeMinHeight, 46 + summaryRows.length * 18);

      layout.set(node.id, {
        x: node.x || 0,
        y: node.y || 0,
        width,
        height,
        summaryRows,
      });
    });

    return layout;
  }

  function getLayoutBounds(layout) {
    const boxes = [...layout.values()];
    if (!boxes.length) {
      return null;
    }

    return boxes.reduce(
      (bounds, box) => ({
        minX: Math.min(bounds.minX, box.x),
        minY: Math.min(bounds.minY, box.y),
        maxX: Math.max(bounds.maxX, box.x + box.width),
        maxY: Math.max(bounds.maxY, box.y + box.height),
      }),
      {
        minX: boxes[0].x,
        minY: boxes[0].y,
        maxX: boxes[0].x + boxes[0].width,
        maxY: boxes[0].y + boxes[0].height,
      }
    );
  }

  function getViewportBounds(width, height) {
    return {
      minX: (0 - view.offsetX) / view.scale,
      minY: (0 - view.offsetY) / view.scale,
      maxX: (width - view.offsetX) / view.scale,
      maxY: (height - view.offsetY) / view.scale,
    };
  }

  function mergeBounds(boundsList) {
    const filtered = boundsList.filter(Boolean);
    if (!filtered.length) {
      return null;
    }

    return filtered.reduce(
      (merged, bounds) => ({
        minX: Math.min(merged.minX, bounds.minX),
        minY: Math.min(merged.minY, bounds.minY),
        maxX: Math.max(merged.maxX, bounds.maxX),
        maxY: Math.max(merged.maxY, bounds.maxY),
      }),
      { ...filtered[0] }
    );
  }

  function drawGrid(width, height) {
    const gap = 48 * view.scale;
    ctx.save();
    ctx.strokeStyle = "rgba(58, 64, 72, 0.08)";
    ctx.lineWidth = 1;
    const startX = ((view.offsetX % gap) + gap) % gap;
    const startY = ((view.offsetY % gap) + gap) % gap;

    for (let x = startX; x < width; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let y = startY; y < height; y += gap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawNode(node, box, selected) {
    const topLeft = worldToScreen(box.x, box.y);
    const width = box.width * view.scale;
    const height = box.height * view.scale;
    const radius = 18;
    const contentLeft = topLeft.x + 18;
    const contentRight = topLeft.x + width - 18;
    const contentWidth = Math.max(0, contentRight - contentLeft);

    ctx.save();
    const gradient = ctx.createLinearGradient(
      topLeft.x,
      topLeft.y,
      topLeft.x + width,
      topLeft.y + height
    );
    gradient.addColorStop(0, selected ? "rgba(250, 247, 240, 1)" : "rgba(255, 252, 247, 0.98)");
    gradient.addColorStop(1, selected ? "rgba(242, 235, 223, 1)" : "rgba(248, 244, 237, 0.98)");

    roundRect(ctx, topLeft.x, topLeft.y, width, height, radius);
    ctx.shadowColor = selected ? "rgba(122, 103, 76, 0.18)" : "rgba(48, 54, 61, 0.08)";
    ctx.shadowBlur = selected ? 18 : 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = selected ? 8 : 6;
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeStyle = selected ? "rgba(124, 98, 61, 0.42)" : "rgba(72, 78, 84, 0.14)";
    ctx.stroke();

    roundRect(ctx, topLeft.x, topLeft.y, width, height, radius);
    ctx.clip();

    ctx.fillStyle = "rgba(98, 106, 116, 0.92)";
    ctx.font = `500 ${Math.max(12, 14 * view.scale)}px "IBM Plex Sans"`;
    box.summaryRows.forEach((line, index) => {
      ctx.fillText(line, contentLeft, topLeft.y + 30 + index * 18, contentWidth);
    });
    ctx.restore();

    hitRegions.push({
      id: node.id,
      x: topLeft.x,
      y: topLeft.y,
      width,
      height,
    });
  }

  function drawSelectionBox(box) {
    const x = Math.min(box.startX, box.currentX);
    const y = Math.min(box.startY, box.currentY);
    const width = Math.abs(box.currentX - box.startX);
    const height = Math.abs(box.currentY - box.startY);

    if (width < 2 || height < 2) {
      return;
    }

    ctx.save();
    ctx.fillStyle = "rgba(166, 123, 53, 0.08)";
    ctx.strokeStyle = "rgba(166, 123, 53, 0.42)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
  }

  function drawMinimap(layout, contentBounds, width, height) {
    const viewportBounds = getViewportBounds(width, height);
    const bounds = mergeBounds([contentBounds, viewportBounds]);
    if (!bounds) {
      return;
    }

    const cardWidth = MINIMAP_THEME.width;
    const cardHeight = MINIMAP_THEME.height;
    const cardX = width - cardWidth - MINIMAP_THEME.margin;
    const cardY = height - cardHeight - MINIMAP_THEME.margin;
    const contentX = cardX + MINIMAP_THEME.padding;
    const contentY = cardY + MINIMAP_THEME.padding;
    const contentWidth = cardWidth - MINIMAP_THEME.padding * 2;
    const contentHeight = cardHeight - MINIMAP_THEME.padding * 2;
    const boundsWidth = Math.max(1, bounds.maxX - bounds.minX);
    const boundsHeight = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.min(contentWidth / boundsWidth, contentHeight / boundsHeight);
    const mapWidth = boundsWidth * scale;
    const mapHeight = boundsHeight * scale;
    const offsetX = contentX + (contentWidth - mapWidth) / 2;
    const offsetY = contentY + (contentHeight - mapHeight) / 2;

    ctx.save();
    ctx.shadowColor = "rgba(41, 48, 56, 0.08)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10;
    roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 18);
    ctx.fillStyle = "rgba(255, 252, 247, 0.92)";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(72, 78, 84, 0.12)";
    ctx.stroke();

    roundRect(ctx, contentX, contentY, contentWidth, contentHeight, 12);
    ctx.clip();

    layout.forEach((box, nodeId) => {
      const x = offsetX + (box.x - bounds.minX) * scale;
      const y = offsetY + (box.y - bounds.minY) * scale;
      const nodeWidth = Math.max(6, box.width * scale);
      const nodeHeight = Math.max(4, box.height * scale);
      const selected = nodeId === currentSelectedId || currentSelectedIds.includes(nodeId);

      ctx.fillStyle = selected ? "rgba(175, 133, 66, 0.9)" : "rgba(126, 136, 145, 0.5)";
      roundRect(ctx, x, y, nodeWidth, nodeHeight, 4);
      ctx.fill();
    });

    const viewportX = offsetX + (viewportBounds.minX - bounds.minX) * scale;
    const viewportY = offsetY + (viewportBounds.minY - bounds.minY) * scale;
    const viewportWidth = (viewportBounds.maxX - viewportBounds.minX) * scale;
    const viewportHeight = (viewportBounds.maxY - viewportBounds.minY) * scale;

    ctx.fillStyle = "rgba(166, 123, 53, 0.08)";
    ctx.strokeStyle = "rgba(166, 123, 53, 0.42)";
    ctx.lineWidth = 1;
    ctx.fillRect(viewportX, viewportY, viewportWidth, viewportHeight);
    ctx.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight);
    ctx.restore();
  }

  function draw() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    ctx.clearRect(0, 0, width, height);
    drawGrid(width, height);
    hitRegions = [];

    if (!currentGraph?.nodes.length) {
      return;
    }

    const layout = layoutGraph(currentGraph);
    const bounds = getLayoutBounds(layout);

    currentGraph.nodes.forEach((node) => {
      const box = layout.get(node.id);
      if (!box) {
        return;
      }
      drawNode(node, box, node.id === currentSelectedId || currentSelectedIds.includes(node.id));
    });

    if (pointerState.selectionBox) {
      drawSelectionBox(pointerState.selectionBox);
    }

    drawMinimap(layout, bounds, width, height);
  }

  function tick() {
    draw();
    animation.frameId = window.requestAnimationFrame(tick);
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * ratio;
    canvas.height = window.innerHeight * ratio;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  canvas.addEventListener("pointerdown", (event) => {
    const hit = hitRegions.find(
      (region) =>
        event.clientX >= region.x &&
        event.clientX <= region.x + region.width &&
        event.clientY >= region.y &&
        event.clientY <= region.y + region.height
    );

    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();

      pointerState.contextMenuCandidate = {
        hitId: hit?.id ?? null,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };

      if (!hit) {
        view.draggingCanvas = false;
        view.lastX = event.clientX;
        view.lastY = event.clientY;
      }

      draggingNodeId = null;
      return;
    }

    if (event.shiftKey || !hit) {
      beginSelectionBox(event.clientX, event.clientY);
      onBackgroundSelect();
      return;
    }

    onNodeSelect(hit.id);
    draggingNodeId = hit.id;
    view.lastX = event.clientX;
    view.lastY = event.clientY;
    const now = Date.now();
    if (lastHitId === hit.id && now - lastHitAt < 320) {
      onNodeOpen(hit.id);
    }
    lastHitId = hit.id;
    lastHitAt = now;
  });

  canvas.addEventListener("pointermove", (event) => {
    if (pointerState.contextMenuCandidate) {
      const deltaX = event.clientX - pointerState.contextMenuCandidate.startX;
      const deltaY = event.clientY - pointerState.contextMenuCandidate.startY;
      const movedFarEnough =
        Math.abs(deltaX) > contextMenuDragThreshold ||
        Math.abs(deltaY) > contextMenuDragThreshold;

      if (movedFarEnough) {
        pointerState.contextMenuCandidate.moved = true;
        if (pointerState.contextMenuCandidate.hitId === null) {
          view.draggingCanvas = true;
        }
      }
    }

    if (draggingNodeId !== null) {
      const deltaX = (event.clientX - view.lastX) / view.scale;
      const deltaY = (event.clientY - view.lastY) / view.scale;
      view.lastX = event.clientX;
      view.lastY = event.clientY;
      onNodeMove(draggingNodeId, deltaX, deltaY);
      return;
    }

    if (pointerState.selectionBox) {
      pointerState.selectionBox.currentX = event.clientX;
      pointerState.selectionBox.currentY = event.clientY;
      pointerState.selectionBox.moved =
        Math.abs(pointerState.selectionBox.currentX - pointerState.selectionBox.startX) > 6 ||
        Math.abs(pointerState.selectionBox.currentY - pointerState.selectionBox.startY) > 6;
      draw();
      return;
    }

    if (!view.draggingCanvas) {
      return;
    }

    view.offsetX += event.clientX - view.lastX;
    view.offsetY += event.clientY - view.lastY;
    view.lastX = event.clientX;
    view.lastY = event.clientY;
    draw();
  });

  canvas.addEventListener("pointerup", (event) => {
    if (event.button === 0 && pointerState.selectionBox) {
      const selectionBox = pointerState.selectionBox;
      pointerState.selectionBox = null;

      if (selectionBox.moved) {
        const left = Math.min(selectionBox.startX, selectionBox.currentX);
        const right = Math.max(selectionBox.startX, selectionBox.currentX);
        const top = Math.min(selectionBox.startY, selectionBox.currentY);
        const bottom = Math.max(selectionBox.startY, selectionBox.currentY);
        const selectedIds = hitRegions
          .filter(
            (region) =>
              region.x < right &&
              region.x + region.width > left &&
              region.y < bottom &&
              region.y + region.height > top
          )
          .map((region) => region.id);

        if (selectedIds.length) {
          onNodesSelect?.(selectedIds);
        } else {
          onBackgroundSelect();
        }
      } else {
        draw();
      }
    }

    if (event.button === 2 && pointerState.contextMenuCandidate) {
      const { hitId, moved } = pointerState.contextMenuCandidate;
      pointerState.contextMenuCandidate = null;

      if (!moved) {
        if (hitId !== null) {
          onNodeContextMenu?.(hitId, { x: event.clientX, y: event.clientY });
        } else {
          onBackgroundContextMenu?.({ x: event.clientX, y: event.clientY });
        }
      }

      draw();
    }

    view.draggingCanvas = false;
    draggingNodeId = null;
  });

  canvas.addEventListener("pointerleave", () => {
    pointerState.contextMenuCandidate = null;
    pointerState.selectionBox = null;
    view.draggingCanvas = false;
    draggingNodeId = null;
  });

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 1.08 : 0.92;
      const nextScale = Math.min(1.8, Math.max(0.45, view.scale * delta));
      const cursor = screenToWorld(event.clientX, event.clientY);
      view.scale = nextScale;
      view.offsetX = event.clientX - cursor.x * view.scale;
      view.offsetY = event.clientY - cursor.y * view.scale;
      draw();
    },
    { passive: false }
  );

  if (animation.frameId === null) {
    animation.frameId = window.requestAnimationFrame(tick);
  }

  return {
    resize,
    render(graph, selectedId, selectedIds = []) {
      currentGraph = graph;
      currentSelectedId = selectedId;
      currentSelectedIds = selectedIds;
      draw();
    },
    getNodeScreenBox(nodeId) {
      const region = hitRegions.find((item) => item.id === nodeId);
      return region ? { ...region } : null;
    },
    projectScreenToWorld(x, y) {
      return screenToWorld(x, y);
    },
  };
}
