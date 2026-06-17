const UNIT_RADIUS = 1;
const DISC_COUNT = 10;
const DEFAULT_POINT_COUNT = 10;
const POINT_COUNT_MIN = 10;
const POINT_COUNT_MAX = 100;
const OVERLAP_EPSILON = 0.002;
const COVER_EPSILON = 0.0005;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const LINE_POINT_MIN_SCREEN_GAP = 4;
const HARD_RING_SPACING_ANCHOR = 1.1;
const HARD_RING_RADII = [0.1, 0.721, 1.0001];

const canvas = document.querySelector("#scene");
const ctx = canvas.getContext("2d");

const spacing = document.querySelector("#spacing");
const spacingNumber = document.querySelector("#spacingNumber");
const pointCount = document.querySelector("#pointCount");
const pointCountNumber = document.querySelector("#pointCountNumber");
const scale = document.querySelector("#scale");
const scaleValue = document.querySelector("#scaleValue");
const drawLineButton = document.querySelector("#drawLine");
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
  pointCount: DEFAULT_POINT_COUNT,
  scale: 86,
  offset: { x: 0, y: 0 },
  discs: [],
  basePoints: [],
  jitter: Array.from({ length: DEFAULT_POINT_COUNT }, () => ({ x: 0, y: 0 })),
  drag: null,
  hoverDisc: -1,
  hoverPoint: -1,
  dragTarget: "disc",
  groupDragLocked: true,
  lineDrawMode: false,
  lineDraft: null,
  customLine: null,
  lastNudgeTarget: null,
};

function createDefaultTenLatticePoints(step) {
  const h = (Math.sqrt(3) / 2) * step;
  const rows = [3, 4, 3];
  const offsets = [0, 0, 0];
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

function createLatticePoints(step, count) {
  if (count === DEFAULT_POINT_COUNT) return createDefaultTenLatticePoints(step);

  const h = (Math.sqrt(3) / 2) * step;
  const points = [];
  const searchRadius = Math.ceil(Math.sqrt(count)) + 3;

  for (let row = -searchRadius; row <= searchRadius; row += 1) {
    for (let col = -searchRadius; col <= searchRadius; col += 1) {
      points.push({
        x: (col + row / 2) * step,
        y: row * h,
      });
    }
  }

  points.sort((a, b) => {
    const da = a.x * a.x + a.y * a.y;
    const db = b.x * b.x + b.y * b.y;
    return da - db || a.y - b.y || a.x - b.x;
  });

  return centerPoints(points.slice(0, count));
}

function createRingPoints(chord, count) {
  const radius = chord / (2 * Math.sin(Math.PI / count));
  return centerPoints(
    Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
    }),
  );
}

function createLinePoints(step, count) {
  const points = Array.from({ length: count }, (_, index) => ({
    x: (index - (count - 1) / 2) * step,
    y: Math.sin(index * 1.7) * step * 0.11,
  }));
  return centerPoints(points);
}

function splitHardRingCounts(count) {
  const inner = Math.min(count, Math.max(3, Math.round(count / 15)));
  const remaining = count - inner;
  const middle = Math.floor(remaining / 2);
  const outer = remaining - middle;
  return [inner, middle, outer];
}

function hardRingScale(step) {
  return step / HARD_RING_SPACING_ANCHOR;
}

function hardRingRadii(step) {
  const scale = hardRingScale(step);
  return HARD_RING_RADII.map((radius) => radius * scale);
}

function createCircleRingPoints(radius, count, phase) {
  if (count <= 0) return [];

  return Array.from({ length: count }, (_, index) => {
    const angle = phase + (index / count) * Math.PI * 2;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });
}

function createHardRingPoints(step, count) {
  const phase = -Math.PI / 2;
  const counts = splitHardRingCounts(count);
  const radii = hardRingRadii(step);
  const points = radii.flatMap((radius, index) => createCircleRingPoints(radius, counts[index], phase));
  return centerPoints(points);
}

