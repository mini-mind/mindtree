import { getNodePosition } from "./graph-model.js";

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

const DOUBLE_TAP_DELAY = 320;
const DRAG_THRESHOLD = 8;
const LONG_PRESS_DELAY = 420;

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function getDistance(pointA, pointB) {
  return Math.hypot(pointA.clientX - pointB.clientX, pointA.clientY - pointB.clientY);
}

function getCenter(pointA, pointB) {
  return {
    x: (pointA.clientX + pointB.clientX) / 2,
    y: (pointA.clientY + pointB.clientY) / 2,
  };
}

export function createGraphCanvas(
  canvas,
  {
    getNodeSummary,
    getNodeLinks = () => [],
    showMinimap = true,
    initialViewMode = "default",
    onNodeSelect,
    onNodesSelect,
    onNodeOpen,
    onBackgroundSelect,
    onNodeMove,
    onNodeContextMenu,
    onBackgroundContextMenu,
    onNodeReferenceCreate,
    onNodeReferenceCreateToPoint,
  }
) {
  const ctx = canvas.getContext("2d");
  function createDefaultView() {
    return {
      scale: 1,
      offsetX: getViewportSize().width * 0.42,
      offsetY: 120,
      draggingCanvas: false,
      lastX: 0,
      lastY: 0,
    };
  }

  function getViewportSize() {
    return {
      width: canvas.clientWidth || window.innerWidth,
      height: canvas.clientHeight || window.innerHeight,
    };
  }

  function getCanvasRect() {
    return canvas.getBoundingClientRect();
  }

  function toLocalPoint(clientX, clientY) {
    const rect = getCanvasRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  const view = createDefaultView();
  const pointerState = {
    contextMenuCandidate: null,
    selectionBox: null,
    referenceDraft: null,
  };
  const touchState = {
    primary: null,
    pinch: null,
    longPressTimer: null,
  };
  const minimapState = {
    region: null,
    dragging: false,
  };
  let hitRegions = [];
  let currentGraph = null;
  let currentSelectedId = null;
  let currentSelectedIds = [];
  let lastTapId = null;
  let lastTapAt = 0;
  let draggingNodeId = null;
  let hasInitializedView = false;
  let animationFrame = 0;

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
      const summaryRows = truncateRows(getNodeSummary(node), 18, 3);
      const width = GRAPH_CANVAS_THEME.nodeWidth;
      const height = Math.max(GRAPH_CANVAS_THEME.nodeMinHeight, 46 + summaryRows.length * 18);
      const position = getNodePosition(node);

      layout.set(node.id, {
        x: position.x,
        y: position.y,
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

  function getHitRegionAt(x, y) {
    return hitRegions.find(
      (region) => x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height
    );
  }

  function isPastDragThreshold(deltaX, deltaY) {
    return Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD;
  }

  function clearLongPressTimer() {
    if (touchState.longPressTimer !== null) {
      window.clearTimeout(touchState.longPressTimer);
      touchState.longPressTimer = null;
    }
  }

  function scheduleLongPress(callback) {
    clearLongPressTimer();
    touchState.longPressTimer = window.setTimeout(() => {
      touchState.longPressTimer = null;
      callback();
    }, LONG_PRESS_DELAY);
  }

  function clearTouchState() {
    clearLongPressTimer();
    touchState.primary = null;
    touchState.pinch = null;
  }

  function finishSelectionBox() {
    if (!pointerState.selectionBox) {
      return;
    }

    const selectionBox = pointerState.selectionBox;
    pointerState.selectionBox = null;

    if (!selectionBox.moved) {
      draw();
      return;
    }

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
  }

  function translateCanvas(deltaX, deltaY) {
    view.offsetX += deltaX;
    view.offsetY += deltaY;
    draw();
  }

  function centerViewportAtWorldPoint(worldX, worldY) {
    const viewport = getViewportSize();
    view.offsetX = viewport.width / 2 - worldX * view.scale;
    view.offsetY = viewport.height / 2 - worldY * view.scale;
    draw();
  }

  function fitViewToBounds(bounds) {
    if (!bounds) {
      return;
    }

    const viewport = getViewportSize();
    const padding = 40;
    const boundsWidth = Math.max(1, bounds.maxX - bounds.minX);
    const boundsHeight = Math.max(1, bounds.maxY - bounds.minY);
    const fittedScale = Math.min(
      1.2,
      Math.max(
        0.45,
        Math.min(
          (viewport.width - padding * 2) / boundsWidth,
          (viewport.height - padding * 2) / boundsHeight
        )
      )
    );

    view.scale = fittedScale;
    view.offsetX = viewport.width / 2 - (bounds.minX + boundsWidth / 2) * view.scale;
    view.offsetY = viewport.height / 2 - (bounds.minY + boundsHeight / 2) * view.scale;
  }

  function applyScaleAtPoint(nextScale, clientX, clientY) {
    const clampedScale = Math.min(1.8, Math.max(0.45, nextScale));
    const worldPoint = screenToWorld(clientX, clientY);
    view.scale = clampedScale;
    view.offsetX = clientX - worldPoint.x * view.scale;
    view.offsetY = clientY - worldPoint.y * view.scale;
    draw();
  }

  function registerNodeTap(nodeId) {
    onNodeSelect(nodeId);

    const now = Date.now();
    if (lastTapId === nodeId && now - lastTapAt < DOUBLE_TAP_DELAY) {
      onNodeOpen(nodeId);
    }

    lastTapId = nodeId;
    lastTapAt = now;
  }

  function getMinimapTheme(width, height) {
    if (width <= 640 || height <= 720) {
      return {
        width: 144,
        height: 102,
        margin: 14,
        padding: 9,
      };
    }

    return MINIMAP_THEME;
  }

  function getMinimapHitAt(x, y) {
    const region = minimapState.region;
    if (!region) {
      return null;
    }

    const withinCard =
      x >= region.cardX &&
      x <= region.cardX + region.cardWidth &&
      y >= region.cardY &&
      y <= region.cardY + region.cardHeight;

    if (!withinCard) {
      return null;
    }

    const withinViewport =
      x >= region.viewportX &&
      x <= region.viewportX + region.viewportWidth &&
      y >= region.viewportY &&
      y <= region.viewportY + region.viewportHeight;

    const withinContent =
      x >= region.contentX &&
      x <= region.contentX + region.contentWidth &&
      y >= region.contentY &&
      y <= region.contentY + region.contentHeight;

    if (withinViewport) {
      return "viewport";
    }

    if (withinContent) {
      return "content";
    }

    return "card";
  }

  function centerViewportFromMinimapPoint(clientX, clientY) {
    const region = minimapState.region;
    if (!region) {
      return;
    }

    const clampedX = Math.min(Math.max(clientX, region.offsetX), region.offsetX + region.mapWidth);
    const clampedY = Math.min(Math.max(clientY, region.offsetY), region.offsetY + region.mapHeight);
    const worldX = region.bounds.minX + (clampedX - region.offsetX) / region.scale;
    const worldY = region.bounds.minY + (clampedY - region.offsetY) / region.scale;
    centerViewportAtWorldPoint(worldX, worldY);
  }

  function startMinimapDrag(clientX, clientY) {
    minimapState.dragging = true;
    centerViewportFromMinimapPoint(clientX, clientY);
  }

  function stopMinimapDrag() {
    minimapState.dragging = false;
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

  function getNodeCenter(box) {
    return {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };
  }

  function drawArrow(fromX, fromY, toX, toY, selected = false, animated = false) {
    const start = worldToScreen(fromX, fromY);
    const end = worldToScreen(toX, toY);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headLength = 10;

    ctx.save();
    ctx.strokeStyle = selected ? "rgba(166, 123, 53, 0.68)" : "rgba(104, 114, 124, 0.38)";
    ctx.lineWidth = selected ? 2 : 1.5;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(
      end.x - headLength * Math.cos(angle - Math.PI / 6),
      end.y - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      end.x - headLength * Math.cos(angle + Math.PI / 6),
      end.y - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();

    if (animated) {
      const progress = ((Date.now() / 900) % 1);
      const markerX = start.x + dx * progress;
      const markerY = start.y + dy * progress;
      ctx.beginPath();
      ctx.fillStyle = selected ? "rgba(166, 123, 53, 0.9)" : "rgba(166, 123, 53, 0.72)";
      ctx.arc(markerX, markerY, Math.max(2.5, Math.min(4, distance / 80)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLinks(graph, layout) {
    graph.nodes.forEach((node) => {
      const sourceBox = layout.get(node.id);
      if (!sourceBox) {
        return;
      }

      const sourceCenter = getNodeCenter(sourceBox);
      getNodeLinks(node).forEach((link) => {
        const targetBox = layout.get(Number(link?.entityId));
        if (!targetBox) {
          return;
        }

        const targetCenter = getNodeCenter(targetBox);
        drawArrow(sourceCenter.x, sourceCenter.y, targetCenter.x, targetCenter.y, false, true);
      });
    });
  }

  function drawReferenceDraft(layout) {
    if (!pointerState.referenceDraft) {
      return;
    }

    const sourceBox = layout.get(pointerState.referenceDraft.sourceId);
    if (!sourceBox) {
      return;
    }

    const sourceCenter = getNodeCenter(sourceBox);
    const targetBox = pointerState.referenceDraft.hoverTargetId
      ? layout.get(pointerState.referenceDraft.hoverTargetId)
      : null;
    const targetPoint = targetBox
      ? getNodeCenter(targetBox)
      : screenToWorld(pointerState.referenceDraft.currentX, pointerState.referenceDraft.currentY);
    drawArrow(sourceCenter.x, sourceCenter.y, targetPoint.x, targetPoint.y, true, true);
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
      minimapState.region = null;
      return;
    }

    const theme = getMinimapTheme(width, height);
    const cardWidth = theme.width;
    const cardHeight = theme.height;
    const cardX = width - cardWidth - theme.margin;
    const cardY = height - cardHeight - theme.margin;
    const contentX = cardX + theme.padding;
    const contentY = cardY + theme.padding;
    const contentWidth = cardWidth - theme.padding * 2;
    const contentHeight = cardHeight - theme.padding * 2;
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

    minimapState.region = {
      cardX,
      cardY,
      cardWidth,
      cardHeight,
      contentX,
      contentY,
      contentWidth,
      contentHeight,
      offsetX,
      offsetY,
      mapWidth,
      mapHeight,
      scale,
      bounds,
      viewportX,
      viewportY,
      viewportWidth,
      viewportHeight,
    };

    ctx.fillStyle = "rgba(166, 123, 53, 0.08)";
    ctx.strokeStyle = "rgba(166, 123, 53, 0.42)";
    ctx.lineWidth = 1;
    ctx.fillRect(viewportX, viewportY, viewportWidth, viewportHeight);
    ctx.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight);
    ctx.restore();
  }

  function draw() {
    const { width, height } = getViewportSize();
    ctx.clearRect(0, 0, width, height);
    drawGrid(width, height);
    hitRegions = [];
    minimapState.region = null;

    if (!currentGraph?.nodes.length) {
      return;
    }

    const layout = layoutGraph(currentGraph);
    const bounds = getLayoutBounds(layout);

    if (!hasInitializedView && initialViewMode === "fit-content" && bounds) {
      fitViewToBounds(bounds);
      hasInitializedView = true;
    }

    drawLinks(currentGraph, layout);

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

    drawReferenceDraft(layout);

    if (showMinimap) {
      drawMinimap(layout, bounds, width, height);
    }
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = getViewportSize();
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  function startAnimationLoop() {
    if (animationFrame) {
      return;
    }

    const tick = () => {
      animationFrame = window.requestAnimationFrame(tick);
      if (currentGraph?.nodes?.length) {
        draw();
      }
    };

    animationFrame = window.requestAnimationFrame(tick);
  }

  function startPinchGesture(touchA, touchB) {
    clearLongPressTimer();
    pointerState.selectionBox = null;
    draggingNodeId = null;
    view.draggingCanvas = false;

    const center = getCenter(touchA, touchB);
    touchState.primary = null;
    touchState.pinch = {
      startDistance: Math.max(1, getDistance(touchA, touchB)),
      startScale: view.scale,
      worldCenter: screenToWorld(center.x, center.y),
    };
  }

  function updatePinchGesture(touchA, touchB) {
    if (!touchState.pinch) {
      return;
    }

    const center = getCenter(touchA, touchB);
    const distance = Math.max(1, getDistance(touchA, touchB));
    const nextScale = touchState.pinch.startScale * (distance / touchState.pinch.startDistance);
    view.scale = Math.min(1.8, Math.max(0.45, nextScale));
    view.offsetX = center.x - touchState.pinch.worldCenter.x * view.scale;
    view.offsetY = center.y - touchState.pinch.worldCenter.y * view.scale;
    draw();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") {
      return;
    }

    const point = toLocalPoint(event.clientX, event.clientY);
    const minimapHit = showMinimap ? getMinimapHitAt(point.x, point.y) : null;
    if (minimapHit) {
      event.preventDefault();
      event.stopPropagation();
      pointerState.contextMenuCandidate = null;
      pointerState.selectionBox = null;
      draggingNodeId = null;
      view.draggingCanvas = false;
      if (event.button === 0 && minimapHit !== "card") {
        startMinimapDrag(point.x, point.y);
      }
      return;
    }

    const hit = getHitRegionAt(point.x, point.y);

    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();

      pointerState.contextMenuCandidate = {
        hitId: hit?.id ?? null,
        startX: point.x,
        startY: point.y,
        moved: false,
      };

      if (!hit) {
        view.draggingCanvas = false;
        view.lastX = point.x;
        view.lastY = point.y;
      }

      draggingNodeId = null;
      return;
    }

    if (event.shiftKey || !hit) {
      beginSelectionBox(point.x, point.y);
      onBackgroundSelect();
      return;
    }

    registerNodeTap(hit.id);
    draggingNodeId = hit.id;
    view.lastX = point.x;
    view.lastY = point.y;
  });

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") {
      return;
    }

    const point = toLocalPoint(event.clientX, event.clientY);

    if (minimapState.dragging) {
      centerViewportFromMinimapPoint(point.x, point.y);
      return;
    }

    if (pointerState.contextMenuCandidate) {
      const deltaX = point.x - pointerState.contextMenuCandidate.startX;
      const deltaY = point.y - pointerState.contextMenuCandidate.startY;
      const movedFarEnough = isPastDragThreshold(deltaX, deltaY);

      if (movedFarEnough) {
        pointerState.contextMenuCandidate.moved = true;
        if (pointerState.contextMenuCandidate.hitId === null) {
          view.draggingCanvas = true;
        } else {
          pointerState.referenceDraft = {
            sourceId: pointerState.contextMenuCandidate.hitId,
            currentX: point.x,
            currentY: point.y,
            hoverTargetId: null,
          };
        }
      }
    }

    if (pointerState.referenceDraft) {
      pointerState.referenceDraft.currentX = point.x;
      pointerState.referenceDraft.currentY = point.y;
      const hoverHit = getHitRegionAt(point.x, point.y);
      pointerState.referenceDraft.hoverTargetId =
        hoverHit && hoverHit.id !== pointerState.referenceDraft.sourceId ? hoverHit.id : null;
      draw();
      return;
    }

    if (draggingNodeId !== null) {
      const deltaX = (point.x - view.lastX) / view.scale;
      const deltaY = (point.y - view.lastY) / view.scale;
      view.lastX = point.x;
      view.lastY = point.y;
      onNodeMove(draggingNodeId, deltaX, deltaY);
      return;
    }

    if (pointerState.selectionBox) {
      pointerState.selectionBox.currentX = point.x;
      pointerState.selectionBox.currentY = point.y;
      pointerState.selectionBox.moved =
        Math.abs(pointerState.selectionBox.currentX - pointerState.selectionBox.startX) > 6 ||
        Math.abs(pointerState.selectionBox.currentY - pointerState.selectionBox.startY) > 6;
      draw();
      return;
    }

    if (!view.draggingCanvas) {
      return;
    }

    translateCanvas(point.x - view.lastX, point.y - view.lastY);
    view.lastX = point.x;
    view.lastY = point.y;
  });

  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch") {
      return;
    }

    if (minimapState.dragging) {
      stopMinimapDrag();
      return;
    }

    if (event.button === 0 && pointerState.selectionBox) {
      finishSelectionBox();
    }

    if (event.button === 2 && pointerState.contextMenuCandidate) {
      const { hitId, moved } = pointerState.contextMenuCandidate;
      const draft = pointerState.referenceDraft;
      pointerState.contextMenuCandidate = null;

      if (!moved) {
        if (hitId !== null) {
          onNodeContextMenu?.(hitId, { x: event.clientX, y: event.clientY });
        } else {
          onBackgroundContextMenu?.({ x: event.clientX, y: event.clientY });
        }
      } else if (draft?.sourceId && draft.hoverTargetId) {
        onNodeReferenceCreate?.(
          draft.sourceId,
          draft.hoverTargetId
        );
      } else if (draft?.sourceId) {
        onNodeReferenceCreateToPoint?.(draft.sourceId, {
          x: event.clientX,
          y: event.clientY,
        });
      }

      pointerState.referenceDraft = null;
      draw();
    }

    view.draggingCanvas = false;
    draggingNodeId = null;
  });

  canvas.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "touch") {
      return;
    }

    stopMinimapDrag();
    pointerState.contextMenuCandidate = null;
    pointerState.selectionBox = null;
    pointerState.referenceDraft = null;
    view.draggingCanvas = false;
    draggingNodeId = null;
  });

  canvas.addEventListener("touchstart", (event) => {
    event.preventDefault();

    if (event.touches.length === 2) {
      startPinchGesture(event.touches[0], event.touches[1]);
      return;
    }

    if (event.touches.length > 2) {
      clearTouchState();
      return;
    }

    const touch = event.touches[0];
    const point = toLocalPoint(touch.clientX, touch.clientY);
    const minimapHit = showMinimap ? getMinimapHitAt(point.x, point.y) : null;
    if (minimapHit && minimapHit !== "card") {
      clearTouchState();
      touchState.primary = {
        identifier: touch.identifier,
        hitId: null,
        startX: point.x,
        startY: point.y,
        lastX: point.x,
        lastY: point.y,
        mode: "minimap-drag",
      };
      startMinimapDrag(point.x, point.y);
      return;
    }

    const hit = getHitRegionAt(point.x, point.y);
    touchState.primary = {
      identifier: touch.identifier,
      hitId: hit?.id ?? null,
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      mode: hit ? "node-pending" : "background-pending",
    };

    if (hit) {
      scheduleLongPress(() => {
        if (!touchState.primary || touchState.primary.hitId !== hit.id || touchState.pinch) {
          return;
        }

        touchState.primary.mode = "node-menu";
        onNodeContextMenu?.(hit.id, {
          x: touch.clientX,
          y: touch.clientY,
        });
      });
      return;
    }

    scheduleLongPress(() => {
      if (!touchState.primary || touchState.primary.hitId !== null || touchState.pinch) {
        return;
      }

      touchState.primary.mode = "background-hold";
    });
  }, { passive: false });

  canvas.addEventListener("touchmove", (event) => {
    event.preventDefault();

    if (event.touches.length === 2) {
      if (!touchState.pinch) {
        startPinchGesture(event.touches[0], event.touches[1]);
      }
      updatePinchGesture(event.touches[0], event.touches[1]);
      return;
    }

    if (!touchState.primary || touchState.pinch) {
      return;
    }

    const touch = [...event.touches].find((item) => item.identifier === touchState.primary.identifier);
    if (!touch) {
      return;
    }

    const point = toLocalPoint(touch.clientX, touch.clientY);

    const totalDeltaX = point.x - touchState.primary.startX;
    const totalDeltaY = point.y - touchState.primary.startY;
    const movedFarEnough = isPastDragThreshold(totalDeltaX, totalDeltaY);

    if (touchState.primary.mode === "minimap-drag") {
      centerViewportFromMinimapPoint(point.x, point.y);
      touchState.primary.lastX = point.x;
      touchState.primary.lastY = point.y;
      return;
    }

    if (touchState.primary.mode === "node-pending" && movedFarEnough) {
      clearLongPressTimer();
      touchState.primary.mode = "node-drag";
      onNodeSelect?.(touchState.primary.hitId);
    }

    if (touchState.primary.mode === "background-pending" && movedFarEnough) {
      clearLongPressTimer();
      touchState.primary.mode = "canvas-pan";
    }

    if (touchState.primary.mode === "background-hold" && movedFarEnough) {
      beginSelectionBox(touchState.primary.startX, touchState.primary.startY);
      onBackgroundSelect?.();
      touchState.primary.mode = "selection";
    }

    if (touchState.primary.mode === "node-drag") {
      const deltaX = (point.x - touchState.primary.lastX) / view.scale;
      const deltaY = (point.y - touchState.primary.lastY) / view.scale;
      onNodeMove?.(touchState.primary.hitId, deltaX, deltaY);
    } else if (touchState.primary.mode === "canvas-pan") {
      translateCanvas(point.x - touchState.primary.lastX, point.y - touchState.primary.lastY);
    } else if (touchState.primary.mode === "selection" && pointerState.selectionBox) {
      pointerState.selectionBox.currentX = point.x;
      pointerState.selectionBox.currentY = point.y;
      pointerState.selectionBox.moved =
        Math.abs(pointerState.selectionBox.currentX - pointerState.selectionBox.startX) > 6 ||
        Math.abs(pointerState.selectionBox.currentY - pointerState.selectionBox.startY) > 6;
      draw();
    }

    touchState.primary.lastX = point.x;
    touchState.primary.lastY = point.y;
  }, { passive: false });

  canvas.addEventListener("touchend", (event) => {
    event.preventDefault();

    if (touchState.pinch && event.touches.length < 2) {
      touchState.pinch = null;
    }

    if (!touchState.primary) {
      return;
    }

    const endedPrimary = [...event.changedTouches].some(
      (touch) => touch.identifier === touchState.primary.identifier
    );
    if (!endedPrimary) {
      return;
    }

    clearLongPressTimer();

    if (touchState.primary.mode === "minimap-drag") {
      stopMinimapDrag();
    } else if (touchState.primary.mode === "node-pending") {
      registerNodeTap(touchState.primary.hitId);
    } else if (touchState.primary.mode === "background-pending") {
      onBackgroundSelect?.();
    } else if (touchState.primary.mode === "background-hold") {
      onBackgroundContextMenu?.({
        x: touchState.primary.lastX,
        y: touchState.primary.lastY,
      });
    } else if (touchState.primary.mode === "selection") {
      finishSelectionBox();
    }

    touchState.primary = null;
    draw();
  }, { passive: false });

  canvas.addEventListener("touchcancel", () => {
    clearTouchState();
    stopMinimapDrag();
    pointerState.selectionBox = null;
    draw();
  }, { passive: false });

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 1.08 : 0.92;
      applyScaleAtPoint(view.scale * delta, event.clientX, event.clientY);
    },
    { passive: false }
  );

  startAnimationLoop();

  return {
    resize,
    render(graph, selectedId, selectedIds = []) {
      currentGraph = graph;
      currentSelectedId = selectedId;
      currentSelectedIds = selectedIds;
      draw();
    },
    getNodeScreenBox(nodeId) {
      const rect = getCanvasRect();
      const region = hitRegions.find((item) => item.id === nodeId);
      return region
        ? {
            ...region,
            x: region.x + rect.left,
            y: region.y + rect.top,
          }
        : null;
    },
    projectScreenToWorld(x, y) {
      const point = toLocalPoint(x, y);
      return screenToWorld(point.x, point.y);
    },
  };
}
