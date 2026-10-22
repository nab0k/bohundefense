/* BOHUN Atmosphere 2.2 — halftone cartography on canvas.
 * Real Natural Earth outlines from /atlas/countries.geojson, Web Mercator.
 * Draws only geometry and the points it is given; it never invents locations.
 */
const RAD = Math.PI / 180;
const mercY = lat => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * RAD / 2));

export function projector(bbox, w, h) {
  const [lon0, lat0, lon1, lat1] = bbox;
  const x0 = lon0 * RAD, x1 = lon1 * RAD, y0 = mercY(lat0), y1 = mercY(lat1);
  const s = Math.max(w / (x1 - x0), h / (y1 - y0));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const fn = (lon, lat) => [w / 2 + (lon * RAD - cx) * s, h / 2 - (mercY(lat) - cy) * s];
  fn.kmPerPx = lat => (6371 / s) * Math.cos(lat * RAD);
  return fn;
}

function rings(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

const BOUNDS = new WeakMap();
function boundsOf(f) {
  let b = BOUNDS.get(f);
  if (!b) {
    b = [180, 90, -180, -90];
    for (const poly of rings(f.geometry)) for (const [lon, lat] of poly[0]) { if (lon < b[0]) b[0] = lon; if (lat < b[1]) b[1] = lat; if (lon > b[2]) b[2] = lon; if (lat > b[3]) b[3] = lat; }
    BOUNDS.set(f, b);
  }
  return b;
}
function inView(features, bbox) {
  const [x0, y0, x1, y1] = bbox, mx = (x1 - x0) * 0.25, my = (y1 - y0) * 0.25;
  return features.filter(f => { const b = boundsOf(f); return b[2] >= x0 - mx && b[0] <= x1 + mx && b[3] >= y0 - my && b[1] <= y1 + my; });
}

function pathFor(ctx, features, proj, filter) {
  ctx.beginPath();
  for (const f of features) {
    if (filter && !filter(f)) continue;
    for (const poly of rings(f.geometry)) for (const ring of poly) {
      ring.forEach(([lon, lat], i) => { const [x, y] = proj(lon, lat); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
    }
  }
}

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} o  bbox [lon0,lat0,lon1,lat1]; features; style 'hero'|'card'|'footprint';
 *                    highlight ISO a3 to tint; markers [{lon,lat,kind:'hq'|'company'|'muted'}]
 */
export function drawHalftone(canvas, o) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return null;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const proj = projector(o.bbox, w, h);
  const features = inView(o.features, o.bbox);
  const water = css('--water') || '#d6e9f6', land = css('--land') || '#f6f4ef';
  const hero = o.style === 'hero', shape = o.style === 'shape';

  // Land mask
  const mask = document.createElement('canvas'); mask.width = canvas.width; mask.height = canvas.height;
  const m = mask.getContext('2d', { willReadFrequently: true }); m.setTransform(dpr, 0, 0, dpr, 0, 0);
  pathFor(m, features, proj); m.fillStyle = '#000'; m.fill('evenodd');
  const md = m.getImageData(0, 0, mask.width, mask.height).data;
  const isLand = (x, y) => { const i = (Math.round(y * dpr) * mask.width + Math.round(x * dpr)) * 4 + 3; return md[i] > 128; };

  // Sea
  ctx.clearRect(0, 0, w, h);
  if (hero) { ctx.fillStyle = 'rgba(206,228,244,.42)'; ctx.fillRect(0, 0, w, h); }
  if (!hero && !shape) { ctx.fillStyle = water; ctx.fillRect(0, 0, w, h); }

  // Halftone dots: on water for cards, everywhere (denser on water) for the hero wash
  // Dots are rasterised straight into pixels: thousands of arc() fills are slow on software renderers.
  const step = hero ? 5 : shape ? 3.5 : 6;
  const W = canvas.width, Hh = canvas.height, img = new ImageData(W, Hh), px = img.data;
  const dot = (cx, cy, r, rgb, a) => {
    cx *= dpr; cy *= dpr; r *= dpr;
    const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
    const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(Hh - 1, Math.ceil(cy + r + 1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const cover = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)));
      if (!cover) continue;
      const i = (y * W + x) * 4, al = Math.round(255 * a * cover);
      if (al > px[i + 3]) { px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = al; }
    }
  };
  const SEA = [80, 150, 205], LAND = [110, 165, 210];
  for (let y = step / 2; y < h; y += step) {
    const row = Math.round(y / step) % 2 ? step / 2 : 0;
    for (let x = step / 2 + row; x < w; x += step) {
      const onLand = isLand(x, y);
      if (hero) {
        const n = (Math.sin(x * 0.021) + Math.cos(y * 0.027) + Math.sin((x + y) * 0.009)) / 3; // soft watercolor modulation
        const r = onLand ? 0.55 + 0.25 * n : 1.15 + 0.45 * n;
        if (r > 0.2) dot(x, y, r, onLand ? LAND : SEA, onLand ? 0.12 : 0.36);
      } else if (shape) {
        if (onLand) dot(x, y, 0.9, [70, 140, 195], 0.30);
      } else if (!onLand) dot(x, y, 0.85, [70, 140, 195], 0.22);
    }
  }
  const layer = document.createElement('canvas'); layer.width = W; layer.height = Hh;
  layer.getContext('2d').putImageData(img, 0, 0);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(layer, 0, 0); ctx.restore();

  // Land
  pathFor(ctx, features, proj);
  ctx.fillStyle = hero ? 'rgba(255,255,255,.55)' : shape ? 'rgba(225,238,248,.55)' : land; ctx.fill('evenodd');
  if (o.highlight) {
    pathFor(ctx, features, proj, f => f.properties?.a3 === o.highlight);
    ctx.fillStyle = hero ? 'rgba(252,236,214,.55)' : 'rgba(250,226,196,.55)'; ctx.fill('evenodd');
  }
  pathFor(ctx, features, proj);
  ctx.strokeStyle = hero ? 'rgba(110,160,200,.30)' : 'rgba(120,150,175,.45)'; ctx.lineWidth = hero ? 0.6 : 0.6; ctx.stroke();

  // Markers
  for (const p of o.markers || []) {
    const [x, y] = proj(p.lon, p.lat);
    if (x < -10 || y < -10 || x > w + 10 || y > h + 10) continue;
    if (p.kind === 'hq') {
      ctx.fillStyle = '#16233a'; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
    } else {
      const col = p.color || (p.kind === 'muted' ? '#8b90a3' : '#e39a55');
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
    }
  }
  return proj;
}

/* Bounding box around a point with a given span in degrees of longitude, aspect-corrected. */
export function bboxAround(lon, lat, spanLon, w, h) {
  const halfX = spanLon / 2;
  const x0 = (lon - halfX) * RAD, x1 = (lon + halfX) * RAD;
  const s = w / (x1 - x0);
  const cy = mercY(lat), dy = (h / 2) / s;
  const inv = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD;
  return [lon - halfX, inv(cy - dy), lon + halfX, inv(cy + dy)];
}
