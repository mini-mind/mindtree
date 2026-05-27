import { walk } from "./tree-model.js";

const theme = {
  nodeWidth: 220,
  nodeMinHeight: 88,
  hGap: 280,
  vGap: 140,
};

function wrapText(text, maxChars = 17) {
  if (!text) {
    return [];
  }

  const rows = [];
  let current = "";
  for (const char of text) {
    current += char;
    if (current.length >= maxChars) {
      rows.push(current);
      current = "";
    }
  }
  if (current) {
    rows.push(current);
  }
  return rows.slice(0, 4);
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

export function createTreeCanvas(
  canvas,
  { onNodeSelect, onNodeOpen, onBackgroundSelect, onNodeMove }
) {
  const ctx = canvas.getContext("2d");
  const view = {
    scale: 1,
    offsetX: window.innerWidth * 0.42,
    offsetY: 120,
    draggingCanvas: false,
    lastX: 0,
    lastY: 0,
  };
  let hitRegions = [];
  let currentTree = null;
  let currentSelectedId = null;
  let lastHitId = null;
  let lastHitAt = 0;
  let draggingNodeId = null;

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

  function layoutTree(tree) {
    const levels = [];
    walk(tree, 0, (_node, depth) => {
      levels[depth] = (levels[depth] || 0) + 1;
    });

    const counters = new Array(levels.length).fill(0);
    const layout = new Map();

    walk(tree, 0, (node, depth) => {
      const index = counters[depth]++;
      const total = levels[depth];
      const y = (index - (total - 1) / 2) * theme.vGap;
      const x = depth * theme.hGap;

      const titleRows = truncateRows(node.title, 16, 3);
      const detailRows = truncateRows(node.detail, 18, 2);
      const height = Math.max(
        theme.nodeMinHeight,
        48 + titleRows.length * 20 + Math.min(detailRows.length, 2) * 18
      );

      layout.set(node.id, {
        x: x + (node.offsetX || 0),
        y: y + (node.offsetY || 0),
        width: theme.nodeWidth,
        height,
        titleRows,
        detailRows,
      });
    });

    return layout;
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

  function drawLink(parentBox, childBox) {
    const from = worldToScreen(parentBox.x + parentBox.width, parentBox.y + parentBox.height / 2);
    const to = worldToScreen(childBox.x, childBox.y + childBox.height / 2);
    const mid = (from.x + to.x) / 2;

    ctx.save();
    ctx.strokeStyle = "rgba(70, 84, 98, 0.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.bezierCurveTo(mid, from.y, mid, to.y, to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawNode(node, box, selected) {
    const topLeft = worldToScreen(box.x, box.y);
    const width = box.width * view.scale;
    const height = box.height * view.scale;
    const radius = 18;

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
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeStyle = selected ? "rgba(124, 98, 61, 0.55)" : "rgba(60, 67, 74, 0.12)";
    ctx.stroke();

    ctx.fillStyle = "rgba(24, 28, 32, 0.96)";
    ctx.font = `600 ${Math.max(13, 16 * view.scale)}px "Space Grotesk"`;
    box.titleRows.forEach((line, index) => {
      ctx.fillText(line, topLeft.x + 18, topLeft.y + 28 + index * 18);
    });

    ctx.fillStyle = "rgba(98, 106, 116, 0.92)";
    ctx.font = `400 ${Math.max(11, 13 * view.scale)}px "IBM Plex Sans"`;
    box.detailRows.slice(0, 2).forEach((line, index) => {
      ctx.fillText(line, topLeft.x + 18, topLeft.y + 58 + box.titleRows.length * 10 + index * 16);
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

  function draw() {
    if (!currentTree) {
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    ctx.clearRect(0, 0, width, height);
    drawGrid(width, height);

    const layout = layoutTree(currentTree);
    hitRegions = [];

    walk(currentTree, 0, (node) => {
      const box = layout.get(node.id);
      node.children.forEach((child) => {
        drawLink(box, layout.get(child.id));
      });
    });

    walk(currentTree, 0, (node) => {
      drawNode(node, layout.get(node.id), node.id === currentSelectedId);
    });
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
    if (event.button === 2) {
      view.draggingCanvas = true;
      view.lastX = event.clientX;
      view.lastY = event.clientY;
      return;
    }

    const hit = hitRegions.find(
      (region) =>
        event.clientX >= region.x &&
        event.clientX <= region.x + region.width &&
        event.clientY >= region.y &&
        event.clientY <= region.y + region.height
    );

    if (hit) {
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
      return;
    }

    onBackgroundSelect();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (draggingNodeId !== null) {
      const deltaX = (event.clientX - view.lastX) / view.scale;
      const deltaY = (event.clientY - view.lastY) / view.scale;
      view.lastX = event.clientX;
      view.lastY = event.clientY;
      onNodeMove(draggingNodeId, deltaX, deltaY);
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

  canvas.addEventListener("pointerup", () => {
    view.draggingCanvas = false;
    draggingNodeId = null;
  });

  canvas.addEventListener("pointerleave", () => {
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

  return {
    resize,
    render(tree, selectedId) {
      currentTree = tree;
      currentSelectedId = selectedId;
      draw();
    },
  };
}
