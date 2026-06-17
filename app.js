const UNIT_RADIUS = 1;
const DISC_COUNT = 10;
const OVERLAP_EPSILON = 0.002;
const COVER_EPSILON = 0.0005;

const canvas = document.querySelector("#scene");
const ctx = canvas.getContext("2d");

const spacing = document.querySelector("#spacing");
const spacingNumber = document.querySelector("#spacingNumber");
const scale = document.querySelector("#scale");
const scaleValue = document.querySelector("#scaleValue");
const resetDiscsButton = document.querySelector("#resetDiscs");
const resetViewButton = document.querySelector("#resetView");
const shufflePointsButton = document.querySelector("#shufflePoints");
const clearJitterButton = document.querySelector("#clearJitter");
const dragLockButton = document.querySelector("#dragLock");
const dragMode = document.querySelector("#dragMode");
const layoutButtons = [...document.querySelectorAll("[data-layout]")];
const dragTargetButtons = [...document.querySelectorAll("[data-drag-target]")];

const coveredCount = document.querySelector("#coveredCount");
const overlapCount = document.querySelector("#overlapCount");
const pointGap = document.querySelector("#pointGap");
const coverageStatus = document.querySelector("#coverageStatus");
const overlapStatus = document.querySelector("#overlapStatus");

const state = {
  layout: "lattice",
  spacing: 1.1,
  scale: 86,
  offset: { x: 0, y: 0 },
  discs: [],
  basePoints: [],
  jitter: Array.from({ length: DISC_COUNT }, () => ({ x: 0, y: 0 })),
  drag: null,
  hoverDisc: -1,
  hoverPoint: -1,
  dragTarget: "disc",
  groupDragLocked: true,
};

function createLatticePoints(step) {
  const h = (Math.sqrt(3) / 2) * step;
  const rows = [4, 3, 3];
  const offsets = [0, 0, -step / 2];
  const points = [];
  rows.forEach((count, rowIndex) => {
    const rowWidth = (count - 1) * step;
    const y = (rowIndex - 1) * h;
    const rowOffset = offsets[rowIndex];
    for (let col = 0; col < count; col += 1) {
      points.push({
        x: col * step - rowWidth / 2 + rowOffset,
        y,
      });
    }
  });
  return centerPoints(points);
}

function createRingPoints(chord) {
  const radius = chord / (2 * Math.sin(Math.PI / DISC_COUNT));
  return centerPoints(
    Array.from({ length: DISC_COUNT }, (_, index) => {
      const angle = -Math.PI / 2 + (index / DISC_COUNT) * Math.PI * 2;
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
    }),
  );
}

function createLinePoints(step) {
  const points = Array.from({ length: DISC_COUNT }, (_, index) => ({
    x: (index - (DISC_COUNT - 1) / 2) * step,
    y: Math.sin(index * 1.7) * step * 0.11,
  }));
  return centerPoints(points);
}

function centerPoints(points) {
  const bounds = getBounds(points);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return points.map((point) => ({ x: point.x - cx, y: point.y - cy }));
}

function createPackedDiscs() {
  const h = Math.sqrt(3);
  const rows = [4, 3, 3];
  const offsets = [0, 0, -1];
  const discs = [];
  rows.forEach((count, rowIndex) => {
    const rowWidth = (count - 1) * 2;
    const y = (rowIndex - 1) * h;
    const rowOffset = offsets[rowIndex];
    for (let col = 0; col < count; col += 1) {
      discs.push({
        x: col * 2 - rowWidth / 2 + rowOffset,
        y,
      });
    }
  });
  return centerPoints(discs);
}

function regeneratePoints() {
  const generators = {
    lattice: createLatticePoints,
    ring: createRingPoints,
    line: createLinePoints,
  };
  state.basePoints = generators[state.layout](state.spacing);
}

function points() {
  return state.basePoints.map((point, index) => ({
    x: point.x + state.jitter[index].x,
    y: point.y + state.jitter[index].y,
  }));
}

function resetDiscs() {
  state.discs = createPackedDiscs();
}

