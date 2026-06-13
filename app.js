// LEGO Art World Map (31203): map a place onto the 128x80 stud grid.
//
// The set squares the map into the rectangle with linear longitude (full
// width, straight sides) and linear latitude. The latitude/longitude bounds
// below were fit (93% stud agreement) against a photo of the built set:
// latTop>90 reproduces the Arctic ocean margin at the top, and the wide
// southern bound gives the set's large Antarctica strip.

const GRID_W = 128;   // studs across (8 bricks of 16)
const GRID_H = 80;    // studs down  (5 bricks of 16)
const BRICK = 16;     // studs per brick edge
const S = 8;          // display pixels per stud
const MARGIN = 24;    // gutter for plate-number labels

// calibration constants (fit to the reference photo of the assembled set,
// ~95% stud agreement outside Antarctica). Longitude is linear; latitude is
// piecewise-linear with the equator at ROW_EQ, since the set scales the
// southern hemisphere slightly more than the northern.
const LAT_TOP = 93.56;     // latitude at row 0
const LAT_BOTTOM = -90.78; // latitude at row GRID_H (southern scale)
const ROW_EQ = 41.79;      // row of the equator
const LON_CENTER = 11.38;  // map centered on ~11°E (Africa/Europe)
const LON_SPAN = 359.88;   // full longitude across the width

const cssW = GRID_W * S;
const cssH = GRID_H * S;
const fullW = cssW + MARGIN * 2;
const fullH = cssH + MARGIN * 2;

const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

// piecewise-linear latitude: row 0 -> LAT_TOP, ROW_EQ -> 0, GRID_H -> LAT_BOTTOM
function rowToLat(y) {
  return y < ROW_EQ
    ? LAT_TOP * (1 - y / ROW_EQ)
    : LAT_BOTTOM * ((y - ROW_EQ) / (GRID_H - ROW_EQ));
}
function latToRow(lat) {
  return lat >= 0
    ? ROW_EQ * (1 - lat / LAT_TOP)
    : ROW_EQ + (lat / LAT_BOTTOM) * (GRID_H - ROW_EQ);
}
// [lon,lat] -> fractional [col,row] on the grid
function project(lon, lat) {
  let dlon = lon - LON_CENTER;
  while (dlon > 180) dlon -= 360;
  while (dlon < -180) dlon += 360;
  return [((dlon + LON_SPAN / 2) / LON_SPAN) * GRID_W, latToRow(lat)];
}
// [col,row] (stud center coords) -> [lon,lat]
function toLonLat(col, row) {
  let lon = LON_CENTER - LON_SPAN / 2 + (col / GRID_W) * LON_SPAN;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  const lat = Math.max(-89.9, Math.min(89.9, rowToLat(row))); // keep geoContains valid past the poles
  return [lon, lat];
}
// place -> nearest stud, 0-indexed, clamped to the grid
function studFor(lon, lat) {
  const [c, r] = project(lon, lat);
  return {
    col: Math.max(0, Math.min(GRID_W - 1, Math.floor(c))),
    row: Math.max(0, Math.min(GRID_H - 1, Math.floor(r))),
  };
}

// stud index -> pixel center on the (margined) canvas
const px = (col) => MARGIN + col * S;
const py = (row) => MARGIN + row * S;

let landGrid = null;   // geographic mode: boolean land/ocean per stud
let mode = "photo";    // "photo" (LEGO stud colours) | "geo" (land/ocean)
let highlight = null;

// stud colours baked in via studs.js (STUD_PALETTE + STUD_GRID)
const hasStuds = typeof STUD_PALETTE !== "undefined";
const studColor = (col, row) => STUD_PALETTE[STUD_GRID.charCodeAt(row * GRID_W + col) - 48];

// the map is drawn once to an offscreen canvas; the visible canvas blits it
// and overlays the magnifier, so pointer moves don't re-render the mosaic.
const base = document.createElement("canvas");
const bctx = base.getContext("2d");
let DPR = 1;
let lens = null;          // { x, y } in logical canvas coords, or null
const LENS_R = 144;       // lens radius (logical px)
const LENS_Z = 3.2;       // magnification

