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

// calibration constants (fit to the reference photo of the assembled set)
const LAT_TOP = 94;       // latitude mapped to row 0
const LAT_BOTTOM = -84;   // latitude mapped to row GRID_H
const LON_CENTER = 10;    // map centered on ~10°E (Africa/Europe)
const LON_SPAN = 360;     // full longitude across the width

const cssW = GRID_W * S;
const cssH = GRID_H * S;
const fullW = cssW + MARGIN * 2;
const fullH = cssH + MARGIN * 2;

const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

// [lon,lat] -> fractional [col,row] on the grid (linear in both)
function project(lon, lat) {
  let dlon = lon - LON_CENTER;
  while (dlon > 180) dlon -= 360;
  while (dlon < -180) dlon += 360;
  const col = ((dlon + LON_SPAN / 2) / LON_SPAN) * GRID_W;
  const row = ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * GRID_H;
  return [col, row];
}
// [col,row] (stud center coords) -> [lon,lat]
function toLonLat(col, row) {
  let lon = LON_CENTER - LON_SPAN / 2 + (col / GRID_W) * LON_SPAN;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  let lat = LAT_TOP - (row / GRID_H) * (LAT_TOP - LAT_BOTTOM);
  lat = Math.max(-89.9, Math.min(89.9, lat)); // keep geoContains valid past the poles
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

function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = fullW * dpr;
  canvas.height = fullH * dpr;
  canvas.style.aspectRatio = `${fullW} / ${fullH}`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

function render() {
  ctx.clearRect(0, 0, fullW, fullH);
  ctx.fillStyle = "#1b212b"; // panel (margins)
  ctx.fillRect(0, 0, fullW, fullH);
  ctx.fillStyle = "#0d2438"; // deep ocean backdrop
  ctx.fillRect(MARGIN, MARGIN, cssW, cssH);

  // stud mosaic
  const useStuds = mode === "photo" && hasStuds;
  const r = S * 0.42;
  for (let row = 0; row < GRID_H; row++) {
    for (let col = 0; col < GRID_W; col++) {
      ctx.beginPath();
      ctx.arc(px(col + 0.5), py(row + 0.5), r, 0, Math.PI * 2);
      ctx.fillStyle = useStuds
        ? studColor(col, row)
        : (landGrid && landGrid[row][col] ? "#eceadd" : "#2b6ca3");
      ctx.fill();
    }
  }

  // highlighted brick (the 16x16 plate the target sits in)
  if (highlight) {
    const pc = Math.floor(highlight.col / BRICK);
    const pr = Math.floor(highlight.row / BRICK);
    ctx.fillStyle = "rgba(255,59,48,0.10)";
    ctx.fillRect(px(pc * BRICK), py(pr * BRICK), BRICK * S, BRICK * S);
  }

  // 16x16 brick grid
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1;
  for (let c = 0; c <= GRID_W; c += BRICK) {
    ctx.beginPath(); ctx.moveTo(px(c), py(0)); ctx.lineTo(px(c), py(GRID_H)); ctx.stroke();
  }
  for (let rr = 0; rr <= GRID_H; rr += BRICK) {
    ctx.beginPath(); ctx.moveTo(px(0), py(rr)); ctx.lineTo(px(GRID_W), py(rr)); ctx.stroke();
  }
  // outer frame
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px(0), py(0), cssW, cssH);

  // plate-number labels (1-8 across, 1-5 down); active plate in accent
  const activeC = highlight ? Math.floor(highlight.col / BRICK) : -1;
  const activeR = highlight ? Math.floor(highlight.row / BRICK) : -1;
  ctx.font = "600 12px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let p = 0; p < GRID_W / BRICK; p++) {
    ctx.fillStyle = p === activeC ? "#ff6b61" : "#9aa6b4";
    ctx.fillText(String(p + 1), px(p * BRICK + BRICK / 2), MARGIN / 2);
  }
  for (let p = 0; p < GRID_H / BRICK; p++) {
    ctx.fillStyle = p === activeR ? "#ff6b61" : "#9aa6b4";
    ctx.fillText(String(p + 1), MARGIN / 2, py(p * BRICK + BRICK / 2));
  }

  // target: crosshair + glowing stud
  if (highlight) {
    const x = px(highlight.col + 0.5);
    const y = py(highlight.row + 0.5);
    ctx.strokeStyle = "rgba(255,59,48,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, py(0)); ctx.lineTo(x, py(GRID_H));
    ctx.moveTo(px(0), y); ctx.lineTo(px(GRID_W), y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, S * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = "#ff3b30";
    ctx.shadowColor = "#ff3b30";
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#fff";
    ctx.beginPath(); ctx.arc(x, y, S * 0.7, 0, Math.PI * 2); ctx.stroke();
  }
}

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
