// LEGO Art World Map (31203): map a place onto the 128x80 stud grid.
// Base projection is Equal Earth, squared into the set's 1.6:1 rectangle by
// fitting the full sphere to the grid with an independent vertical stretch,
// which mirrors what LEGO did to the original (~2.05:1) projection.

const GRID_W = 128;   // studs across (8 bricks of 16)
const GRID_H = 80;    // studs down  (5 bricks of 16)
const BRICK = 16;     // studs per brick edge
const S = 8;          // display pixels per stud

const cssW = GRID_W * S;
const cssH = GRID_H * S;

const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

// Equal Earth, centered on lon 0 (Africa/Europe). Fit the whole sphere to the
// grid box, recording offsets/spans so we can map both ways with a vertical
// stretch applied separately from the horizontal fit.
const sphere = { type: "Sphere" };
const proj = d3.geoEqualEarth();
proj.fitWidth(cssW, sphere);
const b = d3.geoPath(proj).bounds(sphere);
const offX = b[0][0], offY = b[0][1];
const natW = b[1][0] - b[0][0];
const natH = b[1][1] - b[0][1];

// projection-space [x,y] -> canvas pixels (non-uniform: width fit, height stretched)
function toCanvas(lonlat) {
  const p = proj(lonlat);
  return [(p[0] - offX) * (cssW / natW), (p[1] - offY) * (cssH / natH)];
}
// canvas pixels -> [lon,lat] (inverse of the above)
function toLonLat(cx, cy) {
  return proj.invert([cx * (natW / cssW) + offX, cy * (natH / cssH) + offY]);
}

// place -> nearest stud, 0-indexed, clamped to the grid
function studFor(lonlat) {
  const [cx, cy] = toCanvas(lonlat);
  const col = Math.max(0, Math.min(GRID_W - 1, Math.floor(cx / S)));
  const row = Math.max(0, Math.min(GRID_H - 1, Math.floor(cy / S)));
  return { col, row };
}

let landGrid = null; // landGrid[row][col] = true if that stud center is over land
let highlight = null;

function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.aspectRatio = `${GRID_W} / ${GRID_H}`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function render() {
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = "#0d2438"; // deep ocean backdrop
  ctx.fillRect(0, 0, cssW, cssH);

  const r = S * 0.42;
  for (let row = 0; row < GRID_H; row++) {
    for (let col = 0; col < GRID_W; col++) {
      const land = landGrid && landGrid[row][col];
      ctx.beginPath();
      ctx.arc((col + 0.5) * S, (row + 0.5) * S, r, 0, Math.PI * 2);
      ctx.fillStyle = land ? "#eceadd" : "#2b6ca3";
      ctx.fill();
    }
  }

  // faint brick (16x16) boundaries
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  for (let c = 0; c <= GRID_W; c += BRICK) {
    ctx.beginPath(); ctx.moveTo(c * S, 0); ctx.lineTo(c * S, cssH); ctx.stroke();
  }
  for (let rr = 0; rr <= GRID_H; rr += BRICK) {
    ctx.beginPath(); ctx.moveTo(0, rr * S); ctx.lineTo(cssW, rr * S); ctx.stroke();
  }

  if (highlight) {
    const x = (highlight.col + 0.5) * S;
    const y = (highlight.row + 0.5) * S;
    // crosshair
    ctx.strokeStyle = "rgba(255,59,48,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cssH); ctx.moveTo(0, y); ctx.lineTo(cssW, y); ctx.stroke();
    // glowing stud
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

function buildLandGrid(land) {
  const grid = [];
  for (let row = 0; row < GRID_H; row++) {
    const line = [];
    for (let col = 0; col < GRID_W; col++) {
      const ll = toLonLat((col + 0.5) * S, (row + 0.5) * S);
      line.push(ll ? d3.geoContains(land, ll) : false);
    }
    grid.push(line);
  }
  return grid;
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
    highlight = studFor([lon, lat]);
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

(async function init() {
  setupCanvas();
  statusEl.textContent = "Loading map…";
  render(); // ocean + grid while land loads
  try {
    const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json");
    const land = topojson.feature(world, world.objects.land);
    landGrid = buildLandGrid(land);
    render();
    statusEl.textContent = "";
  } catch (err) {
    statusEl.className = "status error";
    statusEl.textContent = "Could not load coastline data; the grid still works.";
  }
})();