function ishiangVirtualCircles() {
  const h = Math.sqrt(3);
  return [
    { x: -1, y: 0, radius: 1 },
    { x: 1, y: 0, radius: 1 },
    { x: 0, y: h, radius: 1 },
  ];
}

function ishiangCenterPoint() {
  const circles = ishiangVirtualCircles();
  return {
    x: circles.reduce((sum, circle) => sum + circle.x, 0) / circles.length,
    y: circles.reduce((sum, circle) => sum + circle.y, 0) / circles.length,
  };
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function pointOnCircle(circle, angle) {
  return {
    x: circle.x + Math.cos(angle) * circle.radius,
    y: circle.y + Math.sin(angle) * circle.radius,
  };
}

function splitIShiangCounts(count) {
  const distributed = Math.max(0, count - 1);
  const base = Math.floor(distributed / 3);
  const remainder = distributed % 3;
  return [0, 1, 2].map((index) => base + (index < remainder ? 1 : 0));
}

function createInteriorCirclePoints(circle, count, phase) {
  if (count <= 0) return [];

  return Array.from({ length: count }, (_, index) => {
    const radius = circle.radius * 0.68 * Math.sqrt((index + 0.5) / count);
    const angle = phase + index * GOLDEN_ANGLE;
    return {
      x: circle.x + Math.cos(angle) * radius,
      y: circle.y + Math.sin(angle) * radius,
    };
  });
}

function createIShiangCirclePoints(circle, count, phase) {
  if (count <= 0) return [];

  const perimeterCount = Math.min(count, Math.max(3, Math.ceil(count / 2)));
  const interiorCount = count - perimeterCount;
  const perimeter = Array.from({ length: perimeterCount }, (_, index) => {
    const angle = phase + (index / perimeterCount) * Math.PI * 2;
    return {
      x: circle.x + Math.cos(angle) * circle.radius,
      y: circle.y + Math.sin(angle) * circle.radius,
    };
  });

  return [...perimeter, ...createInteriorCirclePoints(circle, interiorCount, phase + Math.PI / perimeterCount)];
}

function createTenIShiangPoints() {
  const circles = ishiangVirtualCircles();
  const sharedTangentPoints = [
    midpoint(circles[0], circles[1]),
    midpoint(circles[0], circles[2]),
    midpoint(circles[1], circles[2]),
  ];
  const uniquePerimeterPoints = [
    pointOnCircle(circles[2], Math.PI / 3),
    pointOnCircle(circles[0], (2 * Math.PI) / 3),
    pointOnCircle(circles[0], (4 * Math.PI) / 3),
    pointOnCircle(circles[1], (4 * Math.PI) / 3),
    pointOnCircle(circles[1], 0),
    pointOnCircle(circles[2], (2 * Math.PI) / 3),
  ];

  return [...sharedTangentPoints, ...uniquePerimeterPoints, ishiangCenterPoint()];
}

function createIShiangPoints(_step, count) {
  if (count === DEFAULT_POINT_COUNT) return createTenIShiangPoints();

  const counts = splitIShiangCounts(count);
  const circles = ishiangVirtualCircles();
  const points = circles.flatMap((circle, index) => createIShiangCirclePoints(circle, counts[index], (index * Math.PI * 2) / 3));
  points.push(ishiangCenterPoint());
  return points;
}

function pathPoints(line) {
  if (Array.isArray(line?.points) && line.points.length > 0) return line.points;
  if (line?.start && line?.end) return [line.start, line.end];
  return [];
}

function pathLength(path) {
  let length = 0;
  for (let index = 1; index < path.length; index += 1) {
    length += distance(path[index - 1], path[index]);
  }
  return length;
}

function pointAtPathDistance(path, targetDistance) {
  if (path.length === 0) return { x: 0, y: 0 };
  if (path.length === 1 || targetDistance <= 0) return { ...path[0] };

  let traveled = 0;
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const segmentLength = distance(start, end);
    if (segmentLength === 0) continue;

    const nextTraveled = traveled + segmentLength;
    if (targetDistance <= nextTraveled) {
      const t = (targetDistance - traveled) / segmentLength;
      return {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      };
    }

    traveled = nextTraveled;
  }

  return { ...path[path.length - 1] };
}