function setupCanvas() {
  DPR = window.devicePixelRatio || 1;
  for (const cv of [canvas, base]) { cv.width = fullW * DPR; cv.height = fullH * DPR; }
  canvas.style.aspectRatio = `${fullW} / ${fullH}`;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

// land-110m has no inland water, so lakes (Great Lakes etc.) read as land
// unless we subtract them.
function buildLandGrid(land, lakes) {
  const grid = [];
  for (let row = 0; row < GRID_H; row++) {
    const line = [];
    for (let col = 0; col < GRID_W; col++) {
      const ll = toLonLat(col + 0.5, row + 0.5);
      const isLand = d3.geoContains(land, ll) && !(lakes && d3.geoContains(lakes, ll));
      line.push(isLand);
    }
    grid.push(line);
  }
  return grid;
}

// draw the whole map to the offscreen canvas, then composite to the screen
function render() {
  bctx.clearRect(0, 0, fullW, fullH);
  bctx.fillStyle = "#1b212b"; // panel (margins)
  bctx.fillRect(0, 0, fullW, fullH);
  bctx.fillStyle = "#0d2438"; // deep ocean backdrop
  bctx.fillRect(MARGIN, MARGIN, cssW, cssH);

  // stud mosaic
  const useStuds = mode === "photo" && hasStuds;
  const r = S * 0.42;
  for (let row = 0; row < GRID_H; row++) {
    for (let col = 0; col < GRID_W; col++) {
      bctx.beginPath();
      bctx.arc(px(col + 0.5), py(row + 0.5), r, 0, Math.PI * 2);
      bctx.fillStyle = useStuds
        ? studColor(col, row)
        : (landGrid && landGrid[row][col] ? "#eceadd" : "#2b6ca3");
      bctx.fill();
    }
  }

  // highlighted brick (the 16x16 plate the target sits in)
  if (highlight) {
    const pc = Math.floor(highlight.col / BRICK);
    const pr = Math.floor(highlight.row / BRICK);
    bctx.fillStyle = "rgba(255,59,48,0.10)";
    bctx.fillRect(px(pc * BRICK), py(pr * BRICK), BRICK * S, BRICK * S);
  }

  // 16x16 brick grid
  bctx.strokeStyle = "rgba(255,255,255,0.28)";
  bctx.lineWidth = 1;
  for (let c = 0; c <= GRID_W; c += BRICK) {
    bctx.beginPath(); bctx.moveTo(px(c), py(0)); bctx.lineTo(px(c), py(GRID_H)); bctx.stroke();
  }
  for (let rr = 0; rr <= GRID_H; rr += BRICK) {
    bctx.beginPath(); bctx.moveTo(px(0), py(rr)); bctx.lineTo(px(GRID_W), py(rr)); bctx.stroke();
  }
  // outer frame
  bctx.strokeStyle = "rgba(255,255,255,0.5)";
  bctx.lineWidth = 1.5;
  bctx.strokeRect(px(0), py(0), cssW, cssH);

  // plate-number labels (1-8 across, 1-5 down); active plate in accent
  const activeC = highlight ? Math.floor(highlight.col / BRICK) : -1;
  const activeR = highlight ? Math.floor(highlight.row / BRICK) : -1;
  bctx.font = "600 12px -apple-system, system-ui, sans-serif";
  bctx.textAlign = "center";
  bctx.textBaseline = "middle";
  for (let p = 0; p < GRID_W / BRICK; p++) {
    bctx.fillStyle = p === activeC ? "#ff6b61" : "#9aa6b4";
    bctx.fillText(String(p + 1), px(p * BRICK + BRICK / 2), MARGIN / 2);
  }
  for (let p = 0; p < GRID_H / BRICK; p++) {
    bctx.fillStyle = p === activeR ? "#ff6b61" : "#9aa6b4";
    bctx.fillText(String(p + 1), MARGIN / 2, py(p * BRICK + BRICK / 2));
  }

  // target: crosshair + glowing stud
  if (highlight) {
    const x = px(highlight.col + 0.5);
    const y = py(highlight.row + 0.5);
    bctx.strokeStyle = "rgba(255,59,48,0.55)";
    bctx.lineWidth = 1.5;
    bctx.beginPath();
    bctx.moveTo(x, py(0)); bctx.lineTo(x, py(GRID_H));
    bctx.moveTo(px(0), y); bctx.lineTo(px(GRID_W), y);
    bctx.stroke();
    bctx.beginPath();
    bctx.arc(x, y, S * 0.7, 0, Math.PI * 2);
    bctx.fillStyle = "#ff3b30";
    bctx.shadowColor = "#ff3b30";
    bctx.shadowBlur = 14;
    bctx.fill();
    bctx.shadowBlur = 0;
    bctx.lineWidth = 2;
    bctx.strokeStyle = "#fff";
    bctx.beginPath(); bctx.arc(x, y, S * 0.7, 0, Math.PI * 2); bctx.stroke();
  }

  paint();
}

// blit the offscreen map to the screen, then draw the magnifier if active
function paint() {
  ctx.clearRect(0, 0, fullW, fullH);
  ctx.drawImage(base, 0, 0, fullW, fullH);
  if (lens) drawLens();
}

function drawLens() {
  const { x, y } = lens;
  const srcR = LENS_R / LENS_Z;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, LENS_R, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#0d2438";
  ctx.fillRect(x - LENS_R, y - LENS_R, LENS_R * 2, LENS_R * 2);
  // magnified slice of the offscreen map (source rect is in device pixels)
  ctx.drawImage(
    base,
    (x - srcR) * DPR, (y - srcR) * DPR, srcR * 2 * DPR, srcR * 2 * DPR,
    x - LENS_R, y - LENS_R, LENS_R * 2, LENS_R * 2
  );
  // thin crosshair marking the exact sampled point
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y);
  ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9);
  ctx.stroke();
  ctx.restore();
  // lens rim
  ctx.beginPath(); ctx.arc(x, y, LENS_R, 0, Math.PI * 2);
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.stroke();
  ctx.lineWidth = 1; ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.stroke();
  // under-cursor stud caption
  const col = Math.floor((x - MARGIN) / S), row = Math.floor((y - MARGIN) / S);
  if (col >= 0 && col < GRID_W && row >= 0 && row < GRID_H) {
    const label = `${col + 1} × ${row + 1}`;
    ctx.font = "600 12px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const tw = ctx.measureText(label).width + 14;
    const cy = y - LENS_R - 13; // caption above the lens
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(x - tw / 2, cy - 10, tw, 20);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x, cy);
  }
}

function lensFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * fullW;
  const y = ((e.clientY - rect.top) / rect.height) * fullH;
  if (x < MARGIN || x > MARGIN + cssW || y < MARGIN || y > MARGIN + cssH) return null;
  return { x, y };
}
canvas.addEventListener("pointermove", (e) => { lens = lensFromEvent(e); paint(); });
canvas.addEventListener("pointerleave", () => { lens = null; paint(); });

function showResult(name, lon, lat, stud) {
  const col1 = stud.col + 1, row1 = stud.row + 1;
  const plateC = Math.floor(stud.col / BRICK) + 1;
  const plateR = Math.floor(stud.row / BRICK) + 1;
  const localC = (stud.col % BRICK) + 1;
  const localR = (stud.row % BRICK) + 1;

  document.getElementById("place-name").textContent = name;
  document.getElementById("r-stud").textContent = `${col1} × ${row1}`;
  document.getElementById("r-plate").textContent = `col ${plateC} of 8, row ${plateR} of 5`;
  document.getElementById("r-local").textContent = `${localC} × ${localR}`;
  document.getElementById("r-coord").textContent =
    `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
  resultEl.classList.remove("hidden");
}

async function geocode(q) {
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q);
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error("Geocoding service error (" + res.status + ")");
  const data = await res.json();
  if (!data.length) throw new Error("No place found for that name.");
  const hit = data[0];
  return { name: hit.display_name, lon: +hit.lon, lat: +hit.lat };
}

const form = document.getElementById("search");
const input = document.getElementById("query");
const button = form.querySelector("button");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;
  button.disabled = true;
  statusEl.className = "status";
  statusEl.textContent = "Looking up “" + q + "”…";
  try {
    const { name, lon, lat } = await geocode(q);
    highlight = studFor(lon, lat);
    render();
    showResult(name, lon, lat, highlight);
    statusEl.textContent = "";
  } catch (err) {
    statusEl.className = "status error";
    statusEl.textContent = err.message || "Something went wrong.";
  } finally {
    button.disabled = false;
  }
});

function setMode(next) {
  mode = next;
  document.getElementById("mode-photo").classList.toggle("active", mode === "photo");
  document.getElementById("mode-geo").classList.toggle("active", mode === "geo");
  render();
}
document.getElementById("mode-photo").addEventListener("click", () => setMode("photo"));
document.getElementById("mode-geo").addEventListener("click", () => setMode("geo"));

(async function init() {
  setupCanvas();
  statusEl.textContent = "Loading map…";
  render(); // LEGO stud colours are baked in, so this paints immediately

  try {
    const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json");
    const land = topojson.feature(world, world.objects.land);
    const lakes = await d3.json("https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_110m_lakes.geojson").catch(() => null);
    landGrid = buildLandGrid(land, lakes);
    render();
    statusEl.textContent = "";
  } catch (err) {
    // LEGO mode still works offline; only Geographic mode needs this data
    statusEl.className = "status error";
    statusEl.textContent = hasStuds ? "" : "Could not load map data.";
  }
})();