function resetView() {
  state.offset = {
    x: canvas.clientWidth / 2,
    y: canvas.clientHeight / 2,
  };
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!state.offset.x && !state.offset.y) resetView();
  draw();
}

function worldToScreen(point) {
  return {
    x: state.offset.x + point.x * state.scale,
    y: state.offset.y + point.y * state.scale,
  };
}

function screenToWorld(point) {
  return {
    x: (point.x - state.offset.x) / state.scale,
    y: (point.y - state.offset.y) / state.scale,
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getBounds(items) {
  return items.reduce(
    (bounds, item) => ({
      minX: Math.min(bounds.minX, item.x),
      minY: Math.min(bounds.minY, item.y),
      maxX: Math.max(bounds.maxX, item.x),
      maxY: Math.max(bounds.maxY, item.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function coveredDiscIndex(point) {
  return state.discs.findIndex((disc) => distance(point, disc) <= UNIT_RADIUS + COVER_EPSILON);
}

function overlapPairs() {
  const pairs = [];
  for (let a = 0; a < state.discs.length; a += 1) {
    for (let b = a + 1; b < state.discs.length; b += 1) {
      if (distance(state.discs[a], state.discs[b]) < UNIT_RADIUS * 2 - OVERLAP_EPSILON) {
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

function closestPointGap(currentPoints) {
  let gap = Infinity;
  for (let a = 0; a < currentPoints.length; a += 1) {
    for (let b = a + 1; b < currentPoints.length; b += 1) {
      gap = Math.min(gap, distance(currentPoints[a], currentPoints[b]));
    }
  }
  return gap;
}

function drawGrid() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const unit = state.scale;
  const startX = state.offset.x % unit;
  const startY = state.offset.y % unit;

  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(24, 33, 43, 0.08)";

  for (let x = startX; x < width; x += unit) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = startY; y < height; y += unit) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const origin = worldToScreen({ x: 0, y: 0 });
  ctx.strokeStyle = "rgba(24, 33, 43, 0.18)";
  ctx.beginPath();
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, height);
  ctx.moveTo(0, origin.y);
  ctx.lineTo(width, origin.y);
  ctx.stroke();
  ctx.restore();
}

function drawDiscs(overlaps) {
  const overlapped = new Set(overlaps.flat());
  state.discs.forEach((disc, index) => {
    const center = worldToScreen(disc);
    const radius = UNIT_RADIUS * state.scale;
    const isHover = state.dragTarget === "disc" && state.hoverDisc === index;
    const isOverlapping = overlapped.has(index);

    ctx.save();
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = isOverlapping ? "rgba(197, 55, 45, 0.14)" : "rgba(223, 143, 36, 0.2)";
    ctx.strokeStyle = isOverlapping ? "#c5372d" : isHover ? "#9e5d05" : "rgba(158, 93, 5, 0.9)";
    ctx.lineWidth = isHover ? 3 : 2;
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center.x, center.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = isOverlapping ? "#c5372d" : "#df8f24";
    ctx.fill();

    ctx.fillStyle = "rgba(24, 33, 43, 0.68)";
    ctx.font = "700 12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), center.x, center.y - 18);
    ctx.restore();
  });
}

function drawPoints(currentPoints) {
  currentPoints.forEach((point, index) => {
    const screen = worldToScreen(point);
    const covered = coveredDiscIndex(point) !== -1;
    const isHover = state.dragTarget === "point" && state.hoverPoint === index;

    ctx.save();
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, isHover ? 10 : covered ? 7 : 6, 0, Math.PI * 2);
    ctx.fillStyle = covered ? "#138a58" : "#1d5fd0";
    ctx.shadowColor = covered ? "rgba(19, 138, 88, 0.28)" : "rgba(29, 95, 208, 0.25)";
    ctx.shadowBlur = 10;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = isHover ? "#df8f24" : "#fffdf7";
    ctx.stroke();

    ctx.fillStyle = "#18212b";
    ctx.font = "800 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), screen.x, screen.y - 17);
    ctx.restore();
  });
}

function drawScale() {
  const length = state.scale;
  const x = canvas.clientWidth - length - 24;
  const y = canvas.clientHeight - 28;
  ctx.save();
  ctx.strokeStyle = "#18212b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + length, y);
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x, y + 5);
  ctx.moveTo(x + length, y - 5);
  ctx.lineTo(x + length, y + 5);
  ctx.stroke();
  ctx.fillStyle = "#18212b";
  ctx.font = "800 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("1 unit", x + length / 2, y - 10);
  ctx.restore();
}

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const currentPoints = points();
  const overlaps = overlapPairs();
  const covered = currentPoints.filter((point) => coveredDiscIndex(point) !== -1).length;
  const gap = closestPointGap(currentPoints);

  ctx.clearRect(0, 0, width, height);
  drawGrid();
  drawDiscs(overlaps);
  drawPoints(currentPoints);
  drawScale();
  updateReadouts(covered, overlaps.length, gap);
}

function updateReadouts(covered, overlaps, gap) {
  coveredCount.textContent = `${covered}/10`;
  overlapCount.textContent = String(overlaps);
  pointGap.textContent = Number.isFinite(gap) ? gap.toFixed(2) : "--";
  coverageStatus.textContent = `${covered} / 10 covered`;
  overlapStatus.textContent = overlaps === 0 ? "No overlaps" : `${overlaps} overlap pair${overlaps === 1 ? "" : "s"}`;
  overlapStatus.style.color = overlaps === 0 ? "var(--green)" : "var(--red)";
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function hitDisc(screenPoint) {
  const world = screenToWorld(screenPoint);
  let best = -1;
  let bestDistance = Infinity;
  state.discs.forEach((disc, index) => {
    const d = distance(world, disc);
    if (d <= UNIT_RADIUS && d < bestDistance) {
      best = index;
      bestDistance = d;
    }
  });
  return best;
}

function hitPoint(screenPoint) {
  const currentPoints = points();
  let best = -1;
  let bestDistance = Infinity;
  currentPoints.forEach((point, index) => {
    const pointScreen = worldToScreen(point);
    const d = distance(screenPoint, pointScreen);
    if (d <= 16 && d < bestDistance) {
      best = index;
      bestDistance = d;
    }
  });
  return best;
}

function onPointerDown(event) {
  canvas.setPointerCapture(event.pointerId);
  const screen = pointerPosition(event);
  canvas.classList.add("dragging");

  if (state.dragTarget === "point") {
    const pointIndex = hitPoint(screen);
    if (pointIndex !== -1) {
      const world = screenToWorld(screen);
      const currentPoint = points()[pointIndex];
      state.drag = {
        type: "point",
        index: pointIndex,
        dx: currentPoint.x - world.x,
        dy: currentPoint.y - world.y,
      };
      return;
    }
  }

  const discIndex = state.dragTarget === "disc" ? hitDisc(screen) : -1;
  if (discIndex !== -1) {
    const world = screenToWorld(screen);
    if (state.groupDragLocked) {
      state.drag = {
        type: "group",
        start: world,
        discs: state.discs.map((disc) => ({ ...disc })),
      };
      return;
    }

    state.drag = {
      type: "disc",
      index: discIndex,
      dx: state.discs[discIndex].x - world.x,
      dy: state.discs[discIndex].y - world.y,
    };
    return;
  }

  state.drag = {
    type: "pan",
    last: screen,
  };
}

function onPointerMove(event) {
  const screen = pointerPosition(event);

  if (!state.drag) {
    const nextHoverDisc = state.dragTarget === "disc" ? hitDisc(screen) : -1;
    const nextHoverPoint = state.dragTarget === "point" ? hitPoint(screen) : -1;
    if (nextHoverDisc !== state.hoverDisc || nextHoverPoint !== state.hoverPoint) {
      state.hoverDisc = nextHoverDisc;
      state.hoverPoint = nextHoverPoint;
      draw();
    }
    return;
  }

  if (state.drag.type === "group") {
    const world = screenToWorld(screen);
    const dx = world.x - state.drag.start.x;
    const dy = world.y - state.drag.start.y;
    state.discs = state.drag.discs.map((disc) => ({
      x: disc.x + dx,
      y: disc.y + dy,
    }));
  } else if (state.drag.type === "disc") {
    const world = screenToWorld(screen);
    const disc = state.discs[state.drag.index];
    disc.x = world.x + state.drag.dx;
    disc.y = world.y + state.drag.dy;
  } else if (state.drag.type === "point") {
    const world = screenToWorld(screen);
    const basePoint = state.basePoints[state.drag.index];
    state.jitter[state.drag.index] = {
      x: world.x + state.drag.dx - basePoint.x,
      y: world.y + state.drag.dy - basePoint.y,
    };
  } else {
    state.offset.x += screen.x - state.drag.last.x;
    state.offset.y += screen.y - state.drag.last.y;
    state.drag.last = screen;
  }

  draw();
}

function onPointerUp(event) {
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  state.drag = null;
  canvas.classList.remove("dragging");
}

function setDragTarget(target) {
  state.dragTarget = target;
  state.hoverDisc = -1;
  state.hoverPoint = -1;
  canvas.setAttribute(
    "aria-label",
    target === "point"
      ? "Drag the points to test custom ten-point arrangements"
      : "Drag the unit discs to try to cover all ten points",
  );
  dragTargetButtons.forEach((button) => {
    const isActive = button.dataset.dragTarget === target;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  draw();
}

function setSpacing(value) {
  const next = Math.max(0.2, Math.min(3, Number(value) || 1.1));
  state.spacing = next;
  spacing.value = String(next);
  spacingNumber.value = next.toFixed(2);
  regeneratePoints();
  draw();
}

function setScale(value) {
  const next = Math.max(52, Math.min(130, Number(value) || 86));
  state.scale = next;
  scale.value = String(next);
  scaleValue.textContent = String(next);
  draw();
}

function setDragLock(locked) {
  state.groupDragLocked = locked;
  dragLockButton.classList.toggle("active", locked);
  dragLockButton.setAttribute("aria-pressed", String(locked));
  dragLockButton.setAttribute(
    "aria-label",
    locked ? "Discs locked to drag together" : "Discs unlocked for individual dragging",
  );
  dragLockButton.title = locked ? "Discs locked to drag together" : "Discs unlocked for individual dragging";
  dragMode.textContent = locked ? "Grouped" : "Individual";
}

function setLayout(layout) {
  state.layout = layout;
  layoutButtons.forEach((button) => {
    const isActive = button.dataset.layout === layout;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  clearJitter();
  regeneratePoints();
  draw();
}

function jitterPoints() {
  state.jitter = state.jitter.map(() => {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * state.spacing * 0.14;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });
  draw();
}

function clearJitter() {
  state.jitter = Array.from({ length: DISC_COUNT }, () => ({ x: 0, y: 0 }));
}

spacing.addEventListener("input", (event) => setSpacing(event.target.value));
spacingNumber.addEventListener("change", (event) => setSpacing(event.target.value));
scale.addEventListener("input", (event) => setScale(event.target.value));
dragLockButton.addEventListener("click", () => setDragLock(!state.groupDragLocked));
resetDiscsButton.addEventListener("click", () => {
  resetDiscs();
  draw();
});
resetViewButton.addEventListener("click", () => {
  resetView();
  draw();
});
shufflePointsButton.addEventListener("click", jitterPoints);
clearJitterButton.addEventListener("click", () => {
  clearJitter();
  draw();
});
layoutButtons.forEach((button) => {
  button.addEventListener("click", () => setLayout(button.dataset.layout));
});
dragTargetButtons.forEach((button) => {
  button.addEventListener("click", () => setDragTarget(button.dataset.dragTarget));
});

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);
window.addEventListener("resize", resizeCanvas);

regeneratePoints();
resetDiscs();
setDragTarget("disc");
setDragLock(true);
resizeCanvas();