function createDrawnLinePoints(line, _step, count) {
  const path = pathPoints(line);
  const length = pathLength(path);
  if (length === 0) {
    const fallback = path[0] ?? { x: 0, y: 0 };
    return Array.from({ length: count }, () => ({ ...fallback }));
  }

  const spacing = length / count;
  return Array.from({ length: count }, (_, index) => pointAtPathDistance(path, spacing * (index + 0.5)));
}

function centerPoints(points) {
  const bounds = getBounds(points);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return points.map((point) => ({ x: point.x - cx, y: point.y - cy }));
}

function createPackedDiscs() {
  const h = Math.sqrt(3);
  const rows = [3, 4, 3];
  const offsets = [0, 0, 0];
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
  if (state.layout === "drawnLine" && state.customLine) {
    state.basePoints = createDrawnLinePoints(state.customLine, state.spacing, state.pointCount);
    syncJitterLength();
    return;
  }

  const generators = {
    lattice: createLatticePoints,
    ishiang: createIShiangPoints,
    hardRings: createHardRingPoints,
    ring: createRingPoints,
    line: createLinePoints,
  };
  state.basePoints = generators[state.layout](state.spacing, state.pointCount);
  syncJitterLength();
}

function points() {
  return state.basePoints.map((point, index) => ({
    x: point.x + (state.jitter[index]?.x ?? 0),
    y: point.y + (state.jitter[index]?.y ?? 0),
  }));
}

function syncJitterLength() {
  state.jitter = Array.from({ length: state.pointCount }, (_, index) => state.jitter[index] ?? { x: 0, y: 0 });
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

function drawLineGuide() {
  const line = state.lineDraft || state.customLine;
  if (!line) return;

  const screenPath = pathPoints(line).map(worldToScreen);
  if (screenPath.length === 0) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = state.lineDraft ? 2.5 : 2;
  ctx.strokeStyle = state.lineDraft ? "#1d5fd0" : "rgba(29, 95, 208, 0.72)";
  ctx.beginPath();
  ctx.moveTo(screenPath[0].x, screenPath[0].y);
  screenPath.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.stroke();

  [screenPath[0], screenPath[screenPath.length - 1]].forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#1d5fd0";
    ctx.stroke();
  });
  ctx.restore();
}

function drawIShiangGuide() {
  if (state.layout !== "ishiang") return;

  ctx.save();
  ishiangVirtualCircles().forEach((circle) => {
    const center = worldToScreen(circle);
    const radius = circle.radius * state.scale;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(29, 95, 208, 0.045)";
    ctx.strokeStyle = "rgba(29, 95, 208, 0.45)";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  });

  const middle = worldToScreen(ishiangCenterPoint());
  ctx.beginPath();
  ctx.arc(middle.x, middle.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(29, 95, 208, 0.75)";
  ctx.stroke();
  ctx.restore();
}

function drawHardRingGuide() {
  if (state.layout !== "hardRings") return;

  ctx.save();
  hardRingRadii(state.spacing).forEach((radius, index) => {
    const center = worldToScreen({ x: 0, y: 0 });
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius * state.scale, 0, Math.PI * 2);
    ctx.strokeStyle = index === HARD_RING_RADII.length - 1 ? "rgba(29, 95, 208, 0.48)" : "rgba(29, 95, 208, 0.28)";
    ctx.lineWidth = index === HARD_RING_RADII.length - 1 ? 2 : 1.5;
    ctx.stroke();
  });
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
    const baseRadius = state.pointCount > 60 ? 4 : state.pointCount > 30 ? 5 : covered ? 7 : 6;
    const showLabel = state.pointCount <= 40 || isHover;

    ctx.save();
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, isHover ? 10 : baseRadius, 0, Math.PI * 2);
    ctx.fillStyle = covered ? "#138a58" : "#1d5fd0";
    ctx.shadowColor = covered ? "rgba(19, 138, 88, 0.28)" : "rgba(29, 95, 208, 0.25)";
    ctx.shadowBlur = 10;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = isHover ? "#df8f24" : "#fffdf7";
    ctx.stroke();

    if (showLabel) {
      ctx.fillStyle = "#18212b";
      ctx.font = "800 11px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(index + 1), screen.x, screen.y - 17);
    }
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
  drawIShiangGuide();
  drawHardRingGuide();
  drawLineGuide();
  drawPoints(currentPoints);
  drawScale();
  updateReadouts(covered, overlaps.length, gap);
}

