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
    view.offsetX = window.innerWidth / 2 - worldX * view.scale;
    view.offsetY = window.innerHeight / 2 - worldY * view.scale;
    draw();
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
    const width = window.innerWidth;
    const height = window.innerHeight;
    ctx.clearRect(0, 0, width, height);
    drawGrid(width, height);
    hitRegions = [];
    minimapState.region = null;

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

    const minimapHit = getMinimapHitAt(event.clientX, event.clientY);
    if (minimapHit) {
      event.preventDefault();
      event.stopPropagation();
      pointerState.contextMenuCandidate = null;
      pointerState.selectionBox = null;
      draggingNodeId = null;
      view.draggingCanvas = false;
      if (event.button === 0 && minimapHit !== "card") {
        startMinimapDrag(event.clientX, event.clientY);
      }
      return;
    }

    const hit = getHitRegionAt(event.clientX, event.clientY);

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

    registerNodeTap(hit.id);
    draggingNodeId = hit.id;
    view.lastX = event.clientX;
    view.lastY = event.clientY;
  });

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") {
      return;
    }

    if (minimapState.dragging) {
      centerViewportFromMinimapPoint(event.clientX, event.clientY);
      return;
    }

    if (pointerState.contextMenuCandidate) {
      const deltaX = event.clientX - pointerState.contextMenuCandidate.startX;
      const deltaY = event.clientY - pointerState.contextMenuCandidate.startY;
      const movedFarEnough = isPastDragThreshold(deltaX, deltaY);

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

    translateCanvas(event.clientX - view.lastX, event.clientY - view.lastY);
    view.lastX = event.clientX;
    view.lastY = event.clientY;
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

  canvas.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "touch") {
      return;
    }

    stopMinimapDrag();
    pointerState.contextMenuCandidate = null;
    pointerState.selectionBox = null;
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
    const minimapHit = getMinimapHitAt(touch.clientX, touch.clientY);
    if (minimapHit && minimapHit !== "card") {
      clearTouchState();
      touchState.primary = {
        identifier: touch.identifier,
        hitId: null,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        mode: "minimap-drag",
      };
      startMinimapDrag(touch.clientX, touch.clientY);
      return;
    }

    const hit = getHitRegionAt(touch.clientX, touch.clientY);
    touchState.primary = {
      identifier: touch.identifier,
      hitId: hit?.id ?? null,
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      mode: hit ? "node-pending" : "background-pending",
    };

    if (hit) {
      scheduleLongPress(() => {
        if (!touchState.primary || touchState.primary.hitId !== hit.id || touchState.pinch) {
          return;
        }

        touchState.primary.mode = "node-menu";
        onNodeContextMenu?.(hit.id, {
          x: touchState.primary.lastX,
          y: touchState.primary.lastY,
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

    const totalDeltaX = touch.clientX - touchState.primary.startX;
    const totalDeltaY = touch.clientY - touchState.primary.startY;
    const movedFarEnough = isPastDragThreshold(totalDeltaX, totalDeltaY);

    if (touchState.primary.mode === "minimap-drag") {
      centerViewportFromMinimapPoint(touch.clientX, touch.clientY);
      touchState.primary.lastX = touch.clientX;
      touchState.primary.lastY = touch.clientY;
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
      const deltaX = (touch.clientX - touchState.primary.lastX) / view.scale;
      const deltaY = (touch.clientY - touchState.primary.lastY) / view.scale;
      onNodeMove?.(touchState.primary.hitId, deltaX, deltaY);
    } else if (touchState.primary.mode === "canvas-pan") {
      translateCanvas(touch.clientX - touchState.primary.lastX, touch.clientY - touchState.primary.lastY);
    } else if (touchState.primary.mode === "selection" && pointerState.selectionBox) {
      pointerState.selectionBox.currentX = touch.clientX;
      pointerState.selectionBox.currentY = touch.clientY;
      pointerState.selectionBox.moved =
        Math.abs(pointerState.selectionBox.currentX - pointerState.selectionBox.startX) > 6 ||
        Math.abs(pointerState.selectionBox.currentY - pointerState.selectionBox.startY) > 6;
      draw();
    }

    touchState.primary.lastX = touch.clientX;
    touchState.primary.lastY = touch.clientY;
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