function updateReadouts(covered, overlaps, gap) {
  coveredCount.textContent = `${covered}/${state.pointCount}`;
  overlapCount.textContent = String(overlaps);
  pointGap.textContent = Number.isFinite(gap) ? gap.toFixed(2) : "--";
  coverageStatus.textContent = `${covered} / ${state.pointCount} covered`;
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

function appendLineDraftPoint(world, force = false) {
  if (!state.lineDraft) return;

  const path = state.lineDraft.points;
  const last = path[path.length - 1];
  const minGap = LINE_POINT_MIN_SCREEN_GAP / state.scale;
  if (force || !last || distance(last, world) >= minGap) {
    path.push(world);
  } else if (path.length > 1) {
    path[path.length - 1] = world;
  }
}

function rememberNudgeTarget(target) {
  state.lastNudgeTarget = target;
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

function nudgeLastDragged(delta) {
  const target = state.lastNudgeTarget;
  if (!target) return false;

  if (target.type === "group") {
    state.discs = state.discs.map((disc) => ({
      x: disc.x + delta.x,
      y: disc.y + delta.y,
    }));
    draw();
    return true;
  }

  if (target.type === "disc") {
    const disc = state.discs[target.index];
    if (!disc) return false;
    disc.x += delta.x;
    disc.y += delta.y;
    draw();
    return true;
  }

  if (target.type === "point") {
    if (!state.basePoints[target.index]) return false;
    state.jitter[target.index] = state.jitter[target.index] ?? { x: 0, y: 0 };
    state.jitter[target.index].x += delta.x;
    state.jitter[target.index].y += delta.y;
    draw();
    return true;
  }

  return false;
}

function onKeyDown(event) {
  if (isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;

  const pixel = 1 / state.scale;
  const deltas = {
    ArrowUp: { x: 0, y: -pixel },
    ArrowDown: { x: 0, y: pixel },
    ArrowLeft: { x: -pixel, y: 0 },
    ArrowRight: { x: pixel, y: 0 },
  };
  const delta = deltas[event.key];
  if (!delta) return;

  if (nudgeLastDragged(delta)) {
    event.preventDefault();
  }
}

function onPointerDown(event) {
  canvas.setPointerCapture(event.pointerId);
  const screen = pointerPosition(event);
  canvas.classList.add("dragging");

  if (state.lineDrawMode) {
    const world = screenToWorld(screen);
    state.lineDraft = {
      points: [world],
    };
    state.drag = {
      type: "line",
    };
    draw();
    return;
  }

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
      rememberNudgeTarget({ type: "point", index: pointIndex });
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
      rememberNudgeTarget({ type: "group" });
      return;
    }

    state.drag = {
      type: "disc",
      index: discIndex,
      dx: state.discs[discIndex].x - world.x,
      dy: state.discs[discIndex].y - world.y,
    };
    rememberNudgeTarget({ type: "disc", index: discIndex });
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
  } else if (state.drag.type === "line") {
    appendLineDraftPoint(screenToWorld(screen));
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
  if (state.drag?.type === "line" && state.lineDraft) {
    appendLineDraftPoint(screenToWorld(pointerPosition(event)), true);
    const length = pathLength(state.lineDraft.points);
    if (length > 0.12) {
      applyDrawnLine(state.lineDraft.points);
    }
    state.lineDraft = null;
    setLineDrawMode(false);
  }

  state.drag = null;
  canvas.classList.remove("dragging");
  draw();
}

function updateCanvasAria() {
  if (state.lineDrawMode) {
    canvas.setAttribute("aria-label", "Draw a freehand path to place equally spaced points");
    return;
  }

  canvas.setAttribute(
    "aria-label",
    state.dragTarget === "point"
      ? "Drag the points to test custom point arrangements"
      : "Drag the unit discs to try to cover all points",
  );
}

function updateLayoutButtons() {
  layoutButtons.forEach((button) => {
    const isActive = button.dataset.layout === state.layout;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function setDragTarget(target) {
  state.dragTarget = target;
  state.hoverDisc = -1;
  state.hoverPoint = -1;
  if (state.lineDrawMode) setLineDrawMode(false);
  updateCanvasAria();
  dragTargetButtons.forEach((button) => {
    const isActive = button.dataset.dragTarget === target;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  draw();
}

function setLineDrawMode(active) {
  state.lineDrawMode = active;
  state.hoverDisc = -1;
  state.hoverPoint = -1;
  drawLineButton.classList.toggle("active", active);
  drawLineButton.setAttribute("aria-pressed", String(active));
  drawLineButton.textContent = active ? "Drawing line" : state.customLine ? "Redraw line" : "Draw line";
  updateCanvasAria();
  draw();
}

function applyDrawnLine(path) {
  state.layout = "drawnLine";
  state.customLine = {
    points: path.map((point) => ({ ...point })),
  };
  clearJitter();
  updateLayoutButtons();
  regeneratePoints();
}

function setSpacing(value) {
  const next = Math.max(0.2, Math.min(3, Number(value) || 1.1));
  state.spacing = next;
  spacing.value = String(next);
  spacingNumber.value = next.toFixed(2);
  regeneratePoints();
  draw();
}

function setPointCount(value) {
  const parsed = Number.parseInt(value, 10);
  const next = Math.max(POINT_COUNT_MIN, Math.min(POINT_COUNT_MAX, Number.isFinite(parsed) ? parsed : DEFAULT_POINT_COUNT));
  state.pointCount = next;
  pointCount.value = String(next);
  pointCountNumber.value = String(next);
  if (state.hoverPoint >= next) state.hoverPoint = -1;
  if (state.lastNudgeTarget?.type === "point" && state.lastNudgeTarget.index >= next) state.lastNudgeTarget = null;
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
  state.customLine = null;
  updateLayoutButtons();
  setLineDrawMode(false);
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
  state.jitter = Array.from({ length: state.pointCount }, () => ({ x: 0, y: 0 }));
}

spacing.addEventListener("input", (event) => setSpacing(event.target.value));
spacingNumber.addEventListener("change", (event) => setSpacing(event.target.value));
spacingNumber.addEventListener("keydown", (event) => {
  if (event.key === "Enter") setSpacing(event.target.value);
});
pointCount.addEventListener("input", (event) => setPointCount(event.target.value));
pointCountNumber.addEventListener("change", (event) => setPointCount(event.target.value));
pointCountNumber.addEventListener("keydown", (event) => {
  if (event.key === "Enter") setPointCount(event.target.value);
});
scale.addEventListener("input", (event) => setScale(event.target.value));
drawLineButton.addEventListener("click", () => setLineDrawMode(!state.lineDrawMode));
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
window.addEventListener("keydown", onKeyDown);
window.addEventListener("resize", resizeCanvas);

regeneratePoints();
resetDiscs();
setDragTarget("disc");
setDragLock(true);
resizeCanvas();
