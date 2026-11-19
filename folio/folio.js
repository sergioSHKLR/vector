/* Gdrew — local-first SVG drawing. No dependencies. */
(function (root) {
  "use strict";

  const KEY = "folio.v1";
  const VERSION = "1.15";
  const NARROW = "Oswald, Impact, 'Arial Narrow', sans-serif";
  const REGULAR = "Arial, Helvetica, sans-serif";
  const WIDE = "Nunito, Verdana, sans-serif";
  const FONTS = [
    [NARROW, "Oswald"],
    [REGULAR, "Arial"],
    [WIDE, "Nunito"],
  ];

  function weightFor(font) {
    const name = String(font || "");
    if (name.indexOf("Oswald") === 0) return 600;
    if (name.indexOf("Nunito") === 0) return 600;
    return 400;
  }

  function ensureFonts() {
    if (typeof document === "undefined" || document.getElementById("gdrew-fonts")) return;
    const link = document.createElement("link");
    link.id = "gdrew-fonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&family=Oswald:wght@500;600;700&display=swap";
    document.head.appendChild(link);
  }

  const PX_PER_IN = 96;
  const UNITS = ["px", "mm", "cm", "decimal", "fraction"];

  function preferredUnit() {
    try {
      const saved = localStorage.getItem("gdrew.unit");
      if (UNITS.indexOf(saved) >= 0) return saved;
    } catch (err) {
      /* keep pixels */
    }
    return "px";
  }

  function loadPrefs() {
    const prefs = {
      unit: preferredUnit(),
      width: 1056,
      height: 816,
      background: "none",
      fill: "#ffffff",
      stroke: "#000000",
      strokeWidth: 1,
    };
    try {
      const raw = JSON.parse(localStorage.getItem("gdrew.prefs") || "null");
      if (!raw || typeof raw !== "object") return prefs;
      if (UNITS.indexOf(raw.unit) >= 0) prefs.unit = raw.unit;
      const w = +raw.width;
      const h = +raw.height;
      if (w >= 16 && w <= 8000) prefs.width = w;
      if (h >= 16 && h <= 8000) prefs.height = h;
      if (raw.background === "none" || /^#[0-9a-fA-F]{6}$/.test(raw.background)) prefs.background = raw.background;
      if (raw.fill === "none" || /^#[0-9a-fA-F]{6}$/.test(raw.fill)) prefs.fill = raw.fill;
      if (raw.stroke === "none" || /^#[0-9a-fA-F]{6}$/.test(raw.stroke)) prefs.stroke = raw.stroke;
      const sw = +raw.strokeWidth;
      if (sw >= 0 && sw <= 200) prefs.strokeWidth = sw;
    } catch (err) {
      /* the built-in defaults still apply */
    }
    return prefs;
  }

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a || 1;
  }

  function formatInches(inches) {
    const sign = inches < 0 ? "-" : "";
    const abs = Math.abs(inches);
    const den = 16;
    let whole = Math.floor(abs + 1e-6);
    let nume = Math.round((abs - whole) * den);
    if (nume >= den) {
      whole += 1;
      nume = 0;
    }
    if (!nume) return sign + String(whole);
    const g = gcd(nume, den);
    const frac = nume / g + "/" + den / g;
    return sign + (whole ? whole + " " + frac : frac);
  }

  function parseInches(text) {
    const s = String(text).trim();
    if (s.indexOf("/") >= 0) {
      const m = s.match(/^([+-])?\s*(\d+)?\s*(\d+)\s*\/\s*(\d+)$/);
      if (!m) return NaN;
      const sign = m[1] === "-" ? -1 : 1;
      const whole = m[2] ? parseInt(m[2], 10) : 0;
      const den = parseInt(m[4], 10);
      if (!den) return NaN;
      return sign * (whole + parseInt(m[3], 10) / den);
    }
    const v = parseFloat(s);
    return Number.isFinite(v) ? v : NaN;
  }

  function pxToUnit(px, unit) {
    const inches = px / PX_PER_IN;
    if (unit === "mm") return inches * 25.4;
    if (unit === "cm") return inches * 2.54;
    if (unit === "decimal" || unit === "fraction") return inches;
    return px;
  }

  function unitToPx(value, unit) {
    if (unit === "mm") return (value / 25.4) * PX_PER_IN;
    if (unit === "cm") return (value / 2.54) * PX_PER_IN;
    if (unit === "decimal" || unit === "fraction") return value * PX_PER_IN;
    return value;
  }

  function snapForUnit(unit) {
    if (unit === "mm") return unitToPx(1, "mm");
    if (unit === "cm") return unitToPx(0.5, "cm");
    if (unit === "decimal" || unit === "fraction") return unitToPx(1 / 16, "decimal");
    return 8;
  }

  function n(v) {
    if (!Number.isFinite(v)) return "0";
    const r = Math.round(v * 100) / 100;
    return Object.is(r, -0) ? "0" : String(r);
  }

  function xml(s) {
    return String(s ?? "")
      .replace(/&/g, "\u0026amp;")
      .replace(/</g, "\u0026lt;")
      .replace(/>/g, "\u0026gt;")
      .replace(/"/g, "\u0026quot;")
      .replace(/'/g, "\u0026apos;");
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function num(v, fallback) {
    const x = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(x) ? x : fallback;
  }

  function bounds(pts) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    if (!pts.length || !Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return { minX, minY, maxX, maxY };
  }

  function makeAnchor(x, y) {
    return { x: x, y: y, inX: 0, inY: 0, outX: 0, outY: 0, mode: "corner" };
  }

  const LIBRARY = [
    ["roundrect", "Rounded rectangle"],
    ["triangle", "Triangle"],
    ["rtriangle", "Right triangle"],
    ["diamond", "Diamond"],
    ["para", "Parallelogram"],
    ["trap", "Trapezoid"],
    ["pentagon", "Pentagon"],
    ["hexagon", "Hexagon"],
    ["octagon", "Octagon"],
    ["heart", "Heart"],
    ["star5", "5-point star"],
    ["star6", "6-point star"],
  ];

  function shapeLabel(kind) {
    const row = LIBRARY.find((item) => item[0] === kind);
    return row ? row[1] : "Rounded rectangle";
  }

  function shapeIcon(kind) {
    const paths = {
      roundrect: '<rect x="3" y="5" width="18" height="14" rx="3"/>',
      triangle: '<path d="M12 4 21 20H3Z"/>',
      rtriangle: '<path d="M4 4v16h16Z"/>',
      diamond: '<path d="M12 3 21 12 12 21 3 12Z"/>',
      para: '<path d="M8 5h13L16 19H3Z"/>',
      trap: '<path d="M7 5h10l4 14H3Z"/>',
      pentagon: '<path d="M12 3 20.5 9.2 17.2 19.5H6.8L3.5 9.2Z"/>',
      hexagon: '<path d="M8 4h8l4 8-4 8H8l-4-8Z"/>',
      octagon: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8Z"/>',
      heart: '<path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z"/>',
      star5: '<path d="m12 3 2.2 6.4H21l-5.4 4 2.1 6.6L12 16.8 6.3 20l2.1-6.6L3 9.4h6.8Z"/>',
      star6: '<path d="M12 2.5 14.2 8l6.3-.8-3.4 5.3 4.6 4.3-6.3.6L14 23l-2-5.4L6 19.2l1.6-6.1L2.2 10l6.2-.6Z"/>',
    };
    return icon(paths[kind] || paths.roundrect);
  }

  function cornerRing(pts) {
    return pts.map((p) => makeAnchor(p.x, p.y));
  }

  function regularRing(n, w, h, start) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = start + (i * 2 * Math.PI) / n;
      pts.push({ x: (w / 2) * (1 + Math.cos(a)), y: (h / 2) * (1 + Math.sin(a)) });
    }
    return cornerRing(pts);
  }

  function roundRectRing(w, h) {
    const r = Math.min(w, h) * 0.18;
    const k = 0.5522847498 * r;
    function A(x, y, ix, iy, ox, oy) {
      return { x: x, y: y, inX: ix, inY: iy, outX: ox, outY: oy, mode: "corner" };
    }
    return [
      A(r, 0, -k, 0, 0, 0),
      A(w - r, 0, 0, 0, k, 0),
      A(w, r, 0, -k, 0, 0),
      A(w, h - r, 0, 0, 0, k),
      A(w - r, h, k, 0, 0, 0),
      A(r, h, 0, 0, -k, 0),
      A(0, h - r, 0, k, 0, 0),
      A(0, r, 0, 0, 0, -k),
    ];
  }

  function heartRing(w, h) {
    const sx = w / 100;
    const sy = h / 100;
    const raw = [
      [50, 88, 30, -20, -30, -20],
      [5, 32, 0, 16, 0, -16],
      [32, 6, -14, 0, 10, 0],
      [50, 20, -2, -8, 2, -8],
      [68, 6, -10, 0, 14, 0],
      [95, 32, 0, -16, 0, 16],
    ];
    return raw.map((p) => ({
      x: p[0] * sx,
      y: p[1] * sy,
      inX: p[2] * sx,
      inY: p[3] * sy,
      outX: p[4] * sx,
      outY: p[5] * sy,
      mode: "smooth",
    }));
  }

  function starRing(spikes, w, h) {
    const ratio = spikes === 5 ? (3 - Math.sqrt(5)) / 2 : 1 / Math.sqrt(3);
    const raw = [];
    for (let i = 0; i < spikes * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / spikes;
      const rad = i % 2 === 0 ? 1 : ratio;
      raw.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
    }
    const b = bounds(raw);
    const dw = b.maxX - b.minX || 1;
    const dh = b.maxY - b.minY || 1;
    return cornerRing(raw.map((p) => ({ x: ((p.x - b.minX) / dw) * w, y: ((p.y - b.minY) / dh) * h })));
  }

  function buildRing(kind, w, h) {
    w = Math.max(1, w);
    h = Math.max(1, h);
    if (kind === "roundrect") return roundRectRing(w, h);
    if (kind === "rtriangle") return cornerRing([{ x: 0, y: 0 }, { x: w, y: h }, { x: 0, y: h }]);
    if (kind === "para") return cornerRing([{ x: w * 0.25, y: 0 }, { x: w, y: 0 }, { x: w * 0.75, y: h }, { x: 0, y: h }]);
    if (kind === "trap") return cornerRing([{ x: w * 0.2, y: 0 }, { x: w * 0.8, y: 0 }, { x: w, y: h }, { x: 0, y: h }]);
    if (kind === "heart") return heartRing(w, h);
    if (kind === "star5") return starRing(5, w, h);
    if (kind === "star6") return starRing(6, w, h);
    if (kind === "triangle") return regularRing(3, w, h, -Math.PI / 2);
    if (kind === "diamond") return regularRing(4, w, h, -Math.PI / 2);
    if (kind === "pentagon") return regularRing(5, w, h, -Math.PI / 2);
    if (kind === "hexagon") return regularRing(6, w, h, -Math.PI / 2 + Math.PI / 6);
    if (kind === "octagon") return regularRing(8, w, h, -Math.PI / 2 + Math.PI / 8);
    return roundRectRing(w, h);
  }

  function icon(inner) {
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  }

  const ICONS = {
    select: icon('<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/>'),
    nodes: icon('<circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><path d="M5 17A12 12 0 0 1 17 5"/>'),
    pen: icon('<path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z"/><path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18"/><path d="m2.3 2.3 7.286 7.286"/><circle cx="11" cy="11" r="2"/>'),
    point: icon('<path d="M5 17 11 9l5 5 4-8"/><rect x="3" y="15" width="4" height="4"/><circle cx="20" cy="6" r="2"/>'),
    rect: icon('<rect width="18" height="18" x="3" y="3" rx="2"/>'),
    ellipse: icon('<circle cx="12" cy="12" r="10"/>'),
    line: icon('<path d="M22 2 2 22"/>'),
    text: icon('<path d="M12 4v16"/><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/>'),
    hand: icon('<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'),
    undo: icon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>'),
    redo: icon('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>'),
    sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'),
    moon: icon('<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>'),
    mark: icon('<path d="m12.99 6.74 1.93 3.44"/><path d="M19.136 12a10 10 0 0 1-14.271 0"/><path d="m21 21-2.16-3.84"/><path d="m3 21 8.02-14.26"/><circle cx="12" cy="5" r="2"/>'),
    image: icon('<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="1.5" fill="currentColor" stroke="none"/><path d="m21 15-3.5-3.5L7 21"/>'),
    file: icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/>'),
    folder: icon('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9l-.81-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>'),
    download: icon('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
    copy: icon('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
    trash: icon('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'),
    all: icon('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>'),
    gear: icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
    zoomIn: icon('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/>'),
    zoomOut: icon('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>'),
    fit: icon('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'),
    magnet: icon('<path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15"/><path d="m5 8 4 4"/><path d="m12 15 4 4"/>'),
    grid: icon('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>'),
    monitor: icon('<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>'),
    front: icon('<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>'),
    forward: icon('<path d="m12 19 9-5"/><path d="m3 14 9 5"/><path d="m12 3 9 5-9 5-9-5 9-5z"/>'),
    backward: icon('<path d="m3 10 9 5 9-5"/><path d="m3 15 9 5 9-5"/>'),
    back: icon('<path d="m3 8 9 5 9-5"/><path d="m3 13 9 5 9-5"/><path d="M12 3v6"/>'),
    alignL: icon('<path d="M4 4v16"/><rect x="8" y="6" width="12" height="4"/><rect x="8" y="14" width="8" height="4"/>'),
    alignC: icon('<path d="M12 4v16"/><rect x="6" y="6" width="12" height="4"/><rect x="8" y="14" width="8" height="4"/>'),
    alignR: icon('<path d="M20 4v16"/><rect x="4" y="6" width="12" height="4"/><rect x="8" y="14" width="8" height="4"/>'),
    alignT: icon('<path d="M4 4h16"/><rect x="6" y="8" width="4" height="12"/><rect x="14" y="8" width="4" height="8"/>'),
    alignM: icon('<path d="M4 12h16"/><rect x="6" y="6" width="4" height="12"/><rect x="14" y="8" width="4" height="8"/>'),
    alignB: icon('<path d="M4 20h16"/><rect x="6" y="4" width="4" height="12"/><rect x="14" y="8" width="4" height="8"/>'),
    page: icon('<rect width="14" height="18" x="5" y="3" rx="1"/><path d="M8 12h8"/><path d="M12 8v8"/>'),
    pageH: icon('<rect width="14" height="18" x="5" y="3" rx="1"/><path d="M8 12h8"/>'),
    pageV: icon('<rect width="14" height="18" x="5" y="3" rx="1"/><path d="M12 8v8"/>'),
    distH: icon('<rect x="3" y="5" width="4" height="14"/><rect x="10" y="3" width="4" height="18"/><rect x="17" y="7" width="4" height="10"/>'),
    distV: icon('<rect x="5" y="3" width="14" height="4"/><rect x="3" y="10" width="18" height="4"/><rect x="7" y="17" width="10" height="4"/>'),
    flipH: icon('<path d="M12 3v18"/><path d="m16 8 4 4-4 4"/><path d="m8 8-4 4 4 4"/>'),
    flipV: icon('<path d="M3 12h18"/><path d="m8 16 4 4 4-4"/><path d="m8 8 4-4 4 4"/>'),
    group: icon('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>'),
    ungroup: icon('<rect x="3" y="8" width="7" height="7" rx="1"/><rect x="14" y="8" width="7" height="7" rx="1"/><path d="M10 5h4"/><path d="M12 3v4"/>'),
    union: icon('<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>'),
    subtract: icon('<circle cx="9" cy="12" r="5"/><path d="M14.5 7.2a5 5 0 1 1 0 9.6"/>'),
    intersect: icon('<path d="M9 7a5 5 0 0 1 5 0 5 5 0 0 1 0 10 5 5 0 0 1-5 0 5 5 0 0 1 0-10z"/>'),
    onpath: icon('<path d="M4 18c4-8 12-8 16 0"/><path d="M8 11V7"/><path d="M8 7h5"/>'),
    keys: icon('<rect width="20" height="14" x="2" y="6" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>'),
    fill: icon('<path d="M16 3 8 11l5 5 8-8-5-5z"/><path d="M8 11 4.5 14.5a2.1 2.1 0 0 0 3 3L11 14"/><path d="M7 19c0 1.4-1.6 3-1.6 3S3.8 20.4 3.8 19a1.6 1.6 0 0 1 3.2 0z" fill="currentColor" stroke="none"/>'),
    border: icon('<path d="M4 20 16.5 7.5"/><path d="m14 5 5 5"/><path d="M12.5 7.5 5 20H3v-2z"/>'),
    weight: icon('<path d="M4 7h16" stroke-width="1.2"/><path d="M4 12h16" stroke-width="2.4"/><path d="M4 17.5h16" stroke-width="3.6"/>'),
    dropper: icon('<path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3L15 6"/>'),
    wheel: icon('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v4"/><path d="M12 17v4"/><path d="m4.2 7.2 3.4 2"/><path d="m16.4 14.8 3.4 2"/><path d="m4.2 16.8 3.4-2"/><path d="m16.4 9.2 3.4-2"/>'),
    hundred: icon('<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>'),
  };

  function mb(attrs, name, label) {
    return `<button type="button" ${attrs}><span class="mi">${ICONS[name] || ""}</span><span>${label}</span></button>`;
  }

  function segCmd(a, b, first) {
    const flat = Math.hypot(a.outX, a.outY) < 0.35 && Math.hypot(b.inX, b.inY) < 0.35;
    if (flat) return `L ${n(b.x)} ${n(b.y)}`;
    const inn = `${n(b.x + b.inX)} ${n(b.y + b.inY)}`;
    const mirrored = Math.hypot(a.outX + a.inX, a.outY + a.inY) < 0.6 && Math.hypot(a.inX, a.inY) > 0.35;
    if (!first && mirrored) return `S ${inn} ${n(b.x)} ${n(b.y)}`;
    return `C ${n(a.x + a.outX)} ${n(a.y + a.outY)} ${inn} ${n(b.x)} ${n(b.y)}`;
  }

  function anchorsToD(anchors, closed) {
    if (!anchors || !anchors.length) return "";
    let d = `M ${n(anchors[0].x)} ${n(anchors[0].y)}`;
    for (let i = 1; i < anchors.length; i++) d += segCmd(anchors[i - 1], anchors[i], i === 1);
    if (closed && anchors.length > 1) {
      d += segCmd(anchors[anchors.length - 1], anchors[0], false);
      d += "Z";
    }
    return d;
  }

  function ringsToD(shape) {
    return (shape.rings || []).map((ring) => anchorsToD(ring, !!shape.closed)).join(" ");
  }

  function ellipsePoint(w, h, deg) {
    const rx = Math.max(Math.abs(w) / 2, 0.5);
    const ry = Math.max(Math.abs(h) / 2, 0.5);
    const t = ((deg % 360) * Math.PI) / 180;
    return { x: w / 2 + rx * Math.sin(t), y: h / 2 - ry * Math.cos(t), rx: rx, ry: ry };
  }

  function ellipseGuide(w, h, side, angle) {
    const sweep = side === "inside" ? 0 : 1;
    const turn = side === "inside" ? -1 : 1;
    const p0 = ellipsePoint(w, h, angle || 0);
    const p1 = ellipsePoint(w, h, (angle || 0) + 180 * turn);
    const rad = n(p0.rx) + " " + n(p0.ry);
    const a = n(p0.x) + " " + n(p0.y);
    const b = n(p1.x) + " " + n(p1.y);
    return "M " + a + " A " + rad + " 0 0 " + sweep + " " + b + " A " + rad + " 0 0 " + sweep + " " + a;
  }

  function rectGuide(w, h, side) {
    const W = n(w);
    const H = n(h);
    if (side === "inside") return "M 0 0 L 0 " + H + " L " + W + " " + H + " L " + W + " 0 Z";
    return "M 0 0 L " + W + " 0 L " + W + " " + H + " L 0 " + H + " Z";
  }

  function reverseRing(ring) {
    return ring.slice().reverse().map((a) => ({
      x: a.x,
      y: a.y,
      inX: a.outX,
      inY: a.outY,
      outX: a.inX,
      outY: a.inY,
      mode: a.mode,
    }));
  }

  function guideD(host, side, angle) {
    const inside = side === "inside";
    if (host.type === "ellipse") return ellipseGuide(host.w || 0, host.h || 0, inside ? "inside" : "outside", angle || 0);
    if (host.type === "rect") return rectGuide(host.w || 0, host.h || 0, inside ? "inside" : "outside");
    if (host.type === "path") {
      const shape = inside ? { rings: (host.rings || []).map(reverseRing), closed: !!host.closed } : host;
      return ringsToD(shape);
    }
    return "";
  }

  function localBBox(s) {
    if (!s) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    if (s.type === "rect" || s.type === "ellipse" || s.type === "image") {
      return { minX: 0, minY: 0, maxX: s.w || 0, maxY: s.h || 0 };
    }
    if (s.type === "line") return bounds([{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]);
    if (s.type === "text") {
      const size = s.size || 16;
      const lines = String(s.text || "").split("\n");
      const w = Math.max(8, ...lines.map((line) => line.length * size * 0.52));
      return { minX: 0, minY: -size, maxX: w, maxY: (lines.length - 1) * size * 1.15 };
    }
    if (s.type === "path") {
      const pts = [];
      for (const ring of s.rings || []) {
        for (const a of ring) {
          pts.push({ x: a.x, y: a.y }, { x: a.x + a.inX, y: a.y + a.inY }, { x: a.x + a.outX, y: a.y + a.outY });
        }
      }
      return bounds(pts);
    }
    if (s.type === "group") {
      const pts = [];
      for (const child of s.children || []) {
        const b = localBBox(child);
        pts.push(
          localToWorld(child, { x: b.minX, y: b.minY }),
          localToWorld(child, { x: b.maxX, y: b.minY }),
          localToWorld(child, { x: b.maxX, y: b.maxY }),
          localToWorld(child, { x: b.minX, y: b.maxY }),
        );
      }
      return bounds(pts);
    }
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  function localCenter(s) {
    const b = localBBox(s);
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  }

  function localToWorld(s, p) {
    const c = localCenter(s);
    const rad = ((s.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    let dx = p.x - c.x;
    let dy = p.y - c.y;
    if (s.flipH) dx = -dx;
    if (s.flipV) dy = -dy;
    return {
      x: (s.x || 0) + c.x + dx * cos - dy * sin,
      y: (s.y || 0) + c.y + dx * sin + dy * cos,
    };
  }

  function worldToLocal(s, p) {
    const c = localCenter(s);
    const rad = (-(s.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx0 = p.x - (s.x || 0) - c.x;
    const dy0 = p.y - (s.y || 0) - c.y;
    let dx = dx0 * cos - dy0 * sin;
    let dy = dx0 * sin + dy0 * cos;
    if (s.flipH) dx = -dx;
    if (s.flipV) dy = -dy;
    return { x: c.x + dx, y: c.y + dy };
  }

  function normDeg(d) {
    d = d % 360;
    if (d < 0) d += 360;
    return d;
  }

  function lock45(origin, p) {
    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    const ang = Math.atan2(dy, dx);
    const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(dx, dy);
    return { x: origin.x + Math.cos(snapped) * len, y: origin.y + Math.sin(snapped) * len };
  }

  function handlePoint(b, name) {
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const map = {
      nw: [b.minX, b.minY],
      n: [cx, b.minY],
      ne: [b.maxX, b.minY],
      e: [b.maxX, cy],
      se: [b.maxX, b.maxY],
      s: [cx, b.maxY],
      sw: [b.minX, b.maxY],
      w: [b.minX, cy],
    };
    const pair = map[name] || [cx, cy];
    return { x: pair[0], y: pair[1] };
  }

  function opposite(name) {
    return { nw: "se", n: "s", ne: "sw", e: "w", se: "nw", s: "n", sw: "ne", w: "e" }[name];
  }

  function cubicAt(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return {
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    };
  }

  function splitCubic(p0, p1, p2, p3, t) {
    const L = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    const a = L(p0, p1, t);
    const b = L(p1, p2, t);
    const c = L(p2, p3, t);
    const d = L(a, b, t);
    const e = L(b, c, t);
    const f = L(d, e, t);
    return { left1: a, left2: d, mid: f, right1: e, right2: c };
  }

  function luminance(hex) {
    const c = String(hex || "").replace("#", "");
    if (c.length < 6) return 1;
    const r = parseInt(c.slice(0, 2), 16) / 255;
    const g = parseInt(c.slice(2, 4), 16) / 255;
    const b = parseInt(c.slice(4, 6), 16) / 255;
    if ([r, g, b].some((v) => Number.isNaN(v))) return 1;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function dataUrlToBlob(dataUrl) {
    const comma = String(dataUrl).indexOf(",");
    if (comma < 0) throw new Error("bad image");
    const mime = ((/data:(.*?);/.exec(dataUrl.slice(0, comma)) || [])[1]) || "image/png";
    const bin = atob(dataUrl.slice(comma + 1));
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function setSvgHtml(el, html) {
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">${html}</svg>`,
      "image/svg+xml",
    );
    if (parsed.querySelector("parsererror")) {
      el.replaceChildren();
      return;
    }
    el.replaceChildren(...Array.from(parsed.documentElement.childNodes));
  }

  function blank() {
    const prefs = loadPrefs();
    return {
      name: "Untitled",
      width: prefs.width,
      height: prefs.height,
      background: prefs.background,
      grid: snapForUnit(prefs.unit),
      showGrid: true,
      snap: true,
      unit: prefs.unit,
      nextId: 1,
      shapes: [],
    };
  }

  function sanitizeAnchor(a) {
    if (!a) return null;
    const x = +a.x;
    const y = +a.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      x: x,
      y: y,
      inX: +a.inX || 0,
      inY: +a.inY || 0,
      outX: +a.outX || 0,
      outY: +a.outY || 0,
      mode: a.mode === "smooth" ? "smooth" : "corner",
    };
  }

  function cleanName(raw) {
    if (typeof raw !== "string") return "";
    return raw.replace(/\s+/g, " ").trim().slice(0, 40);
  }

  function rememberScale(base, raw) {
    const rw = +raw.refW;
    const rh = +raw.refH;
    if (rw > 0 && rw < 100000) base.refW = rw;
    if (rh > 0 && rh < 100000) base.refH = rh;
    if (raw.lockRatio === false) base.lockRatio = false;
    return base;
  }

  function sanitize(raw) {
    if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !raw.type) return null;
    const base = {
      id: raw.id,
      type: raw.type,
      x: num(raw.x, 0),
      y: num(raw.y, 0),
      rotation: num(raw.rotation, 0),
      opacity: clamp(num(raw.opacity, 1), 0, 1),
      fill: typeof raw.fill === "string" ? raw.fill : "#0f8b7d",
      stroke: typeof raw.stroke === "string" ? raw.stroke : "#14171c",
      strokeWidth: Math.max(0, num(raw.strokeWidth, 2)),
    };
    const given = cleanName(raw.name);
    if (given && raw.type !== "image") base.name = given;
    if (raw.flipH === true) base.flipH = true;
    if (raw.flipV === true) base.flipV = true;
    if (raw.type === "rect" || raw.type === "ellipse" || raw.type === "image") {
      base.w = Math.max(1, num(raw.w, 40));
      base.h = Math.max(1, num(raw.h, 40));
      if (raw.type !== "image") return rememberScale(base, raw);
      const src = typeof raw.src === "string" ? raw.src.trim() : "";
      if (!/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(src) || src.length > 6000000) return null;
      base.src = src.replace(/\s/g, "");
      base.name = String(raw.name || "image").slice(0, 80);
      base.fill = "none";
      base.stroke = "none";
      base.strokeWidth = 0;
      return rememberScale(base, raw);
    }
    if (raw.type === "line") {
      base.x1 = num(raw.x1, 0);
      base.y1 = num(raw.y1, 0);
      base.x2 = num(raw.x2, 40);
      base.y2 = num(raw.y2, 40);
      return rememberScale(base, raw);
    }
    if (raw.type === "text") {
      base.text = String(raw.text ?? "Text");
      base.font = String(raw.font || REGULAR);
      base.fontWeight = Math.max(100, num(raw.fontWeight, weightFor(base.font)));
      base.size = Math.max(1, num(raw.size, 32));
      return rememberScale(base, raw);
    }
    if (raw.type === "textPath") {
      if (typeof raw.pathId !== "string") return null;
      const textPath = {
        id: raw.id,
        type: "textPath",
        pathId: raw.pathId,
        text: String(raw.text ?? ""),
        font: String(raw.font || NARROW),
        size: Math.max(1, num(raw.size, 20)),
        fontWeight: Math.max(100, num(raw.fontWeight, weightFor(raw.font || NARROW))),
        startAngle: num(raw.startAngle, raw.startOffset != null ? num(raw.startOffset, 0) * 3.6 : 0),
        baseline: num(raw.baseline, 0),
        side: raw.side === "inside" ? "inside" : "outside",
        letterSpacing: num(raw.letterSpacing, 0),
        fill: typeof raw.fill === "string" ? raw.fill : "#14171c",
        opacity: clamp(num(raw.opacity, 1), 0, 1),
      };
      const textName = cleanName(raw.name);
      if (textName) textPath.name = textName;
      return textPath;
    }
    if (raw.type === "path") {
      const rings = [];
      for (const ring of raw.rings || []) {
        const anchors = [];
        for (const a of ring) {
          const s = sanitizeAnchor(a);
          if (s) anchors.push(s);
        }
        if (anchors.length) rings.push(anchors);
      }
      if (!rings.length) return null;
      base.rings = rings;
      base.closed = !!raw.closed;
      base.fillRule = raw.fillRule === "evenodd" ? "evenodd" : "nonzero";
      return rememberScale(base, raw);
    }
    if (raw.type === "group") {
      const children = [];
      for (const child of raw.children || []) {
        const c = sanitize(child);
        if (c && c.type !== "textPath") children.push(c);
      }
      if (!children.length) return null;
      base.children = children;
      base.fill = "none";
      base.stroke = "none";
      base.strokeWidth = 0;
      return rememberScale(base, raw);
    }
    return null;
  }

  function normalize(d) {
    const src = d && typeof d === "object" ? d : {};
    const out = blank();
    out.name = String(src.name || "Untitled").slice(0, 80);
    out.width = clamp(num(src.width, 960), 16, 8000);
    out.height = clamp(num(src.height, 640), 16, 8000);
    out.background = typeof src.background === "string" ? src.background : "#f3efe6";
    out.unit = UNITS.indexOf(src.unit) >= 0 ? src.unit : preferredUnit();
    out.grid = clamp(num(src.grid, snapForUnit(out.unit)), 0.25, 800);
    out.showGrid = src.showGrid !== false;
    out.snap = src.snap !== false;
    let max = 1;
    for (const raw of src.shapes || []) {
      const s = sanitize(raw);
      if (!s) continue;
      const idn = parseInt(String(s.id).replace(/\D/g, ""), 10);
      if (idn >= max) max = idn + 1;
      out.shapes.push(s);
    }
    out.nextId = Math.max(max, num(src.nextId, 1));
    const ids = new Set(out.shapes.map((s) => s.id));
    out.shapes = out.shapes.filter((s) => s.type !== "textPath" || ids.has(s.pathId));
    return out;
  }

  function starter() {
    const d = blank();
    d.name = "Gdrew";
    d.nextId = 6;
    d.shapes = [
      {
        id: "s1",
        type: "text",
        x: 64,
        y: 108,
        rotation: 0,
        text: "Gdrew",
        font: REGULAR,
        fontWeight: 400,
        size: 76,
        fill: "#14171c",
        stroke: "none",
        strokeWidth: 0,
        opacity: 1,
      },
      {
        id: "s2",
        type: "ellipse",
        x: 220,
        y: 150,
        w: 360,
        h: 250,
        rotation: 0,
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 1,
        opacity: 0.92,
      },
      {
        id: "s3",
        type: "rect",
        x: 390,
        y: 250,
        w: 300,
        h: 180,
        rotation: 0,
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 1,
        opacity: 1,
      },
      {
        id: "s4",
        type: "path",
        x: 0,
        y: 0,
        rotation: 0,
        closed: false,
        fillRule: "nonzero",
        fill: "none",
        stroke: "#000000",
        strokeWidth: 1,
        opacity: 1,
        rings: [[
          { x: 80, y: 530, inX: 0, inY: 0, outX: 80, outY: -60, mode: "smooth" },
          { x: 340, y: 470, inX: -90, inY: 16, outX: 90, outY: -16, mode: "smooth" },
          { x: 610, y: 545, inX: -80, inY: -36, outX: 80, outY: 36, mode: "smooth" },
          { x: 880, y: 490, inX: -90, inY: 24, outX: 0, outY: 0, mode: "corner" },
        ]],
      },
      {
        id: "s5",
        type: "textPath",
        pathId: "s4",
        text: "type follows the path",
        font: NARROW,
        fontWeight: 600,
        size: 22,
        startAngle: 0,
        baseline: 0,
        side: "outside",
        letterSpacing: 0,
        fill: "#000000",
        stroke: "none",
        strokeWidth: 0,
        opacity: 1,
      },
    ];
    return d;
  }

  function parsePathD(d) {
    const tokens = [];
    const re = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/gi;
    let m;
    while ((m = re.exec(d || ""))) tokens.push(m[1] ? m[1] : parseFloat(m[2]));
    const rings = [];
    let cur = [];
    let x = 0;
    let y = 0;
    let sx = 0;
    let sy = 0;
    let cmd = "";
    let prevCtrl = null;
    let i = 0;
    function take() {
      if (i >= tokens.length || typeof tokens[i] === "string") return NaN;
      return tokens[i++];
    }
    while (i < tokens.length) {
      if (typeof tokens[i] === "string") cmd = tokens[i++];
      if (!cmd) break;
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      if (C === "Z") {
        if (cur.length) rings.push({ anchors: cur, closed: true });
        cur = [];
        x = sx;
        y = sy;
        prevCtrl = null;
        continue;
      }
      if (C === "M") {
        if (cur.length) rings.push({ anchors: cur, closed: false });
        const px = take();
        const py = take();
        if (!Number.isFinite(px) || !Number.isFinite(py)) break;
        x = rel ? x + px : px;
        y = rel ? y + py : py;
        sx = x;
        sy = y;
        cur = [makeAnchor(x, y)];
        prevCtrl = null;
        cmd = rel ? "l" : "L";
        continue;
      }
      if (C === "L" || C === "H" || C === "V" || C === "T") {
        let px = x;
        let py = y;
        if (C === "H") {
          const v = take();
          if (!Number.isFinite(v)) break;
          px = rel ? x + v : v;
        } else if (C === "V") {
          const v = take();
          if (!Number.isFinite(v)) break;
          py = rel ? y + v : v;
        } else {
          const vx = take();
          const vy = take();
          if (!Number.isFinite(vx) || !Number.isFinite(vy)) break;
          px = rel ? x + vx : vx;
          py = rel ? y + vy : vy;
        }
        x = px;
        y = py;
        cur.push(makeAnchor(x, y));
        prevCtrl = null;
        continue;
      }
      if (C === "C" || C === "S" || C === "Q") {
        let x1;
        let y1;
        let x2;
        let y2;
        let px;
        let py;
        if (C === "C") {
          x1 = take();
          y1 = take();
          x2 = take();
          y2 = take();
          px = take();
          py = take();
          if (![x1, y1, x2, y2, px, py].every(Number.isFinite)) break;
          if (rel) {
            x1 += x;
            y1 += y;
            x2 += x;
            y2 += y;
            px += x;
            py += y;
          }
        } else if (C === "S") {
          x2 = take();
          y2 = take();
          px = take();
          py = take();
          if (![x2, y2, px, py].every(Number.isFinite)) break;
          if (rel) {
            x2 += x;
            y2 += y;
            px += x;
            py += y;
          }
          const a0 = cur[cur.length - 1];
          if (prevCtrl && a0) {
            x1 = 2 * a0.x - prevCtrl.x;
            y1 = 2 * a0.y - prevCtrl.y;
          } else {
            x1 = x;
            y1 = y;
          }
        } else {
          const cx = take();
          const cy = take();
          px = take();
          py = take();
          if (![cx, cy, px, py].every(Number.isFinite)) break;
          let ccx = rel ? x + cx : cx;
          let ccy = rel ? y + cy : cy;
          px = rel ? x + px : px;
          py = rel ? y + py : py;
          x1 = x + (2 / 3) * (ccx - x);
          y1 = y + (2 / 3) * (ccy - y);
          x2 = px + (2 / 3) * (ccx - px);
          y2 = py + (2 / 3) * (ccy - py);
        }
        const a0 = cur[cur.length - 1];
        if (a0) {
          a0.outX = x1 - a0.x;
          a0.outY = y1 - a0.y;
          if (Math.hypot(a0.outX + a0.inX, a0.outY + a0.inY) < 0.6 && Math.hypot(a0.inX, a0.inY) > 0.4) {
            a0.mode = "smooth";
          }
        }
        x = px;
        y = py;
        const a1 = makeAnchor(x, y);
        a1.inX = x2 - x;
        a1.inY = y2 - y;
        cur.push(a1);
        prevCtrl = { x: x2, y: y2 };
        continue;
      }
      if (C === "A") {
        for (let k = 0; k < 5; k++) take();
        const px = take();
        const py = take();
        if (!Number.isFinite(px) || !Number.isFinite(py)) break;
        x = rel ? x + px : px;
        y = rel ? y + py : py;
        cur.push(makeAnchor(x, y));
        prevCtrl = null;
        continue;
      }
      break;
    }
    if (cur.length) rings.push({ anchors: cur, closed: false });
    return rings.filter((r) => r.anchors.length >= 2);
  }

  function selfCheck() {
    const s = { type: "rect", x: 10, y: -5, w: 80, h: 30, rotation: 37 };
    const p = { x: 70, y: 10 };
    const back = worldToLocal(s, localToWorld(s, p));
    if (Math.hypot(back.x - p.x, back.y - p.y) > 1e-4) throw new Error("transform inverse failed");
    const a = [
      { x: 0, y: 0, inX: -1, inY: 0, outX: 1, outY: 0, mode: "smooth" },
      { x: 10, y: 0, inX: 0, inY: 2, outX: 0, outY: -2, mode: "smooth" },
      { x: 20, y: 5, inX: -1, inY: -1, outX: 0, outY: 0, mode: "corner" },
    ];
    const d = anchorsToD(a, false);
    if (!d.includes("C") || !d.includes("S ")) throw new Error("path commands failed: " + d);
  }

  const GOOGLE_PALETTE = [
    ["black", "#000000"], ["dark grey 4", "#434343"], ["dark grey 3", "#666666"], ["dark grey 2", "#999999"], ["dark grey 1", "#b7b7b7"], ["grey", "#cccccc"], ["light grey 1", "#d9d9d9"], ["light grey 2", "#efefef"], ["light grey 3", "#f3f3f3"], ["white", "#ffffff"],
    ["red berry", "#980000"], ["red", "#ff0000"], ["orange", "#ff9900"], ["yellow", "#ffff00"], ["green", "#00ff00"], ["cyan", "#00ffff"], ["cornflower blue", "#4a86e8"], ["blue", "#0000ff"], ["purple", "#9900ff"], ["magenta", "#ff00ff"],
    ["light red berry 3", "#e6b8af"], ["light red 3", "#f4cccc"], ["light orange 3", "#fce5cd"], ["light yellow 3", "#fff2cc"], ["light green 3", "#d9ead3"], ["light cyan 3", "#d0e0e3"], ["light cornflower blue 3", "#c9daf8"], ["light blue 3", "#cfe2f3"], ["light purple 3", "#d9d2e9"], ["light magenta 3", "#ead1dc"],
    ["light red berry 2", "#dd7e6b"], ["light red 2", "#ea9999"], ["light orange 2", "#f9cb9c"], ["light yellow 2", "#ffe599"], ["light green 2", "#b6d7a8"], ["light cyan 2", "#a2c4c9"], ["light cornflower blue 2", "#a4c2f4"], ["light blue 2", "#9fc5e8"], ["light purple 2", "#b4a7d6"], ["light magenta 2", "#d5a6bd"],
    ["light red berry 1", "#cc4125"], ["light red 1", "#e06666"], ["light orange 1", "#f6b26b"], ["light yellow 1", "#ffd966"], ["light green 1", "#93c47d"], ["light cyan 1", "#76a5af"], ["light cornflower blue 1", "#6d9eeb"], ["light blue 1", "#6fa8dc"], ["light purple 1", "#8e7cc3"], ["light magenta 1", "#c27ba0"],
    ["dark red berry 1", "#a61c00"], ["dark red 1", "#cc0000"], ["dark orange 1", "#e69138"], ["dark yellow 1", "#f1c232"], ["dark green 1", "#6aa84f"], ["dark cyan 1", "#45818e"], ["dark cornflower blue 1", "#3c78d8"], ["dark blue 1", "#3d85c6"], ["dark purple 1", "#674ea7"], ["dark magenta 1", "#a64d79"],
    ["dark red berry 2", "#85200c"], ["dark red 2", "#990000"], ["dark orange 2", "#b45f06"], ["dark yellow 2", "#bf9000"], ["dark green 2", "#38761d"], ["dark cyan 2", "#134f5c"], ["dark cornflower blue 2", "#1155cc"], ["dark blue 2", "#0b5394"], ["dark purple 2", "#351c75"], ["dark magenta 2", "#741b47"],
    ["dark red berry 3", "#5b0f00"], ["dark red 3", "#660000"], ["dark orange 3", "#783f04"], ["dark yellow 3", "#7f6000"], ["dark green 3", "#274e13"], ["dark cyan 3", "#0c343d"], ["dark cornflower blue 3", "#1c4587"], ["dark blue 3", "#073763"], ["dark purple 3", "#20124d"], ["dark magenta 3", "#4c1130"],
  ];

  function googlePaletteHtml() {
    return GOOGLE_PALETTE.map(([name, hex]) => `<button type="button" class="swatch" data-swatch="${hex}" data-name="${name}" title="${name} ${hex}" aria-label="${name} ${hex}" style="--hex:${hex}"></button>`).join("");
  }

  function mount(host) {
    if (!host || host.__folioApi) return;
    ensureFonts();
    selfCheck();
    const Geom = root.FolioGeom;
    if (!Geom) throw new Error("Geometry module did not load");

    let doc = loadInitial();
    let tool = "select";
    let shapeKind = "roundrect";
    let selected = [];
    let nodeSel = null;
    let undo = [];
    let redo = [];
    let pen = null;
    let pointStamp = 0;
    let drag = null;
    let draft = null;
    let marquee = null;
    let spaceDown = false;
    let zoom = 1;
    let panX = 40;
    let panY = 40;
    let dirty = false;
    let saveTimer = 0;
    let raf = 0;
    let busy = false;
    let alive = true;
    let exporting = false;
    let svgHandle = null;
    let jsonHandle = null;
    let focusSnap = null;
    const imageBlobs = new Map();
    let currentStyle = {
      fill: loadPrefs().fill,
      stroke: loadPrefs().stroke,
      strokeWidth: loadPrefs().strokeWidth,
      opacity: 1,
    };
    const ac = new AbortController();
    const opt = { signal: ac.signal };
    const narrow = window.matchMedia("(max-width: 800px)");
    let inspectorOpen = false;
    let keyPick = false;
    let rulerCursor = null;
    let paletteTarget = "fill";

    host.innerHTML = "";
    const shell = document.createElement("div");
    shell.className = "folio" + (inspectorOpen ? " open-inspector" : "");
    shell.innerHTML = markup();
    host.appendChild(shell);
    let theme = "system";
    try {
      const saved = localStorage.getItem("gdrew.theme");
      if (saved === "light" || saved === "dark" || saved === "system") theme = saved;
    } catch (err) {
      theme = "system";
    }
    const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    function usingDark() {
      return theme === "dark" || (theme === "system" && themeQuery.matches);
    }
    function applyTheme() {
      shell.classList.toggle("theme-dark", usingDark());
      const btn = $("btn-theme");
      const names = { light: "Light", dark: "Dark", system: "System" };
      const label = "Theme: " + names[theme];
      if (btn) {
        btn.innerHTML = theme === "dark" ? ICONS.moon : theme === "light" ? ICONS.sun : ICONS.monitor;
        btn.title = label;
        btn.setAttribute("aria-label", label);
      }
      const pick = $("pref-theme");
      if (pick && document.activeElement !== pick) pick.value = theme;
    }
    themeQuery.addEventListener("change", () => {
      if (theme === "system") {
        applyTheme();
        paint();
      }
    });

    const stage = shell.querySelector("#folio-stage");
    const svg = shell.querySelector("#folio-svg");
    const cam = shell.querySelector("#folio-cam");
    const paper = shell.querySelector("#folio-paper");
    const gridFill = shell.querySelector("#folio-gridfill");
    const pattern = shell.querySelector("#folio-grid");
    const shapesEl = shell.querySelector("#folio-shapes");
    const overlayEl = shell.querySelector("#folio-overlay");
    stage.tabIndex = 0;

    function $(id) {
      return shell.querySelector("#" + id);
    }

    function loadInitial() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return starter();
        const doc = normalize(JSON.parse(raw));
        if (doc.name === "Folio") doc.name = "Gdrew";
        for (const shape of doc.shapes) {
          if (shape.type === "text" && shape.id === "s1" && shape.text === "Folio" && shape.size === 72) {
            shape.text = "Gdrew";
          }
        }
        if (doc.width === 960 && doc.height === 640 && doc.background === "#f3efe6") {
          doc.width = 1056;
          doc.height = 816;
          doc.background = "none";
        }
        return doc;
      } catch (err) {
        return starter();
      }
    }

    function markup() {
      const shapeBtns = LIBRARY
        .map(([id, label]) => `<button type="button" data-lib="${id}" title="${label}" aria-label="${label}" aria-pressed="${id === shapeKind ? "true" : "false"}">${shapeIcon(id)}</button>`)
        .join("");
      const fontOpts = FONTS.map(([stack, label]) => `<option value="${xml(stack)}" style="font-family: ${xml(stack)}">${label}</option>`).join("");
      return `
        <header class="chrome">
          <div class="menubar">
            <div class="brand"><span class="glyph">${ICONS.mark}</span><span class="name"><span class="mark">GDREW</span></span></div>
            <nav class="menus">
              <div class="menu">
                <button type="button" class="menu-btn" aria-expanded="false" aria-controls="menu-file">File</button>
                <div class="menu-pop" id="menu-file" hidden>
                  ${mb('id="btn-new"', "file", "New")}
                  ${mb('id="btn-open"', "folder", "Open")}
                  <div class="menu-sep"></div>
                  ${mb('data-cmd="png"', "image", "Import image")}
                  ${mb('id="btn-svg"', "download", "Download as SVG")}
                  ${mb('id="btn-json"', "download", "Download as JSON")}
                </div>
              </div>
              <div class="menu">
                <button type="button" class="menu-btn" aria-expanded="false" aria-controls="menu-edit">Edit</button>
                <div class="menu-pop" id="menu-edit" hidden>
                  ${mb('data-cmd="undo"', "undo", "Undo")}
                  ${mb('data-cmd="redo"', "redo", "Redo")}
                  <div class="menu-sep"></div>
                  ${mb('id="btn-dup"', "copy", "Duplicate")}
                  ${mb('id="btn-del"', "trash", "Delete")}
                  ${mb('data-cmd="all"', "all", "Select all")}
                  <div class="menu-sep"></div>
                  ${mb('data-cmd="prefs"', "gear", "Preferences")}
                </div>
              </div>
              <div class="menu">
                <button type="button" class="menu-btn" aria-expanded="false" aria-controls="menu-view">View</button>
                <div class="menu-pop" id="menu-view" hidden>
                  ${mb('data-cmd="zoom-in"', "zoomIn", "Zoom in")}
                  ${mb('data-cmd="zoom-out"', "zoomOut", "Zoom out")}
                  ${mb('data-zoom="1"', "hundred", "100%")}
                  ${mb('data-cmd="zoom-fit"', "fit", "Fit")}
                  <div class="menu-sep"></div>
                  ${mb('id="snap-toggle" aria-pressed="true"', "magnet", "Snap")}
                  <label class="snap-row"><span>Every</span><input id="snap-custom" type="text" inputmode="decimal" aria-label="Snap spacing" /></label>
                  ${mb('id="grid-toggle" aria-pressed="true"', "grid", "Grid")}
                  <div class="menu-sep"></div>
                  ${mb('data-tool="hand"', "hand", "Hand")}
                </div>
              </div>
              <div class="menu">
                <button type="button" class="menu-btn" aria-expanded="false" aria-controls="menu-insert">Insert</button>
                <div class="menu-pop" id="menu-insert" hidden>
                  ${mb('data-tool="text"', "text", "Text box")}
                  ${mb('data-cmd="png"', "image", "Image")}
                  ${mb('data-tool="line"', "line", "Line")}
                  ${mb('data-cmd="shapes"', "rect", "Shape")}
                </div>
              </div>
              <div class="menu">
                <button type="button" class="menu-btn" aria-expanded="false" aria-controls="menu-format">Format</button>
                <div class="menu-pop" id="menu-format" hidden>
                  ${mb('data-cmd="fill"', "fill", "Fill color")}
                  ${mb('data-cmd="border"', "border", "Border color")}
                  ${mb('data-cmd="weight"', "weight", "Border weight")}
                </div>
              </div>
              <div class="menu">
                <button type="button" class="menu-btn" aria-expanded="false" aria-controls="menu-arrange">Arrange</button>
                <div class="menu-pop" id="menu-arrange" hidden>
                  ${mb('id="btn-front"', "front", "Bring to front")}
                  ${mb('id="btn-forward"', "forward", "Bring forward")}
                  ${mb('id="btn-back"', "backward", "Send backward")}
                  ${mb('id="btn-to-back"', "back", "Send to back")}
                  <div class="menu-sep"></div>
                  ${mb('data-align="left"', "alignL", "Align left")}
                  ${mb('data-align="hcenter"', "alignC", "Align center")}
                  ${mb('data-align="right"', "alignR", "Align right")}
                  ${mb('data-align="top"', "alignT", "Align top")}
                  ${mb('data-align="vcenter"', "alignM", "Align middle")}
                  ${mb('data-align="bottom"', "alignB", "Align bottom")}
                  <div class="menu-sep"></div>
                  ${mb('data-align="page"', "page", "Center on page")}
                  ${mb('data-align="page-h"', "pageH", "Center horizontally")}
                  ${mb('data-align="page-v"', "pageV", "Center vertically")}
                  <div class="menu-sep"></div>
                  ${mb('data-align="dist-h"', "distH", "Distribute horizontally")}
                  ${mb('data-align="dist-v"', "distV", "Distribute vertically")}
                  <div class="menu-sep"></div>
                  ${mb('id="btn-flip-h"', "flipH", "Flip horizontally")}
                  ${mb('id="btn-flip-v"', "flipV", "Flip vertically")}
                  <div class="menu-sep"></div>
                  ${mb('id="btn-group"', "group", "Group")}
                  ${mb('id="btn-ungroup"', "ungroup", "Ungroup")}
                </div>
              </div>
              <div class="menu">
                <button type="button" class="menu-btn" aria-expanded="false" aria-controls="menu-tools">Tools</button>
                <div class="menu-pop" id="menu-tools" hidden>
                  ${mb('data-tool="nodes"', "nodes", "Nodes")}
                  ${mb('data-tool="pen"', "pen", "Pen")}
                  ${mb('data-tool="point"', "point", "Point pen")}
                  <div class="menu-sep"></div>
                  ${mb('class="op" data-op="union" title="Fuse the selected closed shapes into one"', "union", "Union")}
                  ${mb('class="op" data-op="subtract" title="Cut the front shape out of the back shape"', "subtract", "Subtract")}
                  ${mb('class="op" data-op="intersect" title="Keep only the overlap. The back shape is the subject."', "intersect", "Intersect")}
                  <div class="menu-sep"></div>
                  ${mb('data-cmd="on-path"', "onpath", "Text on path")}
                </div>
              </div>
              <div class="menu">
                <button type="button" class="menu-btn" aria-expanded="false" aria-controls="menu-help">Help</button>
                <div class="menu-pop" id="menu-help" hidden>
                  ${mb('data-cmd="shortcuts"', "keys", "Keyboard shortcuts")}
                </div>
              </div>
            </nav>
            <span class="version" title="Gdrew ${VERSION}">v${VERSION}</span>
          </div>
          <div class="toolbar">
            <div class="cluster">
              <button type="button" class="tool" id="btn-undo" aria-label="Undo" title="Undo">${ICONS.undo}</button>
              <button type="button" class="tool" id="btn-redo" aria-label="Redo" title="Redo">${ICONS.redo}</button>
            </div>
            <div class="sep"></div>
            <div class="pop-anchor">
              <button type="button" class="zoom-btn" id="zoom-btn" aria-expanded="false" aria-controls="menu-zoom" title="Zoom"><span id="zoom-label">100%</span></button>
              <div class="menu-pop" id="menu-zoom" hidden>
                ${mb('data-cmd="zoom-fit" id="zoom-fit"', "fit", "Fit")}
                ${mb('data-zoom="0.5"', "zoomOut", "50%")}
                ${mb('data-zoom="1"', "hundred", "100%")}
                ${mb('data-zoom="2"', "zoomIn", "200%")}
                ${mb('id="zoom-in"', "zoomIn", "Zoom in")}
                ${mb('id="zoom-out"', "zoomOut", "Zoom out")}
              </div>
            </div>
            <div class="sep"></div>
            <div class="cluster">
              <button type="button" class="tool" id="tool-select" data-tool="select" aria-label="Select" title="Select (V)">${ICONS.select}</button>
              <button type="button" class="tool" id="tool-nodes" data-tool="nodes" aria-label="Nodes" title="Nodes (A)">${ICONS.nodes}</button>
              <button type="button" class="tool" id="tool-line" data-tool="line" aria-label="Line" title="Line (L)">${ICONS.line}</button>
              <div class="shape-pick" id="shape-pick"><button type="button" class="tool" id="tool-shape" data-tool="shape" aria-label="Shape" title="Shape">${shapeIcon("roundrect")}</button><button type="button" class="shape-caret" id="shape-caret" aria-label="Choose a shape" aria-expanded="false" title="Choose a shape"><svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg></button></div>
              <button type="button" class="tool" id="tool-text" data-tool="text" aria-label="Text box" title="Text box (T)">${ICONS.text}</button>
              <button type="button" class="tool" id="btn-png" aria-label="Image" title="Import an image, or paste one">${ICONS.image}</button>
            </div>
            <div class="sep"></div>
            <div class="cluster">
              <button type="button" class="tool" data-tool="pen" aria-label="Pen" title="Pen (P)">${ICONS.pen}</button>
              <button type="button" class="tool" data-tool="point" aria-label="Point pen" title="Point pen (Y). Right-click starts and adds corners. Left-click adds smooth nodes. Double-click ends an open path. Click the start to close.">${ICONS.point}</button>
              <button type="button" class="tool" data-tool="hand" aria-label="Hand" title="Hand (H)">${ICONS.hand}</button>
              <button type="button" class="tool" data-op="union" aria-label="Union" title="Union">${ICONS.union}</button>
              <button type="button" class="tool" data-op="subtract" aria-label="Subtract" title="Subtract">${ICONS.subtract}</button>
              <button type="button" class="tool" data-op="intersect" aria-label="Intersect" title="Intersect">${ICONS.intersect}</button>
              <button type="button" class="tool" data-cmd="on-path" aria-label="Text on path" title="Text on path">${ICONS.onpath}</button>
            </div>
            <div class="sep"></div>
            <div class="cluster">
              <button type="button" class="tool" data-align="dist-h" aria-label="Distribute horizontally" title="Distribute horizontally">${ICONS.distH}</button>
              <button type="button" class="tool" data-align="dist-v" aria-label="Distribute vertically" title="Distribute vertically">${ICONS.distV}</button>
            </div>
            <div class="sep"></div>
            <div class="cluster">
              <button type="button" class="tool paint" id="btn-fill" aria-expanded="false" title="Fill color" aria-label="Fill color"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M16 3 8 11l5 5 8-8-5-5z"/><path d="M8 11 4.5 14.5a2.1 2.1 0 0 0 3 3L11 14"/><path d="M7 19c0 1.4-1.6 3-1.6 3S3.8 20.4 3.8 19a1.6 1.6 0 0 1 3.2 0z" fill="currentColor" stroke="none"/></svg><i id="fill-chip"></i></button>
              <button type="button" class="tool paint" id="btn-border" aria-expanded="false" title="Border color" aria-label="Border color"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 16.5 7.5"/><path d="m14 5 5 5"/><path d="M12.5 7.5 5 20H3v-2z"/></svg><i id="border-chip"></i></button>
              <div class="pop-anchor">
                <button type="button" class="tool" id="btn-weight" aria-expanded="false" aria-controls="weight-pop" title="Border weight" aria-label="Border weight">${ICONS.weight}</button>
                <div class="menu-pop" id="weight-pop" hidden>
                  <button type="button" data-weight="1">1 px</button>
                  <button type="button" data-weight="2">2 px</button>
                  <button type="button" data-weight="3">3 px</button>
                  <button type="button" data-weight="4">4 px</button>
                  <button type="button" data-weight="8">8 px</button>
                </div>
              </div>
            </div>
            <div class="sep"></div>
            <div class="cluster text-tools" id="text-tools" hidden>
              <select id="text-font" class="font-select" aria-label="Font">${fontOpts}</select>
              <input id="text-size" class="size-input" type="text" inputmode="decimal" aria-label="Font size" />
            </div>
            <button type="button" class="tool" id="btn-theme" aria-label="Theme" title="Theme: system">${ICONS.monitor}</button>
            <button type="button" id="props-toggle" aria-pressed="false">Format options</button>
          </div>
        </header>
        <div class="shape-pop" id="shape-pop" hidden role="menu"><button type="button" data-tool="rect" title="Rectangle" aria-label="Rectangle">${ICONS.rect}</button><button type="button" data-tool="ellipse" title="Ellipse" aria-label="Ellipse">${ICONS.ellipse}</button>${shapeBtns}</div>
        <div class="color-pop" id="color-pop" hidden>
          <div id="sec-style" class="fields">
            <label class="field" id="field-fill"><span>Fill</span><input id="prop-fill" type="color" /></label>
            <label class="field check" id="field-nofill"><input id="prop-nofill" type="checkbox" /> No fill</label>
            <label class="field" id="field-stroke"><span>Border</span><input id="prop-stroke" type="color" /></label>
            <label class="field" id="field-sw"><span class="len-label" data-base="Border">Border</span><input id="prop-sw" type="text" inputmode="decimal" /></label>
            <label class="field wide"><span>Opacity</span><input id="prop-op" type="range" min="0" max="100" /></label>
          </div>
          <div class="color-tools">
            <button type="button" class="tool" id="btn-dropper" title="Eyedropper" aria-label="Eyedropper">${ICONS.dropper}</button>
            <label class="wheel-label" title="Custom color">${ICONS.wheel}<input id="custom-color" type="color" value="#000000" aria-label="Custom color" /></label>
          </div>
          <button type="button" class="swatch-none" data-swatch="none" data-name="transparent" title="transparent" aria-label="transparent"><span class="mi">${ICONS.trash}</span>Transparent</button>
          <div class="palette" id="google-palette">${googlePaletteHtml()}</div>
          <p class="palette-name" id="palette-name">black #000000</p>
        </div>
        <div class="menu-pop" id="ctx" hidden>
          ${mb('data-cmd="dup"', "copy", "Duplicate")}
          ${mb('data-cmd="del"', "trash", "Delete")}
          <div class="menu-sep"></div>
          ${mb('data-cmd="front"', "front", "Bring to front")}
          ${mb('data-cmd="forward"', "forward", "Bring forward")}
          ${mb('data-cmd="backward"', "backward", "Send backward")}
          ${mb('data-cmd="back"', "back", "Send to back")}
          <div class="menu-sep"></div>
          ${mb('data-cmd="flip-h"', "flipH", "Flip horizontally")}
          ${mb('data-cmd="flip-v"', "flipV", "Flip vertically")}
          <div class="menu-sep"></div>
          ${mb('data-align="page"', "page", "Center on page")}
          ${mb('data-align="page-h"', "pageH", "Center horizontally")}
          ${mb('data-align="page-v"', "pageV", "Center vertically")}
          <div class="menu-sep"></div>
          ${mb('data-align="dist-h"', "distH", "Distribute horizontally")}
          ${mb('data-align="dist-v"', "distV", "Distribute vertically")}
          <div class="menu-sep"></div>
          ${mb('data-cmd="group"', "group", "Group")}
          ${mb('data-cmd="ungroup"', "ungroup", "Ungroup")}
        </div>
        <div class="dialog" id="prefs" hidden>
          <div class="dialog-card">
            <div class="dialog-head">
              <h2>Preferences</h2>
              <button type="button" id="prefs-close" aria-label="Close">×</button>
            </div>
            <h3 class="pref-sec">Page</h3>
            <div class="fields">
              <label class="field wide"><span>Name</span><input id="doc-name" type="text" maxlength="80" /></label>
              <label class="field wide"><span>Units</span>
                <select id="doc-unit" title="How lengths are shown. The drawing itself stays in pixels, 96 per inch.">
                  <option value="px">pixels</option>
                  <option value="mm">millimeters</option>
                  <option value="cm">centimeters</option>
                  <option value="decimal">decimal inches</option>
                  <option value="fraction">fractional inches</option>
                </select>
              </label>
              <label class="field"><span class="len-label" data-base="Width">Width</span><input id="doc-w" type="text" inputmode="decimal" /></label>
              <label class="field"><span class="len-label" data-base="Height">Height</span><input id="doc-h" type="text" inputmode="decimal" /></label>
              <label class="field"><span>Page color</span><input id="doc-bg" type="color" /></label>
              <label class="field check"><input id="pref-page-none" type="checkbox" /> Transparent</label>
              <label class="field wide"><span>Appearance</span>
                <select id="pref-theme">
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label class="field"><span class="len-label" data-base="Snap">Snap</span><input id="pref-snap" type="text" inputmode="decimal" /></label>
            </div>
            <h3 class="pref-sec">New shapes</h3>
            <p class="hint">Used by the next rectangle, ellipse, line, or shape. Saved on this browser.</p>
            <div class="fields">
              <label class="field"><span>Fill</span><input id="pref-fill" type="color" value="#ffffff" /></label>
              <label class="field check"><input id="pref-nofill" type="checkbox" /> No fill</label>
              <label class="field"><span>Stroke</span><input id="pref-stroke" type="color" value="#000000" /></label>
              <label class="field"><span class="len-label" data-base="Stroke width">Stroke width</span><input id="pref-sw" type="text" inputmode="decimal" /></label>
            </div>
            <div class="row" style="margin-top:12px"><button type="button" id="prefs-done">Done</button></div>
          </div>
        </div>
        <div class="dialog" id="shortcuts" hidden>
          <div class="dialog-card shortcuts-card">
            <div class="dialog-head">
              <h2>Keyboard shortcuts</h2>
              <button type="button" id="shortcuts-close" aria-label="Close">×</button>
            </div>
            <input id="shortcut-search" type="search" placeholder="Search" aria-label="Search shortcuts" />
            <div id="shortcut-list"></div>
          </div>
        </div>
        <div class="workspace">
          <div class="stage" id="folio-stage">
            <div class="ruler-corner" id="ruler-corner">px</div>
            <canvas class="ruler" id="ruler-x"></canvas>
            <canvas class="ruler" id="ruler-y"></canvas>
            <svg id="folio-svg" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <filter id="folio-shadow" x="-15%" y="-15%" width="130%" height="130%">
                  <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.4"/>
                </filter>
                <pattern id="folio-grid" patternUnits="userSpaceOnUse" width="10" height="10"></pattern>
              </defs>
              <g id="folio-cam">
                <rect id="folio-paper" filter="url(#folio-shadow)"/>
                <rect id="folio-gridfill"/>
                <g id="folio-shapes"></g>
                <g id="folio-overlay"></g>
              </g>
            </svg>
          </div>
          <aside class="inspector" aria-label="Properties">
            <h2 id="sel-label">Format options</h2>
            <label class="field wide"><span>Select</span><select id="shape-list" aria-label="Select a shape"></select></label>
            <label class="field wide" id="field-shape-name"><span>Name</span><input id="shape-name" type="text" maxlength="40" placeholder="Optional" /></label>
            <div id="sec-geom" class="fields">
              <label class="field"><span class="len-label" data-base="X">X</span><input id="prop-x" type="text" inputmode="decimal" /></label>
              <label class="field"><span class="len-label" data-base="Y">Y</span><input id="prop-y" type="text" inputmode="decimal" /></label>
              <label class="field" id="field-w"><span class="len-label" data-base="Width">Width</span><input id="prop-w" type="text" inputmode="decimal" /></label>
              <label class="field" id="field-h"><span class="len-label" data-base="Height">Height</span><input id="prop-h" type="text" inputmode="decimal" /></label>
              <label class="field" id="field-sx"><span>Width scale (%)</span><input id="prop-sx" type="text" inputmode="decimal" title="Percent of the size this shape had when scaling started. 100 is that size." /></label>
              <label class="field" id="field-sy"><span>Height scale (%)</span><input id="prop-sy" type="text" inputmode="decimal" title="Percent of the size this shape had when scaling started. 100 is that size." /></label>
              <label class="field wide check" id="field-lock"><input id="prop-lock" type="checkbox" checked /> Lock aspect ratio</label>
              <label class="field wide"><span>Rotation</span><input id="prop-rot" type="number" step="1" /></label>
            </div>
            <div class="field wide" id="field-on-path"><button type="button" data-cmd="on-path">Text on path</button></div>
            <div id="sec-path">
              <h2>Path</h2>
              <div class="fields">
                <label class="field"><span>Fill rule</span>
                  <select id="path-rule"><option value="nonzero">nonzero</option><option value="evenodd">evenodd</option></select>
                </label>
                <div class="field"><span>Anchor</span>
                  <div class="row">
                    <button type="button" id="node-corner">Corner</button>
                    <button type="button" id="node-smooth">Smooth</button>
                  </div>
                </div>
                <div class="field wide"><button type="button" id="btn-add-node" title="Insert a node halfway along the segment after the selected node">Add node</button></div>
                <label class="field"><span class="len-label" data-base="Anchor X">Anchor X</span><input id="node-x" type="text" inputmode="decimal" /></label>
                <label class="field"><span class="len-label" data-base="Anchor Y">Anchor Y</span><input id="node-y" type="text" inputmode="decimal" /></label>
                <div class="field wide"><span>Path data</span><pre id="path-d" class="path-d"></pre></div>
              </div>
            </div>
            <div id="sec-text">
              <h2>Text</h2>
              <div class="fields">
                <label class="field wide"><span>Content</span><textarea id="text-body"></textarea></label>
                <label class="field" id="field-offset"><span>Start angle</span><input id="tp-angle" type="number" step="1" title="Degrees around the shape. 0 is the top of a circle. 90 is a quarter turn." /></label>
                <label class="field" id="field-baseline"><span class="len-label" data-base="Baseline">Baseline</span><input id="tp-baseline" type="text" inputmode="decimal" title="Distance off the path. Positive moves the letters across the baseline." /></label>
                <label class="field" id="field-side"><span>Side</span>
                  <select id="tp-side"><option value="outside">outside</option><option value="inside">inside</option></select>
                </label>
                <label class="field" id="field-tracking"><span class="len-label" data-base="Letter spacing">Letter spacing</span><input id="tp-tracking" type="text" inputmode="decimal" /></label>
              </div>
            </div>
            <div id="sec-image" hidden>
              <h2>Image</h2>
              <p class="hint">Make one color of a pasted image transparent. Tolerance also fades the nearby shades.</p>
              <div class="fields">
                <label class="field"><span>Color</span><input id="img-key" type="color" value="#ffffff" /></label>
                <label class="field"><span>Tolerance <b id="img-tol-val">18</b></span><input id="img-tol" type="range" min="0" max="90" value="18" /></label>
                <div class="field wide"><button type="button" id="btn-pick-key">Pick color on image</button></div>
                <div class="field wide"><button type="button" id="btn-knock">Make transparent</button></div>
              </div>
            </div>
          </aside>
        </div>
        <footer class="statusbar">
          <span id="folio-tool-label">Select</span>
          <span id="folio-status" role="status"></span>
          <span id="folio-coords"></span>
          <span class="spacer"></span>
        </footer>
        <input id="file-open" type="file" accept=".svg,.json,image/svg+xml,application/json" hidden />
        <input id="file-png" type="file" accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif" hidden />`;
    }

    function byId(id) {
      return doc.shapes.find((s) => s.id === id) || null;
    }

    function allocId() {
      return "s" + doc.nextId++;
    }

    function setStatus(text) {
      const el = $("folio-status");
      if (el) el.textContent = text;
    }

    function snapN(v) {
      if (!doc.snap || !doc.grid) return v;
      return Math.round(v / doc.grid) * doc.grid;
    }

    function snapPt(p) {
      return { x: snapN(p.x), y: snapN(p.y) };
    }

    function pushHist(snapshot) {
      undo.push(snapshot);
      if (undo.length > 80) undo.shift();
      redo = [];
      dirtySave();
    }

    function dirtySave() {
      dirty = true;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSave, 280);
    }

    function flushSave() {
      if (!dirty) return;
      try {
        localStorage.setItem(KEY, JSON.stringify(doc));
      } catch (err) {
        setStatus("This browser refused to store the draft");
      }
    }

    function clientToWorld(cx, cy) {
      const ctm = cam.getScreenCTM();
      if (!ctm) return { x: 0, y: 0 };
      const pt = svg.createSVGPoint();
      pt.x = cx;
      pt.y = cy;
      const p = pt.matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    }

    function defaultSnapPx(unit) {
      return snapForUnit(unit);
    }

    function visualGrid() {
      if (!doc.showGrid) return doc.grid || 8;
      let g = doc.grid || 8;
      while (g * zoom < 6 && g < 800) g *= 2;
      return g;
    }

    function updateGrid() {
      const g = visualGrid();
      const solid = doc.background && doc.background !== "none";
      const darkPaper = solid && luminance(doc.background) <= 0.55;
      const col = darkPaper || (!solid && usingDark()) ? "rgba(255,255,255,0.62)" : "rgba(28,28,28,0.42)";
      pattern.setAttribute("width", String(g));
      pattern.setAttribute("height", String(g));
      setSvgHtml(pattern, `<path d="M ${g} 0 L 0 0 0 ${g}" fill="none" stroke="${col}" stroke-width="${n(Math.max(1, 1.15 / zoom))}"/>`);
      gridFill.setAttribute("x", "0");
      gridFill.setAttribute("y", "0");
      gridFill.setAttribute("width", String(doc.width));
      gridFill.setAttribute("height", String(doc.height));
      gridFill.setAttribute("fill", doc.showGrid ? "url(#folio-grid)" : "none");
      paper.setAttribute("x", "0");
      paper.setAttribute("y", "0");
      paper.setAttribute("width", String(doc.width));
      paper.setAttribute("height", String(doc.height));
      paper.setAttribute("fill", solid ? doc.background : "none");
      paper.setAttribute("stroke", usingDark() ? "rgba(243,239,230,0.55)" : "rgba(20,23,28,0.45)");
      paper.setAttribute("stroke-width", String(1 / zoom));
    }

    function paintAttrs(s) {
      const fill = !s.fill || s.fill === "none" ? "none" : s.fill;
      const stroke = !s.stroke || s.stroke === "none" ? "none" : s.stroke;
      return `fill="${xml(fill)}" stroke="${xml(stroke)}" stroke-width="${n(s.strokeWidth || 0)}" stroke-linejoin="round" stroke-linecap="round" opacity="${n(s.opacity == null ? 1 : s.opacity)}"`;
    }

    function hitUnder(s) {
      const sw = n(Math.max(s.strokeWidth || 0, 14 / zoom));
      if (s.type === "rect") return `<rect width="${n(s.w)}" height="${n(s.h)}" fill="none" stroke="transparent" stroke-width="${sw}"/>`;
      if (s.type === "image") return `<rect width="${n(s.w)}" height="${n(s.h)}" fill="transparent"/>`;
      if (s.type === "ellipse") {
        return `<ellipse cx="${n(s.w / 2)}" cy="${n(s.h / 2)}" rx="${n(Math.abs(s.w) / 2)}" ry="${n(Math.abs(s.h) / 2)}" fill="none" stroke="transparent" stroke-width="${sw}"/>`;
      }
      if (s.type === "line") return `<line x1="${n(s.x1)}" y1="${n(s.y1)}" x2="${n(s.x2)}" y2="${n(s.y2)}" stroke="transparent" stroke-width="${sw}"/>`;
      if (s.type === "path") return `<path d="${ringsToD(s)}" fill="none" stroke="transparent" stroke-width="${sw}"/>`;
      return "";
    }

    function textBlock(text, size) {
      const lines = String(text ?? "").split("\n");
      if (lines.length === 1) return xml(lines[0]);
      return lines
        .map((line, i) => `<tspan x="0" dy="${i === 0 ? 0 : n(size * 1.15)}">${xml(line)}</tspan>`)
        .join("");
    }

    function shapeTransform(s) {
      const c = localCenter(s);
      const flip = s.flipH || s.flipV
        ? ` translate(${n(c.x)} ${n(c.y)}) scale(${s.flipH ? -1 : 1} ${s.flipV ? -1 : 1}) translate(${n(-c.x)} ${n(-c.y)})`
        : "";
      return `translate(${n(s.x || 0)} ${n(s.y || 0)}) rotate(${n(s.rotation || 0)} ${n(c.x)} ${n(c.y)})${flip}`;
    }

    function shapeMarkup(s, nested) {
      if (s.type === "group") {
        const xf = shapeTransform(s);
        const kids = (s.children || []).map((child) => shapeMarkup(child, true)).join("");
        const attr = nested ? "" : ` data-shape="${s.id}"`;
        return `<g${attr} transform="${xf}" opacity="${n(s.opacity == null ? 1 : s.opacity)}">${kids}</g>`;
      }
      const xf = shapeTransform(s);
      let body = exporting ? "" : hitUnder(s);
      if (s.type === "rect") body += `<rect width="${n(s.w)}" height="${n(s.h)}" ${paintAttrs(s)}/>`;
      else if (s.type === "ellipse") {
        body += `<ellipse cx="${n(s.w / 2)}" cy="${n(s.h / 2)}" rx="${n(Math.abs(s.w) / 2)}" ry="${n(Math.abs(s.h) / 2)}" ${paintAttrs(s)}/>`;
      } else if (s.type === "line") {
        body += `<line x1="${n(s.x1)}" y1="${n(s.y1)}" x2="${n(s.x2)}" y2="${n(s.y2)}" ${paintAttrs(s)}/>`;
      } else if (s.type === "path") {
        body += `<path d="${ringsToD(s)}" fill-rule="${s.fillRule || "nonzero"}" ${paintAttrs(s)}/>`;
      } else if (s.type === "text") {
        const fill = !s.fill || s.fill === "none" ? "#14171c" : s.fill;
        body += `<text x="0" y="0" font-family="${xml(s.font)}" font-weight="${n(s.fontWeight || weightFor(s.font))}" font-size="${n(s.size)}" fill="${xml(fill)}" opacity="${n(s.opacity == null ? 1 : s.opacity)}">${textBlock(s.text, s.size || 16)}</text>`;
      } else if (s.type === "image" && s.src) {
        body += `<image href="${xml(imageHref(s))}" width="${n(s.w)}" height="${n(s.h)}" preserveAspectRatio="none" opacity="${n(s.opacity == null ? 1 : s.opacity)}"/>`;
      }
      if (s.type === "path" || s.type === "ellipse" || s.type === "rect") body += attachedText(s);
      const attr = nested ? "" : ` data-shape="${s.id}"`;
      return `<g${attr} transform="${xf}">${body}</g>`;
    }

    function attachedText(host) {
      let html = "";
      for (const t of doc.shapes) {
        if (t.type === "textPath" && t.pathId === host.id) html += textPathMarkup(host, t);
      }
      return html;
    }

    function textPathMarkup(host, t) {
      const on = !exporting && selected.includes(t.id);
      const side = t.side === "inside" ? "inside" : "outside";
      const tracking = num(t.letterSpacing, 0);
      const angle = num(t.startAngle, 0);
      const dy = num(t.baseline, 0);
      const along = host.type === "ellipse" ? "0" : n((((angle % 360) + 360) % 360) / 3.6) + "%";
      return `<path id="fp-${t.id}" d="${guideD(host, side, angle)}" fill="none" stroke="none"/>` +
        `<text data-shape="${t.id}" font-family="${xml(t.font)}" font-weight="${n(t.fontWeight || weightFor(t.font))}" font-size="${n(t.size)}" letter-spacing="${n(tracking)}" fill="${xml(t.fill || "#000000")}" opacity="${n(t.opacity == null ? 1 : t.opacity)}" stroke="${on ? "#3d8bfd" : "none"}" stroke-width="${on ? 0.6 : 0}"><textPath href="#fp-${t.id}" startOffset="${along}" text-anchor="start"><tspan dy="${n(dy)}">${xml(String(t.text || "").replace(/\s+/g, " "))}</tspan></textPath></text>`;
    }

    function circleAt(p, attrs, r) {
      return `<circle ${attrs} cx="${n(p.x)}" cy="${n(p.y)}" r="${n(r)}" />`;
    }

    function selectionChrome(s) {
      if (s.type === "textPath") return "";
      const b = localBBox(s);
      const corners = [
        [b.minX, b.minY],
        [b.maxX, b.minY],
        [b.maxX, b.maxY],
        [b.minX, b.maxY],
      ].map(([x, y]) => localToWorld(s, { x: x, y: y }));
      let html = `<path d="M ${corners.map((p) => n(p.x) + " " + n(p.y)).join(" L ")} Z" fill="none" stroke="#3d8bfd" stroke-width="1.25" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
      if (s.type !== "text") {
        for (const name of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
          const w = localToWorld(s, handlePoint(b, name));
          html += circleAt(w, `data-handle="${name}" data-shape="${s.id}" fill="#f3efe6" stroke="#3d8bfd" stroke-width="${n(1.25 / zoom)}"`, 5 / zoom);
        }
      }
      const top = localToWorld(s, { x: (b.minX + b.maxX) / 2, y: b.minY });
      const c = localToWorld(s, localCenter(s));
      let dx = top.x - c.x;
      let dy = top.y - c.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const rot = { x: top.x + dx * (26 / zoom), y: top.y + dy * (26 / zoom) };
      html += `<line x1="${n(top.x)}" y1="${n(top.y)}" x2="${n(rot.x)}" y2="${n(rot.y)}" stroke="#3d8bfd" stroke-width="${n(1 / zoom)}" pointer-events="none"/>`;
      html += circleAt(rot, `data-handle="rotate" data-shape="${s.id}" fill="#0f8b7d" stroke="#14171c" stroke-width="${n(1 / zoom)}"`, 6 / zoom);
      const off = 22 / zoom;
      const c0 = localToWorld(s, { x: b.minX - off, y: b.minY - off });
      const grip = 7 / zoom;
      html += `<g data-handle="move" data-shape="${s.id}" style="cursor:grab">`;
      html += `<rect x="${n(c0.x - grip)}" y="${n(c0.y - grip)}" width="${n(grip * 2)}" height="${n(grip * 2)}" rx="${n(2 / zoom)}" fill="#f3efe6" stroke="#14171c" stroke-width="${n(1.25 / zoom)}"/>`;
      html += `<path d="M ${n(c0.x - grip * 0.55)} ${n(c0.y)} H ${n(c0.x + grip * 0.55)} M ${n(c0.x)} ${n(c0.y - grip * 0.55)} V ${n(c0.y + grip * 0.55)}" fill="none" stroke="#14171c" stroke-width="${n(1.2 / zoom)}" pointer-events="none"/>`;
      html += `</g>`;
      return html;
    }

    function nodeChrome(s) {
      let html = "";
      (s.rings || []).forEach((ring, ri) => {
        ring.forEach((a, ai) => {
          const p = localToWorld(s, a);
          const active = nodeSel && nodeSel.shapeId === s.id && nodeSel.ring === ri && nodeSel.index === ai;
          if (Math.hypot(a.inX, a.inY) > 0.35) {
            const inn = localToWorld(s, { x: a.x + a.inX, y: a.y + a.inY });
            html += `<line x1="${n(p.x)}" y1="${n(p.y)}" x2="${n(inn.x)}" y2="${n(inn.y)}" stroke="#0f8b7d" stroke-width="${n(1 / zoom)}" pointer-events="none"/>`;
            html += circleAt(inn, `data-kind="in" data-shape="${s.id}" data-ring="${ri}" data-index="${ai}" fill="#0f8b7d" stroke="#14171c" stroke-width="${n(1 / zoom)}"`, 4.5 / zoom);
          }
          if (Math.hypot(a.outX, a.outY) > 0.35) {
            const out = localToWorld(s, { x: a.x + a.outX, y: a.y + a.outY });
            html += `<line x1="${n(p.x)}" y1="${n(p.y)}" x2="${n(out.x)}" y2="${n(out.y)}" stroke="#0f8b7d" stroke-width="${n(1 / zoom)}" pointer-events="none"/>`;
            html += circleAt(out, `data-kind="out" data-shape="${s.id}" data-shape-kind="1" data-ring="${ri}" data-index="${ai}" fill="#f3efe6" stroke="#0f8b7d" stroke-width="${n(1 / zoom)}"`, 4.5 / zoom);
          }
          const side = 8 / zoom;
          const fill = active ? "#3d8bfd" : "#f3efe6";
          const mark = `data-kind="anchor" data-shape="${s.id}" data-ring="${ri}" data-index="${ai}" fill="${fill}" stroke="#14171c" stroke-width="${n(1.2 / zoom)}"`;
          if (a.mode === "smooth") html += circleAt(p, mark, side / 2);
          else html += `<rect ${mark} x="${n(p.x - side / 2)}" y="${n(p.y - side / 2)}" width="${n(side)}" height="${n(side)}"/>`;
        });
      });
      return html;
    }

    function penOverlay() {
      if (!pen || !pen.anchors.length) return "";
      let d = anchorsToD(pen.anchors, false);
      if (!pen.dragging && pen.hover) d += ` L ${n(pen.hover.x)} ${n(pen.hover.y)}`;
      let html = `<path d="${d}" fill="none" stroke="#3d8bfd" stroke-width="1.25" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
      for (const a of pen.anchors) {
        const side = 7 / zoom;
        if (a.mode === "smooth") html += circleAt(a, 'fill="#f3efe6" stroke="#3d8bfd" stroke-width="' + n(1 / zoom) + '" pointer-events="none"', 4 / zoom);
        else html += `<rect x="${n(a.x - side / 2)}" y="${n(a.y - side / 2)}" width="${n(side)}" height="${n(side)}" fill="#f3efe6" stroke="#3d8bfd" stroke-width="${n(1 / zoom)}" pointer-events="none"/>`;
        if (Math.hypot(a.outX, a.outY) > 0.4) {
          html += `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(a.x + a.outX)}" y2="${n(a.y + a.outY)}" stroke="#0f8b7d" stroke-width="${n(1 / zoom)}" pointer-events="none"/>`;
          html += circleAt({ x: a.x + a.outX, y: a.y + a.outY }, 'fill="#0f8b7d" pointer-events="none"', 3.5 / zoom);
        }
      }
      return html;
    }

    function overlayMarkup() {
      let html = "";
      if (draft) html += shapeMarkup(draft);
      if (marquee) {
        const x = Math.min(marquee.x0, marquee.x1);
        const y = Math.min(marquee.y0, marquee.y1);
        html += `<rect x="${n(x)}" y="${n(y)}" width="${n(Math.abs(marquee.x1 - marquee.x0))}" height="${n(Math.abs(marquee.y1 - marquee.y0))}" fill="rgba(61,139,253,0.12)" stroke="#3d8bfd" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
      }
      html += penOverlay();
      if (tool === "select") {
        for (const id of selected) {
          const s = byId(id);
          if (s) html += selectionChrome(s);
        }
      } else if (tool === "nodes" && selected.length === 1) {
        const s = byId(selected[0]);
        if (s && s.type === "path") html += nodeChrome(s);
      }
      return html;
    }

    function imageHref(s) {
      if (!s || !s.src) return "";
      if (exporting) return s.src;
      const hit = imageBlobs.get(s.id);
      if (hit && hit.src === s.src) return hit.url;
      if (hit) URL.revokeObjectURL(hit.url);
      try {
        const url = URL.createObjectURL(dataUrlToBlob(s.src));
        imageBlobs.set(s.id, { src: s.src, url: url });
        return url;
      } catch (err) {
        return s.src;
      }
    }

    function releaseImageBlobs() {
      const live = new Set();
      const walk = (shape) => {
        if (!shape) return;
        if (shape.type === "image") live.add(shape.id);
        if (shape.type === "group") (shape.children || []).forEach(walk);
      };
      doc.shapes.forEach(walk);
      for (const [id, hit] of imageBlobs) {
        if (live.has(id)) continue;
        URL.revokeObjectURL(hit.url);
        imageBlobs.delete(id);
      }
    }

    let shapesHtml = "";
    let overlayHtml = "";
    let rulerRaf = 0;

    function paint() {
      updateGrid();
      cam.setAttribute("transform", `translate(${n(panX)} ${n(panY)}) scale(${n(zoom)})`);
      const html = doc.shapes.filter((s) => s.type !== "textPath").map((s) => shapeMarkup(s)).join("");
      if (html !== shapesHtml) {
        shapesHtml = html;
        setSvgHtml(shapesEl, html);
      }
      const over = overlayMarkup();
      if (over !== overlayHtml) {
        overlayHtml = over;
        setSvgHtml(overlayEl, over);
      }
      releaseImageBlobs();
      const zl = $("zoom-label");
      if (zl) zl.textContent = Math.round(zoom * 100) + "%";
      host.__folio = { getDoc: () => doc, getTool: () => tool, getSelected: () => selected.slice() };
      drawRulers();
    }

    function rulerStep() {
      const unit = currentUnit();
      const steps = unit === "px" ? [10, 20, 50, 100, 200, 500, 1000]
        : unit === "mm" ? [10, 20, 50, 100, 200, 500]
        : unit === "cm" ? [1, 2, 5, 10, 20, 50]
        : [1, 2, 4, 6, 12];
      let chosen = steps[steps.length - 1];
      for (const step of steps) {
        if (unitToPx(step, unit) * zoom >= 72) {
          chosen = step;
          return chosen;
        }
      }
      return chosen;
    }

    function rulerLabel(unitValue, unit) {
      if (unit === "fraction") return formatInches(unitValue);
      if (unit === "px") return String(Math.round(unitValue));
      const digits = Math.abs(unitValue) >= 10 ? 0 : Math.abs(unitValue) >= 1 ? 1 : 2;
      const rounded = Math.round(unitValue * 10 ** digits) / 10 ** digits;
      return Object.is(rounded, -0) ? "0" : String(rounded);
    }

    function fitRulerCanvas(canvas) {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      const pw = Math.max(1, Math.round(w * dpr));
      const ph = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      return { ctx, w, h };
    }

    function drawRulers() {
      const xCanvas = $("ruler-x");
      const yCanvas = $("ruler-y");
      const corner = $("ruler-corner");
      if (!xCanvas || !yCanvas || !svg) return;
      const unit = currentUnit();
      const names = { px: "px", mm: "mm", cm: "cm", decimal: "in", fraction: "in" };
      if (corner) corner.textContent = names[unit] || "px";
      const svgRect = svg.getBoundingClientRect();
      if (svgRect.width < 8 || svgRect.height < 8) return;
      const origin = clientToWorld(svgRect.left, svgRect.top);
      const stepUnit = rulerStep();
      const style = getComputedStyle(shell);
      const tick = style.getPropertyValue("--ruler-tick").trim() || "rgba(26,26,26,0.28)";
      const num = style.getPropertyValue("--ruler-num").trim() || "rgba(26,26,26,0.4)";
      const mark = "#0f8b7d";
      const x = fitRulerCanvas(xCanvas);
      const y = fitRulerCanvas(yCanvas);
      const font = "600 10px 'SHKLR Mono Narrow', ui-monospace, monospace";
      x.ctx.font = font;
      y.ctx.font = font;
      const divs = unit === "decimal" || unit === "fraction" ? 16 : 10;
      const major = unitToPx(stepUnit, unit);
      const minor = major / divs;
      const midEvery = unit === "decimal" || unit === "fraction" ? 4 : 5;
      function drawTicks(ctx, horizontal, page, breadth, span) {
        if (!(minor > 0) || !(page > 0)) return;
        const raw = Math.floor(page / minor + 1e-6);
        const step = raw > 2000 ? Math.ceil(raw / 2000) : 1;
        for (let i = 0; i <= raw; i += step) {
          const w = i * minor;
          const s = (w - (horizontal ? origin.x : origin.y)) * zoom;
          if (s < -1 || s > span + 1) continue;
          const majorTick = i % divs === 0;
          const midTick = !majorTick && i % midEvery === 0;
          const len = majorTick ? breadth - 2 : midTick ? 11 : 6;
          ctx.strokeStyle = tick;
          ctx.lineWidth = 1;
          ctx.beginPath();
          if (horizontal) {
            ctx.moveTo(s, breadth);
            ctx.lineTo(s, breadth - len);
          } else {
            ctx.moveTo(breadth, s);
            ctx.lineTo(breadth - len, s);
          }
          ctx.stroke();
          if (majorTick) {
            ctx.fillStyle = num;
            const label = rulerLabel(pxToUnit(w, unit), unit);
            if (horizontal) ctx.fillText(label, s + 3, 11);
            else {
              ctx.save();
              ctx.translate(11, s - 3);
              ctx.rotate(-Math.PI / 2);
              ctx.fillText(label, 0, 0);
              ctx.restore();
            }
          }
        }
      }
      drawTicks(x.ctx, true, doc.width, x.h, x.w);
      drawTicks(y.ctx, false, doc.height, y.w, y.h);
      if (rulerCursor && rulerCursor.x >= 0 && rulerCursor.y >= 0 && rulerCursor.x <= doc.width && rulerCursor.y <= doc.height) {
        const mx = (rulerCursor.x - origin.x) * zoom;
        const my = (rulerCursor.y - origin.y) * zoom;
        x.ctx.strokeStyle = mark;
        x.ctx.lineWidth = 2;
        x.ctx.beginPath();
        x.ctx.moveTo(mx, 0);
        x.ctx.lineTo(mx, x.h);
        x.ctx.stroke();
        y.ctx.strokeStyle = mark;
        y.ctx.lineWidth = 2;
        y.ctx.beginPath();
        y.ctx.moveTo(0, my);
        y.ctx.lineTo(y.w, my);
        y.ctx.stroke();
      }
    }

    function requestRulers() {
      if (rulerRaf) return;
      rulerRaf = requestAnimationFrame(() => {
        rulerRaf = 0;
        if (alive) drawRulers();
      });
    }

    function requestPaint() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        paint();
        if (drag) syncCoords();
      });
    }

    function publishTool() {
      const labels = { select: "Select", nodes: "Nodes", pen: "Pen", point: "Point pen", rect: "Rectangle", ellipse: "Ellipse", line: "Line", text: "Text", hand: "Hand", shape: shapeLabel(shapeKind) };
      const shapeBtn = $("tool-shape");
      if (shapeBtn) {
        shapeBtn.innerHTML = shapeIcon(shapeKind);
        shapeBtn.title = shapeLabel(shapeKind);
        shapeBtn.setAttribute("aria-label", shapeLabel(shapeKind));
      }
      shell.querySelectorAll("[data-lib]").forEach((btn) => {
        btn.setAttribute("aria-pressed", String(btn.dataset.lib === shapeKind));
      });
      shell.querySelectorAll("[data-tool]").forEach((btn) => {
        btn.setAttribute("aria-pressed", String(btn.dataset.tool === tool));
      });
      const lab = $("folio-tool-label");
      if (lab) lab.textContent = labels[tool] || tool;
      stage.style.cursor = spaceDown || tool === "hand" ? (drag && drag.mode === "pan" ? "grabbing" : "grab") : tool === "select" || tool === "nodes" ? "default" : "crosshair";
    }

    function setTool(next) {
      if ((tool === "pen" || tool === "point") && next !== tool) commitPen(false);
      tool = next;
      if (tool !== "nodes") nodeSel = null;
      publishTool();
      paint();
      if (tool === "point") setStatus("Right-click to start the path");
    }

    function closeShapeMenu() {
      const pop = $("shape-pop");
      const caret = $("shape-caret");
      if (pop) pop.hidden = true;
      if (caret) caret.setAttribute("aria-expanded", "false");
    }

    function toggleShapeMenu() {
      const pop = $("shape-pop");
      const caret = $("shape-caret");
      const btn = $("tool-shape");
      if (!pop || !btn) return;
      const open = pop.hidden;
      pop.hidden = !open;
      if (caret) caret.setAttribute("aria-expanded", String(open));
      if (!open) return;
      const host = shell.getBoundingClientRect();
      const r = btn.getBoundingClientRect();
      pop.style.left = Math.max(8, r.left - host.left) + "px";
      pop.style.top = r.bottom - host.top + 6 + "px";
    }

    function setShapeKind(kind) {
      if (!LIBRARY.some((item) => item[0] === kind)) return;
      shapeKind = kind;
      closeShapeMenu();
      setTool("shape");
      setStatus(shapeLabel(kind));
    }

    function fit() {
      const r = svg.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) return false;
      const pad = 56;
      zoom = clamp(Math.min((r.width - pad) / doc.width, (r.height - pad) / doc.height), 0.05, 8);
      panX = (r.width - doc.width * zoom) / 2;
      panY = (r.height - doc.height * zoom) / 2;
      return true;
    }

    function fitSoon() {
      let tries = 0;
      const go = () => {
        if (fit()) {
          paint();
          return;
        }
        if (++tries < 20) requestAnimationFrame(go);
      };
      requestAnimationFrame(go);
    }

    function zoomAt(cx, cy, nz) {
      nz = clamp(nz, 0.05, 16);
      const rect = svg.getBoundingClientRect();
      const world = clientToWorld(cx, cy);
      zoom = nz;
      panX = cx - rect.left - world.x * zoom;
      panY = cy - rect.top - world.y * zoom;
      paint();
    }

    function setVal(id, value) {
      const el = $(id);
      if (!el || document.activeElement === el) return;
      const next = typeof value === "number" ? n(value) : String(value ?? "");
      if (el.value !== next) el.value = next;
    }

    function currentUnit() {
      return UNITS.indexOf(doc.unit) >= 0 ? doc.unit : "px";
    }

    function formatLen(px) {
      const unit = currentUnit();
      if (unit === "fraction") return formatInches(px / PX_PER_IN);
      const value = pxToUnit(px, unit);
      if (unit === "decimal") {
        const rounded = Math.round(value * 1000) / 1000;
        return Object.is(rounded, -0) ? "0" : String(rounded);
      }
      return n(value);
    }

    function parseLen(text, fallback) {
      const unit = currentUnit();
      const value = unit === "fraction" ? parseInches(text) : parseFloat(text);
      return Number.isFinite(value) ? unitToPx(value, unit) : fallback;
    }

    function readLen(id, fallback) {
      const el = $(id);
      return el ? parseLen(el.value, fallback) : fallback;
    }

    function setLen(id, px) {
      setVal(id, formatLen(px));
    }

    function applyUnitChrome() {
      const unit = currentUnit();
      const mark = unit === "decimal" || unit === "fraction" ? "in" : unit;
      shell.querySelectorAll(".len-label").forEach((el) => {
        el.textContent = el.dataset.base + " (" + mark + ")";
      });
      const unitEl = $("doc-unit");
      if (unitEl && document.activeElement !== unitEl) unitEl.value = unit;
    }

    function single() {
      return selected.length === 1 ? byId(selected[0]) : null;
    }

    function syncCoords() {
      const s = single();
      if (!s || s.type === "textPath") return;
      setLen("prop-x", s.x || 0);
      setLen("prop-y", s.y || 0);
      if (s.type === "rect" || s.type === "ellipse" || s.type === "image") {
        setLen("prop-w", s.w);
        setLen("prop-h", s.h);
      } else if (s.type !== "text") {
        const b = localBBox(s);
        setLen("prop-w", b.maxX - b.minX);
        setLen("prop-h", b.maxY - b.minY);
      }
      setVal("prop-rot", s.rotation || 0);
      const size = shapeSize(s);
      const refW = s.refW > 0 ? s.refW : size.w;
      const refH = s.refH > 0 ? s.refH : size.h;
      setVal("prop-sx", size.w / refW * 100);
      setVal("prop-sy", size.h / refH * 100);
      const lock = $("prop-lock");
      if (lock && document.activeElement !== lock) lock.checked = s.lockRatio !== false;
      if (s.type === "path" && nodeSel && nodeSel.shapeId === s.id) {
        const a = s.rings[nodeSel.ring] && s.rings[nodeSel.ring][nodeSel.index];
        if (a) {
          const w = localToWorld(s, a);
          setLen("node-x", w.x);
          setLen("node-y", w.y);
          const pre = $("path-d");
          if (pre) pre.textContent = ringsToD(s);
        }
      }
    }

    function shapeTitle(s) {
      const kind = { rect: "Rectangle", ellipse: "Ellipse", line: "Line", path: "Path", text: "Text", textPath: "Text on path", image: "Image", group: "Group" }[s.type] || "Shape";
      const custom = s.name && String(s.name).trim();
      if (custom) return custom;
      if (s.type === "text") {
        const t = String(s.text || "").replace(/\s+/g, " ").trim();
        if (t) return t.length > 28 ? t.slice(0, 28) + "…" : t;
      }
      const index = doc.shapes.indexOf(s);
      let n = 0;
      for (let i = 0; i <= index; i++) if (doc.shapes[i] && doc.shapes[i].type === s.type) n++;
      return kind + " " + n;
    }

    function syncShapeList() {
      const list = $("shape-list");
      if (!list || document.activeElement === list) return;
      const front = doc.shapes.slice().reverse();
      const opts = ['<option value="">' + (doc.shapes.length ? "None" : "No shapes") + "</option>"];
      for (const s of front) opts.push('<option value="' + xml(s.id) + '">' + xml(shapeTitle(s)) + "</option>");
      list.innerHTML = opts.join("");
      list.value = selected.length === 1 ? selected[0] : "";
    }

    function cycleSelection(dir) {
      if (!doc.shapes.length) return;
      const order = doc.shapes.slice().reverse();
      const current = selected.length ? selected[selected.length - 1] : "";
      const idx = order.findIndex((s) => s.id === current);
      let pick;
      if (idx < 0) pick = dir > 0 ? order[0] : order[order.length - 1];
      else pick = order[(idx + dir + order.length) % order.length];
      selected = [pick.id];
      nodeSel = null;
      if (tool !== "select") setTool("select");
      else paint();
      syncInspector();
      setStatus(shapeTitle(pick));
      stage.focus({ preventScroll: true });
    }

    function syncInspector() {
      applyUnitChrome();
      setVal("doc-name", doc.name);
      setLen("doc-w", doc.width);
      setLen("doc-h", doc.height);
      const bg = $("doc-bg");
      const pageNone = $("pref-page-none");
      if (pageNone) pageNone.checked = !doc.background || doc.background === "none";
      if (bg && document.activeElement !== bg && /^#[0-9a-fA-F]{6}$/.test(doc.background)) bg.value = doc.background;
      const snapBtn = $("snap-toggle");
      const gridBtn = $("grid-toggle");
      if (snapBtn) snapBtn.setAttribute("aria-pressed", String(!!doc.snap));
      if (gridBtn) gridBtn.setAttribute("aria-pressed", String(!!doc.showGrid));
      shell.querySelectorAll("[data-grid]").forEach((btn) => {
        btn.setAttribute("aria-pressed", String(Number(btn.dataset.grid) === doc.grid));
      });
      setLen("pref-snap", doc.grid);
      setLen("snap-custom", doc.grid);
      const shapes = selected.map(byId).filter(Boolean);
      const s = shapes.length === 1 ? shapes[0] : null;
      const label = $("sel-label");
      if (label) {
        label.textContent = shapes.length === 0 ? "Nothing selected" : shapes.length > 1 ? shapes.length + " shapes" : shapeTitle(s);
      }
      syncShapeList();
      const nameEl = $("shape-name");
      if (nameEl && document.activeElement !== nameEl) {
        nameEl.disabled = !s;
        nameEl.value = s && s.name ? s.name : "";
        nameEl.placeholder = s ? shapeTitle(s) : "Select one shape";
      }
      $("sec-geom").hidden = !s || s.type === "textPath";
      const alignEl = $("sec-align");
      if (alignEl) alignEl.hidden = !shapes.some((sh) => sh.type !== "textPath");
      $("sec-style").hidden = shapes.length === 0;
      $("field-w").hidden = !s || s.type === "text" || s.type === "textPath" || s.type === "group";
      $("field-h").hidden = !s || s.type === "text" || s.type === "textPath" || s.type === "group";
      $("sec-path").hidden = !(s && s.type === "path");
      const onPath = $("field-on-path");
      if (onPath) onPath.hidden = !(s && (s.type === "path" || s.type === "ellipse" || s.type === "rect"));
      $("sec-text").hidden = !(s && (s.type === "text" || s.type === "textPath"));
      const imageSec = $("sec-image");
      if (imageSec) imageSec.hidden = !(s && s.type === "image");
      const imageOnly = shapes.length > 0 && shapes.every((sh) => sh.type === "image");
      for (const paintId of ["field-fill", "field-nofill", "field-stroke", "field-sw"]) {
        const paint = $(paintId);
        if (paint) paint.hidden = imageOnly;
      }
      $("field-offset").hidden = !(s && s.type === "textPath");
      $("field-baseline").hidden = !(s && s.type === "textPath");
      $("field-side").hidden = !(s && s.type === "textPath");
      $("field-tracking").hidden = !(s && s.type === "textPath");
      const hint = $("bool-hint");
      if (hint) {
        hint.textContent = selected.length === 2 ? "Subtract and Intersect use the back shape as the subject and the front shape as the cutter." : "Booleans need exactly two closed shapes.";
      }
      if (s && s.type !== "textPath") syncCoords();
      const styleSrc = styleOf(shapes[shapes.length - 1]);
      const opSrc = shapes[shapes.length - 1];
      if (styleSrc && styleSrc.type !== "textPath") {
        const fillEl = $("prop-fill");
        const noFill = $("prop-nofill");
        if (noFill) noFill.checked = !styleSrc.fill || styleSrc.fill === "none";
        if (fillEl && styleSrc.fill && styleSrc.fill !== "none" && /^#[0-9a-fA-F]{6}$/.test(styleSrc.fill)) fillEl.value = styleSrc.fill;
        const st = $("prop-stroke");
        if (st && styleSrc.stroke && /^#[0-9a-fA-F]{6}$/.test(styleSrc.stroke)) st.value = styleSrc.stroke;
        setLen("prop-sw", styleSrc.strokeWidth || 0);
        const op = $("prop-op");
        if (op && opSrc && document.activeElement !== op) op.value = String(Math.round((opSrc.opacity == null ? 1 : opSrc.opacity) * 100));
      } else if (styleSrc && styleSrc.type === "textPath") {
        const fillEl = $("prop-fill");
        if (fillEl && /^#[0-9a-fA-F]{6}$/.test(styleSrc.fill || "")) fillEl.value = styleSrc.fill;
        const op = $("prop-op");
        if (op && document.activeElement !== op) op.value = String(Math.round((styleSrc.opacity == null ? 1 : styleSrc.opacity) * 100));
      }
      if (s && s.type === "path") {
        $("path-rule").value = s.fillRule || "nonzero";
        const pre = $("path-d");
        if (pre) pre.textContent = ringsToD(s);
        const anchor = nodeSel && nodeSel.shapeId === s.id ? s.rings[nodeSel.ring] && s.rings[nodeSel.ring][nodeSel.index] : null;
        $("node-corner").setAttribute("aria-pressed", String(!!anchor && anchor.mode !== "smooth"));
        $("node-smooth").setAttribute("aria-pressed", String(!!anchor && anchor.mode === "smooth"));
        $("node-x").disabled = !anchor;
        $("node-y").disabled = !anchor;
      }
      if (s && (s.type === "text" || s.type === "textPath")) {
        const body = $("text-body");
        if (body && document.activeElement !== body) body.value = s.text || "";
        const font = $("text-font");
        if (font) {
          const has = Array.from(font.options).some((o) => o.value === s.font);
          if (!has) {
            const optn = document.createElement("option");
            optn.value = s.font;
            optn.textContent = "Custom";
            font.appendChild(optn);
          }
          font.value = s.font;
        }
        const specimen = $("font-specimen");
        if (specimen) {
          const known = FONTS.find((pair) => pair[0] === s.font);
          specimen.style.fontFamily = s.font;
          specimen.style.fontWeight = String(s.fontWeight || weightFor(s.font));
          specimen.textContent = known ? (known[1] === "Nunito" ? "Round O" : known[1]) : "OO";
        }
        setLen("text-size", s.size);
        if (s.type === "textPath") {
          setVal("tp-angle", s.startAngle || 0);
          $("tp-side").value = s.side === "inside" ? "inside" : "outside";
          setLen("tp-baseline", s.baseline || 0);
          setLen("tp-tracking", s.letterSpacing || 0);
        }
      }
      syncPaletteUi();
      const props = $("props-toggle");
      if (props) props.setAttribute("aria-pressed", String(inspectorOpen));
      const textTools = $("text-tools");
      if (textTools) textTools.hidden = !(s && (s.type === "text" || s.type === "textPath"));
      const chipSrc = s && s.type !== "textPath" ? s : (shapes[shapes.length - 1] || null);
      paintChip("fill-chip", chipSrc && chipSrc.fill ? chipSrc.fill : currentStyle.fill);
      paintChip("border-chip", chipSrc && chipSrc.stroke ? chipSrc.stroke : currentStyle.stroke);
      const prefFill = $("pref-fill");
      const prefNone = $("pref-nofill");
      if (prefNone) prefNone.checked = !currentStyle.fill || currentStyle.fill === "none";
      if (prefFill && document.activeElement !== prefFill && /^#[0-9a-fA-F]{6}$/.test(currentStyle.fill || "")) prefFill.value = currentStyle.fill;
      const prefStroke = $("pref-stroke");
      if (prefStroke && document.activeElement !== prefStroke && /^#[0-9a-fA-F]{6}$/.test(currentStyle.stroke || "")) prefStroke.value = currentStyle.stroke;
      setLen("pref-sw", currentStyle.strokeWidth || 0);
    }

    function paintChip(id, color) {
      const el = $(id);
      if (!el) return;
      const none = !color || color === "none";
      el.style.background = none ? "transparent" : color;
      el.classList.toggle("is-none", none);
    }

    function syncPaletteUi() {
      shell.querySelectorAll("[data-palette]").forEach((btn) => {
        btn.setAttribute("aria-pressed", String(btn.dataset.palette === paletteTarget));
      });
      let current = "";
      if (paletteTarget === "paper") current = String(doc.background || "").toLowerCase();
      else {
        const shapes = selected.map(byId).filter(Boolean);
        const src = styleOf(shapes[shapes.length - 1]);
        if (src) current = String((paletteTarget === "stroke" ? src.stroke : src.fill) || "").toLowerCase();
      }
      shell.querySelectorAll("[data-swatch]").forEach((btn) => {
        btn.setAttribute("aria-pressed", String(btn.dataset.swatch === current));
      });
      const name = $("palette-name");
      if (!name) return;
      const on = shell.querySelector('[data-swatch][aria-pressed="true"]');
      name.textContent = on ? (on.dataset.name || "") + " " + (on.dataset.swatch || "") : "";
    }

    function applyGoogleColor(hex, name) {
      const label = name + " " + hex;
      if (paletteTarget === "paper") {
        const before = JSON.stringify(doc);
        doc.background = hex;
        pushHist(before);
        const bg = $("doc-bg");
        if (bg && /^#[0-9a-fA-F]{6}$/.test(hex)) bg.value = hex;
        paint();
        syncInspector();
        savePrefs();
        setStatus("Paper · " + label);
        return;
      }
      const shapes = selected.map(byId).filter((s) => {
        if (!s || s.type === "image") return false;
        if (paletteTarget === "stroke" && s.type === "textPath") return false;
        return true;
      });
      if (!shapes.length) {
        if (paletteTarget === "fill") currentStyle.fill = hex;
        else currentStyle.stroke = hex;
        syncInspector();
        savePrefs();
        setStatus((paletteTarget === "fill" ? "Fill" : "Border") + " · " + label);
        return;
      }
      const before = JSON.stringify(doc);
      paintShapes(shapes, paletteTarget === "fill" ? "fill" : "stroke", hex);
      const painted = styleOf(shapes[shapes.length - 1]);
      if (painted) remember(painted);
      pushHist(before);
      paint();
      syncInspector();
      setStatus((paletteTarget === "fill" ? "Fill" : "Stroke") + " · " + label);
    }

    function savePrefs() {
      const prefs = {
        unit: currentUnit(),
        width: doc.width,
        height: doc.height,
        background: doc.background || "none",
        fill: currentStyle.fill || "none",
        stroke: currentStyle.stroke || "none",
        strokeWidth: currentStyle.strokeWidth || 0,
      };
      try {
        localStorage.setItem("gdrew.prefs", JSON.stringify(prefs));
        localStorage.setItem("gdrew.unit", prefs.unit);
      } catch (err) {
        /* this visit still uses the chosen values */
      }
    }

    function eachLeaf(shape, fn) {
      if (!shape) return;
      if (shape.type === "group") {
        for (const child of shape.children || []) eachLeaf(child, fn);
        return;
      }
      fn(shape);
    }

    function acceptsPaint(shape, kind) {
      if (!shape || shape.type === "image" || shape.type === "group") return false;
      if ((kind === "stroke" || kind === "width") && (shape.type === "text" || shape.type === "textPath")) return false;
      return true;
    }

    function paintShapes(shapes, kind, value) {
      for (const shape of shapes) {
        eachLeaf(shape, (leaf) => {
          if (!acceptsPaint(leaf, kind)) return;
          if (kind === "fill") leaf.fill = value;
          else if (kind === "stroke") leaf.stroke = value;
          else leaf.strokeWidth = value;
        });
      }
    }

    function styleOf(shape) {
      let found = null;
      eachLeaf(shape, (leaf) => {
        if (leaf.type !== "image") found = leaf;
      });
      return found;
    }

    function remember(s) {
      if (!s || s.type === "image") return;
      if (s.type === "text" || s.type === "textPath") {
        if (s.fill && s.fill !== "none") currentStyle.fill = s.fill;
        savePrefs();
        return;
      }
      currentStyle = {
        fill: s.fill ?? currentStyle.fill,
        stroke: s.stroke ?? currentStyle.stroke,
        strokeWidth: s.strokeWidth ?? currentStyle.strokeWidth,
        opacity: s.opacity ?? currentStyle.opacity,
      };
      savePrefs();
    }

    function restore(live, snap) {
      const copy = structuredClone(snap);
      for (const k of Object.keys(live)) delete live[k];
      Object.assign(live, copy);
    }

    function shapeSize(s) {
      if (!s) return { w: 1, h: 1 };
      if (s.type === "rect" || s.type === "ellipse" || s.type === "image") {
        return { w: Math.max(1, Math.abs(s.w || 1)), h: Math.max(1, Math.abs(s.h || 1)) };
      }
      if (s.type === "text") return { w: Math.max(1, localBBox(s).maxX - localBBox(s).minX), h: Math.max(1, s.size || 16) };
      const b = localBBox(s);
      return { w: Math.max(1, b.maxX - b.minX), h: Math.max(1, b.maxY - b.minY) };
    }

    function ensureRef(s) {
      if (!s || s.type === "textPath") return;
      const size = shapeSize(s);
      if (!(s.refW > 0)) s.refW = size.w;
      if (!(s.refH > 0)) s.refH = size.h;
    }

    function setShapeSize(s, newW, newH) {
      newW = Math.max(1, newW);
      newH = Math.max(1, newH);
      const size = shapeSize(s);
      const sx = newW / size.w;
      const sy = newH / size.h;
      if (Math.abs(sx - 1) < 1e-4 && Math.abs(sy - 1) < 1e-4) return;
      if (s.type === "rect" || s.type === "ellipse" || s.type === "image") {
        s.w = newW;
        s.h = newH;
        return;
      }
      if (s.type === "text") {
        s.size = Math.max(1, (s.size || 16) * ((sx + sy) / 2));
        return;
      }
      if (s.type === "line") {
        const b = localBBox(s);
        s.x1 = b.minX + (s.x1 - b.minX) * sx;
        s.x2 = b.minX + (s.x2 - b.minX) * sx;
        s.y1 = b.minY + (s.y1 - b.minY) * sy;
        s.y2 = b.minY + (s.y2 - b.minY) * sy;
        return;
      }
      if (s.type === "path") {
        const b = localBBox(s);
        for (const ring of s.rings || []) {
          for (const a of ring) {
            a.x = b.minX + (a.x - b.minX) * sx;
            a.y = b.minY + (a.y - b.minY) * sy;
            a.inX *= sx;
            a.inY *= sy;
            a.outX *= sx;
            a.outY *= sy;
          }
        }
        return;
      }
      if (s.type === "group") {
        const b = localBBox(s);
        const fix = { x: b.minX, y: b.minY };
        s.children = (s.children || []).map((ch) => {
          const copy = structuredClone(ch);
          scaleMember(copy, ch, sx, sy, fix);
          return copy;
        });
      }
    }

    function scaleMember(live, src, sx, sy, fix) {
      const mx = (x) => fix.x + (x - fix.x) * sx;
      const my = (y) => fix.y + (y - fix.y) * sy;
      if (live.type === "rect" || live.type === "ellipse" || live.type === "image") {
        const gc = localToWorld(src, localCenter(src));
        live.w = Math.max(1, Math.abs((src.w || 1) * sx));
        live.h = Math.max(1, Math.abs((src.h || 1) * sy));
        const c2 = localCenter(live);
        live.x = mx(gc.x) - c2.x;
        live.y = my(gc.y) - c2.y;
        return;
      }
      if (live.type === "text") {
        live.x = mx(src.x || 0);
        live.y = my(src.y || 0);
        live.size = Math.max(1, (src.size || 16) * ((Math.abs(sx) + Math.abs(sy)) / 2));
        return;
      }
      if (live.type === "line") {
        const A = localToWorld(src, { x: src.x1, y: src.y1 });
        const B = localToWorld(src, { x: src.x2, y: src.y2 });
        live.rotation = 0;
        live.x = 0;
        live.y = 0;
        live.x1 = mx(A.x);
        live.y1 = my(A.y);
        live.x2 = mx(B.x);
        live.y2 = my(B.y);
        return;
      }
      if (live.type === "path") {
        live.rotation = 0;
        live.x = 0;
        live.y = 0;
        live.rings = (src.rings || []).map((ring) => ring.map((a) => {
          const p = localToWorld(src, a);
          const o = localToWorld(src, { x: a.x + a.outX, y: a.y + a.outY });
          const inn = localToWorld(src, { x: a.x + a.inX, y: a.y + a.inY });
          const P = { x: mx(p.x), y: my(p.y) };
          const O = { x: mx(o.x), y: my(o.y) };
          const I = { x: mx(inn.x), y: my(inn.y) };
          return { ...a, x: P.x, y: P.y, outX: O.x - P.x, outY: O.y - P.y, inX: I.x - P.x, inY: I.y - P.y };
        }));
        return;
      }
      if (live.type === "group") {
        const c = localCenter(src);
        const gc = localToWorld(src, c);
        live.rotation = src.rotation || 0;
        live.children = (src.children || []).map((ch) => {
          const copy = structuredClone(ch);
          scaleMember(copy, ch, sx, sy, c);
          return copy;
        });
        const c2 = localCenter(live);
        live.x = mx(gc.x) - c2.x;
        live.y = my(gc.y) - c2.y;
      }
    }

    function scaleBox(live, before, handle, world, shift) {
      const lp = worldToLocal(before, world);
      let minX = 0;
      let minY = 0;
      let maxX = before.w;
      let maxY = before.h;
      if (handle.includes("e")) maxX = Math.max(minX + 1, lp.x);
      if (handle.includes("s")) maxY = Math.max(minY + 1, lp.y);
      if (handle.includes("w")) minX = Math.min(maxX - 1, lp.x);
      if (handle.includes("n")) minY = Math.min(maxY - 1, lp.y);
      if (shift) {
        const ratio = (before.w || 1) / (before.h || 1);
        if (handle.length === 2) {
          let nw = Math.max(1, maxX - minX);
          let nh = Math.max(1, maxY - minY);
          if (nw / nh > ratio) nw = nh * ratio;
          else nh = nw / ratio;
          if (handle.includes("w")) minX = maxX - nw;
          else maxX = minX + nw;
          if (handle.includes("n")) minY = maxY - nh;
          else maxY = minY + nh;
        } else if (handle === "e" || handle === "w") {
          const nw = Math.max(1, maxX - minX);
          const nh = Math.max(1, nw / ratio);
          const mid = before.h / 2;
          minY = mid - nh / 2;
          maxY = mid + nh / 2;
        } else if (handle === "n" || handle === "s") {
          const nh = Math.max(1, maxY - minY);
          const nw = Math.max(1, nh * ratio);
          const mid = before.w / 2;
          minX = mid - nw / 2;
          maxX = mid + nw / 2;
        }
      }
      const b = { minX: 0, minY: 0, maxX: before.w, maxY: before.h };
      const fix = handlePoint(b, opposite(handle));
      const fixWorld = localToWorld(before, fix);
      live.w = Math.max(1, maxX - minX);
      live.h = Math.max(1, maxY - minY);
      const shiftW = localToWorld(before, { x: minX, y: minY });
      const originW = localToWorld(before, { x: 0, y: 0 });
      live.x = before.x + (shiftW.x - originW.x);
      live.y = before.y + (shiftW.y - originW.y);
      const now = localToWorld(live, { x: fix.x - minX, y: fix.y - minY });
      live.x += fixWorld.x - now.x;
      live.y += fixWorld.y - now.y;
    }

    function scaleFree(live, before, handle, world, shift, apply) {
      const b = localBBox(before);
      const fix = handlePoint(b, opposite(handle));
      const mov = handlePoint(b, handle);
      const lp = worldToLocal(before, world);
      let sx = 1;
      let sy = 1;
      const ax = /e|w/.test(handle);
      const ay = /n|s/.test(handle);
      if (ax) sx = (lp.x - fix.x) / ((mov.x - fix.x) || 1);
      if (ay) sy = (lp.y - fix.y) / ((mov.y - fix.y) || 1);
      if (shift && ax && ay) {
        const s = Math.max(Math.abs(sx), Math.abs(sy));
        sx = Math.sign(sx || 1) * s;
        sy = Math.sign(sy || 1) * s;
      } else if (shift && ax) sy = Math.sign(sx || 1) * Math.abs(sx);
      else if (shift && ay) sx = Math.sign(sy || 1) * Math.abs(sy);
      if (ax) sx = Math.sign(sx || 1) * Math.max(0.02, Math.abs(sx));
      if (ay) sy = Math.sign(sy || 1) * Math.max(0.02, Math.abs(sy));
      const fixWorld = localToWorld(before, fix);
      apply(sx, sy, fix);
      const now = localToWorld(live, fix);
      live.x += fixWorld.x - now.x;
      live.y += fixWorld.y - now.y;
    }

    function refitPointPen(anchors, closed) {
      const n = anchors.length;
      if (n < 2) return;
      const at = (i) => anchors[(i + n) % n];
      for (let i = 0; i < n; i++) {
        const a = anchors[i];
        const hasPrev = closed || i > 0;
        const hasNext = closed || i < n - 1;
        const prev = hasPrev ? at(i - 1) : null;
        const next = hasNext ? at(i + 1) : null;
        if (a.mode === "smooth" && prev && next) {
          const dx = (next.x - prev.x) / 6;
          const dy = (next.y - prev.y) / 6;
          a.inX = -dx;
          a.inY = -dy;
          a.outX = dx;
          a.outY = dy;
        } else {
          a.inX = prev ? (prev.x - a.x) / 3 : 0;
          a.inY = prev ? (prev.y - a.y) / 3 : 0;
          a.outX = next ? (next.x - a.x) / 3 : 0;
          a.outY = next ? (next.y - a.y) / 3 : 0;
        }
      }
    }

    function placePoint(world, mode, detail, shift) {
      if (!pen) {
        if (detail >= 2) return;
        if (mode !== "corner") {
          setStatus("Right-click to start the path");
          return;
        }
        pen = { anchors: [], dragging: false, hover: null };
      }
      let p = snapPt(world);
      if (shift && pen.anchors.length) p = lock45(pen.anchors[pen.anchors.length - 1], world);
      const nearStart = () => {
        if (pen.anchors.length < 3) return false;
        const a0 = pen.anchors[0];
        return Math.hypot(p.x - a0.x, p.y - a0.y) < 14 / zoom;
      };
      if (nearStart()) {
        refitPointPen(pen.anchors, true);
        commitPen(true);
        paint();
        syncInspector();
        return;
      }
      const last = pen.anchors[pen.anchors.length - 1];
      const repeat = last && Math.hypot(p.x - last.x, p.y - last.y) < Math.max(8, 12 / zoom);
      if (repeat && (detail >= 2 || performance.now() - pointStamp < 500)) {
        if (pen.anchors.length >= 2) {
          refitPointPen(pen.anchors, false);
          commitPen(false);
          paint();
          syncInspector();
        }
        return;
      }
      if (repeat) return;
      const a = makeAnchor(p.x, p.y);
      a.mode = mode === "smooth" ? "smooth" : "corner";
      pen.anchors.push(a);
      pen.dragging = false;
      pointStamp = performance.now();
      refitPointPen(pen.anchors, false);
      paint();
      if (pen.anchors.length === 1) setStatus("Path started");
      else setStatus(a.mode === "smooth" ? "Smooth node" : "Corner node");
    }

    function commitPen(closed) {
      if (!pen || pen.anchors.length < 2) {
        pen = null;
        return;
      }
      const before = JSON.stringify(doc);
      const anchors = pen.anchors.map((a) => ({ ...a }));
      for (const a of anchors) {
        if (Math.hypot(a.inX, a.inY) < 0.4) {
          a.inX = 0;
          a.inY = 0;
        }
        if (Math.hypot(a.outX, a.outY) < 0.4) {
          a.outX = 0;
          a.outY = 0;
        }
        if (!a.inX && !a.inY && !a.outX && !a.outY) a.mode = "corner";
      }
      const shape = {
        id: allocId(),
        type: "path",
        x: 0,
        y: 0,
        rotation: 0,
        rings: [anchors],
        closed: !!closed && anchors.length >= 3,
        fillRule: "nonzero",
        fill: closed && anchors.length >= 3 ? currentStyle.fill : "none",
        stroke: currentStyle.stroke,
        strokeWidth: currentStyle.strokeWidth,
        opacity: currentStyle.opacity,
      };
      doc.shapes.push(shape);
      selected = [shape.id];
      pen = null;
      pushHist(before);
      setStatus(shape.closed ? "Closed path" : "Open path");
    }

    function deleteSelected() {
      if (tool === "nodes" && nodeSel) {
        const s = byId(nodeSel.shapeId);
        const ring = s && s.rings && s.rings[nodeSel.ring];
        if (s && ring) {
          const min = s.closed ? 3 : 2;
          const before = JSON.stringify(doc);
          if (ring.length <= min) {
            removeIds([s.id]);
          } else {
            ring.splice(nodeSel.index, 1);
            nodeSel = null;
          }
          pushHist(before);
          paint();
          syncInspector();
          return;
        }
      }
      if (!selected.length) return;
      const before = JSON.stringify(doc);
      removeIds(selected);
      pushHist(before);
      paint();
      syncInspector();
    }

    function removeIds(ids) {
      const drop = new Set(ids);
      function pathIds(s, into) {
        if (!s) return;
        if (s.type === "path") into.add(s.id);
        if (s.type === "group") for (const child of s.children || []) pathIds(child, into);
      }
      const paths = new Set();
      for (const s of doc.shapes) {
        if (!drop.has(s.id)) continue;
        pathIds(s, paths);
      }
      for (const t of doc.shapes) if (t.type === "textPath" && paths.has(t.pathId)) drop.add(t.id);
      doc.shapes = doc.shapes.filter((s) => !drop.has(s.id));
      selected = selected.filter((id) => !drop.has(id));
      nodeSel = null;
    }

    function mirrorPoint(p, axis, c) {
      if (axis === "h") return { x: c.x * 2 - p.x, y: p.y };
      return { x: p.x, y: c.y * 2 - p.y };
    }

    function selectionMirrorCenter(shapes) {
      const pts = [];
      for (const s of shapes) {
        const b = localBBox(s);
        pts.push(
          localToWorld(s, { x: b.minX, y: b.minY }),
          localToWorld(s, { x: b.maxX, y: b.minY }),
          localToWorld(s, { x: b.maxX, y: b.maxY }),
          localToWorld(s, { x: b.minX, y: b.maxY }),
        );
      }
      const box = bounds(pts);
      return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
    }

    function mirrorContent(s, axis) {
      const c = localCenter(s);
      if (s.type === "path") {
        for (const ring of s.rings || []) {
          const next = ring.map((a) => {
            const p = mirrorPoint({ x: a.x, y: a.y }, axis, c);
            const inn = mirrorPoint({ x: a.x + a.inX, y: a.y + a.inY }, axis, c);
            const out = mirrorPoint({ x: a.x + a.outX, y: a.y + a.outY }, axis, c);
            return {
              x: p.x,
              y: p.y,
              inX: inn.x - p.x,
              inY: inn.y - p.y,
              outX: out.x - p.x,
              outY: out.y - p.y,
              mode: a.mode,
            };
          });
          ring.splice(0, ring.length, ...next);
        }
        return;
      }
      if (s.type === "line") {
        const a = mirrorPoint({ x: s.x1, y: s.y1 }, axis, c);
        const b = mirrorPoint({ x: s.x2, y: s.y2 }, axis, c);
        s.x1 = a.x;
        s.y1 = a.y;
        s.x2 = b.x;
        s.y2 = b.y;
        return;
      }
      if (s.type === "image" || s.type === "text") {
        if (axis === "h") s.flipH = !s.flipH;
        else s.flipV = !s.flipV;
        if (!s.flipH) delete s.flipH;
        if (!s.flipV) delete s.flipV;
      }
    }

    function captureMirror(s, axis, center, pageOf, pageRot) {
      const rot = pageRot == null ? s.rotation || 0 : pageRot;
      if (s.type === "group") {
        return {
          kind: "group",
          children: (s.children || []).map((child) => captureMirror(
            child,
            axis,
            center,
            (p) => pageOf(localToWorld(child, p)),
            rot + (child.rotation || 0),
          )),
        };
      }
      const c = localCenter(s);
      const nc = mirrorPoint(pageOf(c), axis, center);
      return { kind: "shape", rot: normDeg(-rot), x: nc.x - c.x, y: nc.y - c.y, axis };
    }

    function applyMirror(s, plan) {
      if (!plan) return;
      if (plan.kind === "group") {
        (s.children || []).forEach((child, i) => applyMirror(child, plan.children[i]));
        s.x = 0;
        s.y = 0;
        s.rotation = 0;
        return;
      }
      mirrorContent(s, plan.axis);
      s.rotation = plan.rot;
      s.x = plan.x;
      s.y = plan.y;
    }

    function mirrorSelection(axis) {
      const shapes = selected.map(byId).filter((s) => s && s.type !== "textPath");
      if (!shapes.length) {
        setStatus(selected.length ? "Flip the shape under the text" : "Select a shape");
        return;
      }
      const center = selectionMirrorCenter(shapes);
      const plans = shapes.map((s) => captureMirror(s, axis, center, (p) => localToWorld(s, p), s.rotation || 0));
      const before = JSON.stringify(doc);
      shapes.forEach((s, i) => applyMirror(s, plans[i]));
      pushHist(before);
      paint();
      syncInspector();
      setStatus(axis === "h" ? "Flipped horizontal" : "Flipped vertical");
    }

    function duplicateSelected() {
      if (!selected.length) return;
      const before = JSON.stringify(doc);
      const map = {};
      const copies = [];
      function cloneShape(s, shift) {
        const c = structuredClone(s);
        map[s.id] = allocId();
        c.id = map[s.id];
        if (shift) {
          if (typeof c.x === "number") c.x += 16;
          if (typeof c.y === "number") c.y += 16;
        }
        if (c.type === "group") c.children = (s.children || []).map((child) => cloneShape(child, false));
        return c;
      }
      for (const id of selected) {
        const s = byId(id);
        if (!s) continue;
        copies.push(cloneShape(s, true));
      }
      for (const c of copies) if (c.type === "textPath" && map[c.pathId]) c.pathId = map[c.pathId];
      doc.shapes.push(...copies);
      selected = copies.map((c) => c.id);
      pushHist(before);
      paint();
      syncInspector();
    }

    function releaseChild(group, child) {
      const c = localCenter(child);
      const center = localToWorld(group, { x: (child.x || 0) + c.x, y: (child.y || 0) + c.y });
      child.rotation = normDeg((child.rotation || 0) + (group.rotation || 0));
      child.x = center.x - c.x;
      child.y = center.y - c.y;
      child.opacity = clamp((child.opacity == null ? 1 : child.opacity) * (group.opacity == null ? 1 : group.opacity), 0, 1);
    }

    function groupSelected() {
      const ids = new Set(selected);
      const members = doc.shapes.filter((s) => ids.has(s.id) && s.type !== "textPath");
      if (members.length < 2) {
        setStatus("Select two or more shapes");
        return;
      }
      const before = JSON.stringify(doc);
      const group = {
        id: allocId(),
        type: "group",
        x: 0,
        y: 0,
        rotation: 0,
        opacity: 1,
        fill: "none",
        stroke: "none",
        strokeWidth: 0,
        children: members.map((s) => structuredClone(s)),
      };
      const index = doc.shapes.findIndex((s) => ids.has(s.id) && s.type !== "textPath");
      const keep = new Set(members.map((s) => s.id));
      doc.shapes = doc.shapes.filter((s) => !keep.has(s.id));
      doc.shapes.splice(Math.max(0, index), 0, group);
      selected = [group.id];
      pushHist(before);
      paint();
      syncInspector();
      setStatus("Grouped " + members.length);
    }

    function ungroupSelected() {
      const groups = selected.map(byId).filter((s) => s && s.type === "group");
      if (!groups.length) {
        setStatus("Select a group");
        return;
      }
      const before = JSON.stringify(doc);
      const next = [];
      for (const group of groups) {
        const index = doc.shapes.findIndex((s) => s.id === group.id);
        if (index < 0) continue;
        const kids = (group.children || []).map((child) => {
          const copy = structuredClone(child);
          releaseChild(group, copy);
          return copy;
        });
        doc.shapes.splice(index, 1, ...kids);
        next.push(...kids.map((k) => k.id));
      }
      selected = next;
      pushHist(before);
      paint();
      syncInspector();
      setStatus("Ungrouped");
    }

    function reorder(dir) {
      if (!selected.length) return;
      const before = JSON.stringify(doc);
      const ids = new Set(selected);
      if (dir === "front" || dir === "back") {
        const move = doc.shapes.filter((s) => ids.has(s.id));
        const keep = doc.shapes.filter((s) => !ids.has(s.id));
        doc.shapes = dir === "front" ? keep.concat(move) : move.concat(keep);
      } else if (dir === "forward") {
        for (let i = doc.shapes.length - 2; i >= 0; i--) {
          if (ids.has(doc.shapes[i].id) && !ids.has(doc.shapes[i + 1].id)) {
            const t = doc.shapes[i];
            doc.shapes[i] = doc.shapes[i + 1];
            doc.shapes[i + 1] = t;
          }
        }
      } else {
        for (let i = 1; i < doc.shapes.length; i++) {
          if (ids.has(doc.shapes[i].id) && !ids.has(doc.shapes[i - 1].id)) {
            const t = doc.shapes[i];
            doc.shapes[i] = doc.shapes[i - 1];
            doc.shapes[i - 1] = t;
          }
        }
      }
      if (JSON.stringify(doc) !== before) {
        pushHist(before);
        paint();
      }
    }

    function nudge(dx, dy) {
      const before = JSON.stringify(doc);
      if (tool === "nodes" && nodeSel) {
        const s = byId(nodeSel.shapeId);
        const a = s && s.rings[nodeSel.ring] && s.rings[nodeSel.ring][nodeSel.index];
        if (!a) return;
        const w = localToWorld(s, a);
        const l = worldToLocal(s, { x: w.x + dx, y: w.y + dy });
        a.x = l.x;
        a.y = l.y;
      } else {
        if (!selected.length) return;
        for (const id of selected) {
          const s = byId(id);
          if (!s || s.type === "textPath") continue;
          s.x += dx;
          s.y += dy;
        }
      }
      pushHist(before);
      paint();
      syncCoords();
    }

    function undoDoc() {
      if (drag && drag.before) doc = JSON.parse(drag.before);
      drag = null;
      draft = null;
      if (pen && pen.anchors.length) {
        pen.anchors.pop();
        if (!pen.anchors.length) pen = null;
        paint();
        return;
      }
      if (!undo.length) return;
      redo.push(JSON.stringify(doc));
      doc = JSON.parse(undo.pop());
      selected = selected.filter((id) => byId(id));
      nodeSel = null;
      dirtySave();
      paint();
      syncInspector();
      setStatus("Undo");
    }

    function redoDoc() {
      if (!redo.length) return;
      undo.push(JSON.stringify(doc));
      doc = JSON.parse(redo.pop());
      selected = selected.filter((id) => byId(id));
      nodeSel = null;
      dirtySave();
      paint();
      syncInspector();
      setStatus("Redo");
    }

    function newDoc() {
      pen = null;
      const before = JSON.stringify(doc);
      doc = blank();
      selected = [];
      nodeSel = null;
      svgHandle = null;
      jsonHandle = null;
      pushHist(before);
      paint();
      syncInspector();
      fitSoon();
      setStatus("New page");
    }

    function identify(target) {
      let handle = null;
      let node = null;
      let shape = null;
      for (let el = target; el && el !== shell; el = el.parentNode) {
        const ds = el.dataset;
        if (!ds) continue;
        if (!handle && ds.handle) handle = { handle: ds.handle, shape: ds.shape };
        if (!node && ds.kind) {
          node = { kind: ds.kind, shape: ds.shape, ring: Number(ds.ring), index: Number(ds.index) };
        }
        if (!shape && ds.shape && !ds.handle && !ds.kind) shape = ds.shape;
        if (handle || node || shape) break;
      }
      return { handle: handle, node: node, shape: shape };
    }

    function nearestNode(world) {
      if (tool !== "nodes" || selected.length !== 1) return null;
      const s = byId(selected[0]);
      if (!s || s.type !== "path") return null;
      const tol = 14 / zoom;
      let best = null;
      let bestD = tol;
      s.rings.forEach((ring, ri) => {
        ring.forEach((a, ai) => {
          const cands = [["anchor", a.x, a.y]];
          if (Math.hypot(a.inX, a.inY) > 0.35) cands.push(["in", a.x + a.inX, a.y + a.inY]);
          if (Math.hypot(a.outX, a.outY) > 0.35) cands.push(["out", a.x + a.outX, a.y + a.outY]);
          for (const [kind, x, y] of cands) {
            const w = localToWorld(s, { x: x, y: y });
            const d = Math.hypot(w.x - world.x, w.y - world.y);
            if (d < bestD) {
              bestD = d;
              best = { kind: kind, shape: s.id, ring: ri, index: ai };
            }
          }
        });
      });
      return best;
    }

    function shapesInRect(x0, y0, x1, y1) {
      const minX = Math.min(x0, x1);
      const maxX = Math.max(x0, x1);
      const minY = Math.min(y0, y1);
      const maxY = Math.max(y0, y1);
      return doc.shapes
        .filter((s) => {
          if (s.type === "textPath") return false;
          const b = worldBox(s);
          return !(b.maxX < minX || b.minX > maxX || b.maxY < minY || b.minY > maxY);
        })
        .map((s) => s.id);
    }

    function worldBox(s) {
      const b = localBBox(s);
      return bounds([
        localToWorld(s, { x: b.minX, y: b.minY }),
        localToWorld(s, { x: b.maxX, y: b.minY }),
        localToWorld(s, { x: b.maxX, y: b.maxY }),
        localToWorld(s, { x: b.minX, y: b.maxY }),
      ]);
    }

    function distributeSelection(axis) {
      const horizontal = axis === "h";
      let shapes = selected.map(byId).filter((s) => s && s.type !== "textPath");
      let inside = false;
      if (shapes.length === 1 && shapes[0].type === "group") {
        shapes = (shapes[0].children || []).filter((s) => s && s.type !== "textPath");
        inside = true;
      }
      if (shapes.length < 3) {
        setStatus("Select three or more shapes");
        return;
      }
      const items = shapes.map((s) => ({ s: s, b: worldBox(s) }));
      items.sort((a, c) => {
        const ds = horizontal ? a.b.minX - c.b.minX : a.b.minY - c.b.minY;
        if (Math.abs(ds) > 1e-6) return ds;
        const de = horizontal ? a.b.maxX - c.b.maxX : a.b.maxY - c.b.maxY;
        if (Math.abs(de) > 1e-6) return de;
        return String(a.s.id).localeCompare(String(c.s.id));
      });
      const n = items.length;
      const startOf = (b) => (horizontal ? b.minX : b.minY);
      const endOf = (b) => (horizontal ? b.maxX : b.maxY);
      const sizeOf = (b) => Math.max(0, endOf(b) - startOf(b));
      const span = endOf(items[n - 1].b) - startOf(items[0].b);
      let used = 0;
      for (const item of items) used += sizeOf(item.b);
      const gap = (span - used) / (n - 1);
      const before = JSON.stringify(doc);
      let cursor = startOf(items[0].b);
      let moved = false;
      for (const item of items) {
        const delta = cursor - startOf(item.b);
        if (Math.abs(delta) >= 0.05) {
          if (horizontal) item.s.x = (item.s.x || 0) + delta;
          else item.s.y = (item.s.y || 0) + delta;
          moved = true;
        }
        cursor += sizeOf(item.b) + gap;
      }
      if (!moved) {
        setStatus("Already distributed");
        return;
      }
      pushHist(before);
      paint();
      syncInspector();
      setStatus(inside
        ? (horizontal ? "Distributed horizontally inside the group" : "Distributed vertically inside the group")
        : (horizontal ? "Distributed horizontally" : "Distributed vertically"));
    }

    function alignSelection(mode) {
      if (mode === "dist-h" || mode === "dist-v") {
        distributeSelection(mode === "dist-h" ? "h" : "v");
        return;
      }
      const top = selected.map(byId).filter((s) => s && s.type !== "textPath");
      const inside = top.length === 1 && top[0].type === "group" && mode.indexOf("page") !== 0;
      const shapes = inside ? (top[0].children || []).filter((s) => s && s.type !== "textPath") : top;
      if (!shapes.length) {
        setStatus("Select a shape to align");
        return;
      }
      const boxes = shapes.map((s) => ({ s: s, b: worldBox(s) }));
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const item of boxes) {
        minX = Math.min(minX, item.b.minX);
        minY = Math.min(minY, item.b.minY);
        maxX = Math.max(maxX, item.b.maxX);
        maxY = Math.max(maxY, item.b.maxY);
      }
      const before = JSON.stringify(doc);
      let moved = false;
      const shift = (s, dx, dy) => {
        if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return;
        s.x = (s.x || 0) + dx;
        s.y = (s.y || 0) + dy;
        moved = true;
      };
      if (mode === "page" || mode === "page-h" || mode === "page-v") {
        const dx = mode === "page-v" ? 0 : doc.width / 2 - (minX + maxX) / 2;
        const dy = mode === "page-h" ? 0 : doc.height / 2 - (minY + maxY) / 2;
        for (const item of boxes) shift(item.s, dx, dy);
      } else if (shapes.length < 2) {
        setStatus("Select two or more shapes");
        return;
      } else {
        for (const item of boxes) {
          const b = item.b;
          let dx = 0;
          let dy = 0;
          if (mode === "left") dx = minX - b.minX;
          else if (mode === "hcenter") dx = (minX + maxX) / 2 - (b.minX + b.maxX) / 2;
          else if (mode === "right") dx = maxX - b.maxX;
          else if (mode === "top") dy = minY - b.minY;
          else if (mode === "vcenter") dy = (minY + maxY) / 2 - (b.minY + b.maxY) / 2;
          else if (mode === "bottom") dy = maxY - b.maxY;
          shift(item.s, dx, dy);
        }
      }
      if (!moved) {
        setStatus(mode.indexOf("page") === 0 ? "Already centered" : "Already aligned");
        return;
      }
      pushHist(before);
      paint();
      syncInspector();
      const centered = mode === "page-h" ? "Centered horizontally" : mode === "page-v" ? "Centered vertically" : "Centered on the page";
      setStatus(mode.indexOf("page") === 0 ? centered : inside ? "Aligned inside the group" : "Aligned");
    }

    function placeText(world) {
      const p = snapPt(world);
      const before = JSON.stringify(doc);
      const shape = {
        id: allocId(),
        type: "text",
        x: p.x,
        y: p.y,
        rotation: 0,
        text: "Text",
        font: REGULAR,
        fontWeight: 400,
        size: 32,
        fill: "#000000",
        stroke: "none",
        strokeWidth: 0,
        opacity: currentStyle.opacity,
      };
      doc.shapes.push(shape);
      selected = [shape.id];
      tool = "select";
      pushHist(before);
      publishTool();
      paint();
      syncInspector();
      const ta = $("text-body");
      if (ta) {
        ta.focus();
        ta.select();
      }
    }

    function bindText() {
      const s = single();
      if (!s || (s.type !== "path" && s.type !== "ellipse" && s.type !== "rect")) {
        setStatus("Select a circle, oval, rectangle, or path");
        return;
      }
      const before = JSON.stringify(doc);
      const t = {
        id: allocId(),
        type: "textPath",
        pathId: s.id,
        text: "TEXT",
        font: NARROW,
        fontWeight: 600,
        size: 22,
        startAngle: 0,
        baseline: 0,
        side: "outside",
        letterSpacing: 1,
        fill: "#000000",
        stroke: "none",
        strokeWidth: 0,
        opacity: 1,
      };
      doc.shapes.push(t);
      selected = [t.id];
      nodeSel = null;
      pushHist(before);
      paint();
      syncInspector();
      const ta = $("text-body");
      if (ta) {
        ta.focus();
        ta.select();
      }
    }

    function toggleAnchor(shape, ring, index, mode) {
      const pts = shape.rings[ring];
      const a = pts && pts[index];
      if (!a) return;
      const before = JSON.stringify(doc);
      const wasSmooth = a.mode === "smooth";
      a.mode = mode;
      if (mode === "smooth") {
        if (Math.hypot(a.outX, a.outY) >= 0.4) {
          a.inX = -a.outX;
          a.inY = -a.outY;
        } else if (Math.hypot(a.inX, a.inY) >= 0.4) {
          a.outX = -a.inX;
          a.outY = -a.inY;
        } else {
          a.outX = 24;
          a.outY = 0;
          a.inX = -24;
          a.inY = 0;
        }
      } else if (wasSmooth) {
        const n = pts.length;
        const prev = shape.closed || index > 0 ? pts[(index - 1 + n) % n] : null;
        const next = shape.closed || index < n - 1 ? pts[(index + 1) % n] : null;
        a.inX = prev ? (prev.x - a.x) / 3 : 0;
        a.inY = prev ? (prev.y - a.y) / 3 : 0;
        a.outX = next ? (next.x - a.x) / 3 : 0;
        a.outY = next ? (next.y - a.y) / 3 : 0;
      }
      pushHist(before);
      paint();
      syncInspector();
      setStatus(mode === "smooth" ? "Smooth node" : "Corner node");
    }

    function insertOnPath(shape, local) {
      const tol = 16 / zoom;
      let best = null;
      shape.rings.forEach((ring, ri) => {
        const count = shape.closed ? ring.length : ring.length - 1;
        for (let i = 0; i < count; i++) {
          const A = ring[i];
          const B = ring[(i + 1) % ring.length];
          const p0 = { x: A.x, y: A.y };
          const p1 = { x: A.x + A.outX, y: A.y + A.outY };
          const p2 = { x: B.x + B.inX, y: B.y + B.inY };
          const p3 = { x: B.x, y: B.y };
          for (let s = 1; s < 24; s++) {
            const t = s / 24;
            const p = cubicAt(p0, p1, p2, p3, t);
            const dist = Math.hypot(p.x - local.x, p.y - local.y);
            if (!best || dist < best.d) best = { d: dist, ri: ri, i: i, t: t, p0: p0, p1: p1, p2: p2, p3: p3, A: A, B: B };
          }
        }
      });
      if (!best || best.d > tol || best.t < 0.04 || best.t > 0.96) return false;
      const sp = splitCubic(best.p0, best.p1, best.p2, best.p3, best.t);
      best.A.outX = sp.left1.x - best.A.x;
      best.A.outY = sp.left1.y - best.A.y;
      best.B.inX = sp.right2.x - best.B.x;
      best.B.inY = sp.right2.y - best.B.y;
      const mid = makeAnchor(sp.mid.x, sp.mid.y);
      mid.inX = sp.left2.x - mid.x;
      mid.inY = sp.left2.y - mid.y;
      mid.outX = sp.right1.x - mid.x;
      mid.outY = sp.right1.y - mid.y;
      mid.mode = Math.hypot(mid.outX + mid.inX, mid.outY + mid.inY) < 0.8 ? "smooth" : "corner";
      shape.rings[best.ri].splice(best.i + 1, 0, mid);
      nodeSel = { shapeId: shape.id, ring: best.ri, index: best.i + 1 };
      return true;
    }

    function addNode() {
      const s = single();
      if (!s || s.type !== "path" || !s.rings || !s.rings.length) {
        setStatus("Select a path");
        return;
      }
      let ri = 0;
      let i = 0;
      if (nodeSel && nodeSel.shapeId === s.id && s.rings[nodeSel.ring]) {
        ri = nodeSel.ring;
        i = nodeSel.index;
      }
      const ring = s.rings[ri];
      if (!ring || ring.length < 2) {
        setStatus("Path needs two points");
        return;
      }
      if (!s.closed && i >= ring.length - 1) i = ring.length - 2;
      const A = ring[i];
      const B = ring[(i + 1) % ring.length];
      if (!A || !B) return;
      const before = JSON.stringify(doc);
      const sp = splitCubic(
        { x: A.x, y: A.y },
        { x: A.x + A.outX, y: A.y + A.outY },
        { x: B.x + B.inX, y: B.y + B.inY },
        { x: B.x, y: B.y },
        0.5
      );
      A.outX = sp.left1.x - A.x;
      A.outY = sp.left1.y - A.y;
      B.inX = sp.right2.x - B.x;
      B.inY = sp.right2.y - B.y;
      const mid = makeAnchor(sp.mid.x, sp.mid.y);
      mid.inX = sp.left2.x - mid.x;
      mid.inY = sp.left2.y - mid.y;
      mid.outX = sp.right1.x - mid.x;
      mid.outY = sp.right1.y - mid.y;
      mid.mode = Math.hypot(mid.outX + mid.inX, mid.outY + mid.inY) < 0.8 ? "smooth" : "corner";
      ring.splice(i + 1, 0, mid);
      nodeSel = { shapeId: s.id, ring: ri, index: i + 1 };
      if (tool !== "nodes") setTool("nodes");
      pushHist(before);
      paint();
      syncInspector();
      setStatus("Node added");
    }

    function sampleRing(shape, ring) {
      const pts = [];
      const count = shape.closed ? ring.length : ring.length - 1;
      for (let i = 0; i < count; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const p0 = localToWorld(shape, a);
        const p1 = localToWorld(shape, { x: a.x + a.outX, y: a.y + a.outY });
        const p2 = localToWorld(shape, { x: b.x + b.inX, y: b.y + b.inY });
        const p3 = localToWorld(shape, b);
        if (!pts.length) pts.push(p0);
        const flat = Math.hypot(a.outX, a.outY) < 0.35 && Math.hypot(b.inX, b.inY) < 0.35;
        if (flat) pts.push(p3);
        else pts.push(...Geom.sampleCubic(p0, p1, p2, p3, 8));
      }
      return Geom.dedupe(pts);
    }

    function shapeRings(shape) {
      if (shape.type === "rect") {
        return [[
          localToWorld(shape, { x: 0, y: 0 }),
          localToWorld(shape, { x: shape.w, y: 0 }),
          localToWorld(shape, { x: shape.w, y: shape.h }),
          localToWorld(shape, { x: 0, y: shape.h }),
        ]];
      }
      if (shape.type === "ellipse") {
        const pts = Geom.ellipsePoints(shape.w / 2, shape.h / 2, Math.abs(shape.w) / 2, Math.abs(shape.h) / 2, 72);
        return [pts.map((p) => localToWorld(shape, p))];
      }
      if (shape.type === "path" && shape.closed) return shape.rings.map((ring) => sampleRing(shape, ring));
      return null;
    }

    function largest(rings) {
      let best = null;
      let area = -1;
      for (const ring of rings) {
        const a = Math.abs(Geom.signedArea(ring));
        if (a > area) {
          area = a;
          best = ring;
        }
      }
      return best;
    }

    function refitRing(points) {
      const pts = Geom.dedupe(points);
      if (pts.length < 4) return pts.map((p) => makeAnchor(p.x, p.y));
      const count = pts.length;
      const turn = pts.map((_, i) => {
        const a = pts[(i - 1 + count) % count];
        const b = pts[i];
        const c = pts[(i + 1) % count];
        return Math.abs(Math.atan2((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x), (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)));
      });
      let cuts = [];
      turn.forEach((angle, i) => {
        if (angle > 0.22) cuts.push(i);
      });
      if (!cuts.length) cuts = [0];

      function unit(x, y) {
        const len = Math.hypot(x, y) || 1;
        return { x: x / len, y: y / len };
      }

      function chordError(span) {
        const a = span[0];
        const b = span[span.length - 1];
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const ab = Math.hypot(abx, aby) || 1;
        let maxD = 0;
        let maxI = 1;
        for (let i = 1; i < span.length - 1; i++) {
          const d = Math.abs((span[i].x - a.x) * aby - (span[i].y - a.y) * abx) / ab;
          if (d > maxD) {
            maxD = d;
            maxI = i;
          }
        }
        return { maxD: maxD, maxI: maxI };
      }

      function curveError(part, span) {
        let err = 0;
        let at = 1;
        for (let i = 1; i < span.length - 1; i++) {
          const q = span[i];
          let best = Infinity;
          let bestT = 0.5;
          for (let k = 1; k < 20; k++) {
            const t = k / 20;
            const p = cubicAt(part.p0, part.p1, part.p2, part.p3, t);
            const d = (p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y);
            if (d < best) {
              best = d;
              bestT = t;
            }
          }
          let lo = Math.max(0, bestT - 0.05);
          let hi = Math.min(1, bestT + 0.05);
          for (let step = 0; step < 6; step++) {
            const m1 = lo + (hi - lo) / 3;
            const m2 = hi - (hi - lo) / 3;
            const q1 = cubicAt(part.p0, part.p1, part.p2, part.p3, m1);
            const q2 = cubicAt(part.p0, part.p1, part.p2, part.p3, m2);
            const d1 = Math.hypot(q1.x - q.x, q1.y - q.y);
            const d2 = Math.hypot(q2.x - q.x, q2.y - q.y);
            if (d1 < d2) hi = m2;
            else lo = m1;
            best = Math.min(best, d1 * d1, d2 * d2);
          }
          const dist = Math.sqrt(best);
          if (dist > err) {
            err = dist;
            at = i;
          }
        }
        return { err: err, at: at };
      }

      function solveCubic(span) {
        const a = span[0];
        const b = span[span.length - 1];
        const reach = Math.min(3, span.length - 1);
        const t0 = unit(span[reach].x - a.x, span[reach].y - a.y);
        const tail = span[span.length - 1 - reach];
        const t1 = unit(b.x - tail.x, b.y - tail.y);
        const chord = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const acc = [0];
        for (let i = 1; i < span.length; i++) acc.push(acc[i - 1] + Math.hypot(span[i].x - span[i - 1].x, span[i].y - span[i - 1].y));
        const total = acc[acc.length - 1] || 1;
        let uu = 0;
        let vv = 0;
        let uv = 0;
        let ur = 0;
        let vr = 0;
        for (let i = 1; i < span.length - 1; i++) {
          const t = acc[i] / total;
          const mt = 1 - t;
          const uScale = 3 * mt * mt * t;
          const vScale = -3 * mt * t * t;
          const ux = uScale * t0.x;
          const uy = uScale * t0.y;
          const vx = vScale * t1.x;
          const vy = vScale * t1.y;
          const kx = (mt * mt * mt + 3 * mt * mt * t) * a.x + (3 * mt * t * t + t * t * t) * b.x;
          const ky = (mt * mt * mt + 3 * mt * mt * t) * a.y + (3 * mt * t * t + t * t * t) * b.y;
          const rx = span[i].x - kx;
          const ry = span[i].y - ky;
          uu += ux * ux + uy * uy;
          vv += vx * vx + vy * vy;
          uv += ux * vx + uy * vy;
          ur += ux * rx + uy * ry;
          vr += vx * rx + vy * ry;
        }
        let alpha = chord / 3;
        let beta = chord / 3;
        const det = uu * vv - uv * uv;
        if (Math.abs(det) > 1e-6) {
          alpha = (ur * vv - vr * uv) / det;
          beta = (uu * vr - uv * ur) / det;
        }
        const cap = chord * 0.9;
        if (!(alpha > 0.5) || alpha > cap) alpha = chord / 3;
        if (!(beta > 0.5) || beta > cap) beta = chord / 3;
        return {
          straight: false,
          p0: a,
          p1: { x: a.x + t0.x * alpha, y: a.y + t0.y * alpha },
          p2: { x: b.x - t1.x * beta, y: b.y - t1.y * beta },
          p3: b,
        };
      }

      function piecesOf(span, depth) {
        if (span.length < 2) return [];
        const flat = chordError(span);
        if (span.length < 3 || flat.maxD < 0.6) return [{ straight: true, p0: span[0], p3: span[span.length - 1] }];
        const part = solveCubic(span);
        const fit = curveError(part, span);
        if (fit.err <= 0.8 || span.length < 5) return [part];
        if (depth > 8) {
          const lines = [];
          for (let i = 0; i < span.length - 1; i++) lines.push({ straight: true, p0: span[i], p3: span[i + 1] });
          return lines;
        }
        const at = Math.max(1, Math.min(span.length - 2, fit.at));
        return piecesOf(span.slice(0, at + 1), depth + 1).concat(piecesOf(span.slice(at), depth + 1));
      }

      const anchors = [];
      for (let c = 0; c < cuts.length; c++) {
        const i0 = cuts[c];
        const i1 = cuts[(c + 1) % cuts.length];
        const span = [];
        for (let i = i0; ; i = (i + 1) % count) {
          span.push(pts[i]);
          if (i === i1) break;
          if (span.length > count) break;
        }
        if (i0 === i1) span.push(pts[i0]);
        const parts = piecesOf(span, 0);
        let lastPart = null;
        parts.forEach((part, pi) => {
          let prev = anchors[anchors.length - 1];
          const same = prev && Math.hypot(prev.x - part.p0.x, prev.y - part.p0.y) < 0.05;
          if (!same) {
            const anchor = makeAnchor(part.p0.x, part.p0.y);
            anchor.mode = pi === 0 && turn[i0] > 0.22 ? "corner" : "smooth";
            if (lastPart && !lastPart.straight) {
              anchor.inX = lastPart.p2.x - part.p0.x;
              anchor.inY = lastPart.p2.y - part.p0.y;
            }
            anchors.push(anchor);
            prev = anchor;
          } else if (pi === 0 && turn[i0] > 0.22) prev.mode = "corner";
          if (!part.straight) {
            prev.outX = part.p1.x - prev.x;
            prev.outY = part.p1.y - prev.y;
          }
          lastPart = part;
          if (c === cuts.length - 1 && pi === parts.length - 1) {
            const first = anchors[0];
            if (first && !part.straight) {
              first.inX = part.p2.x - first.x;
              first.inY = part.p2.y - first.y;
            }
          }
        });
      }
      return anchors.length >= 3 ? anchors : pts.map((p) => makeAnchor(p.x, p.y));
    }

    function runBoolean(op) {
      if (busy) return;
      if (selected.length !== 2) {
        setStatus("Select exactly two closed shapes");
        return;
      }
      const ordered = selected
        .map((id) => ({ id: id, index: doc.shapes.findIndex((s) => s.id === id) }))
        .sort((a, b) => a.index - b.index);
      const subject = byId(ordered[0].id);
      const cutter = byId(ordered[1].id);
      const subR = shapeRings(subject);
      const clipR = shapeRings(cutter);
      if (!subR || !clipR) {
        setStatus("Booleans need closed paths, rectangles, or ellipses");
        return;
      }
      busy = true;
      setStatus("Clipping…");
      const before = JSON.stringify(doc);
      const t0 = performance.now();
      setTimeout(() => {
        if (!alive) return;
        try {
          const note = subR.length > 1 || clipR.length > 1 ? " Outer contour only." : "";
          const rings = Geom.polygonBoolean(largest(subR), largest(clipR), op)
            .map((ring) => refitRing(ring))
            .filter((ring) => ring.length >= 3);
          if (!rings.length) {
            if (op === "subtract" && largest(subR).every((p) => Geom.pointInPoly(p.x, p.y, largest(clipR)))) {
              const drop = new Set([subject.id, cutter.id]);
              for (const s of doc.shapes) {
                if (s.type === "textPath" && drop.has(s.pathId)) drop.add(s.id);
              }
              doc.shapes = doc.shapes.filter((s) => !drop.has(s.id));
              selected = [];
              nodeSel = null;
              pushHist(before);
              paint();
              syncInspector();
              setStatus("Subtract · shape removed");
            } else setStatus("No overlap — originals kept");
            busy = false;
            return;
          }
          const result = {
            id: allocId(),
            type: "path",
            x: 0,
            y: 0,
            rotation: 0,
            rings: rings,
            closed: true,
            fillRule: rings.length > 1 ? "evenodd" : "nonzero",
            fill: op === "subtract" ? subject.fill : cutter.fill,
            stroke: op === "subtract" ? subject.stroke : cutter.stroke,
            strokeWidth: op === "subtract" ? subject.strokeWidth : cutter.strokeWidth,
            opacity: op === "subtract" ? subject.opacity : cutter.opacity,
          };
          const drop = new Set([subject.id, cutter.id]);
          for (const s of doc.shapes) {
            if (s.type === "textPath" && drop.has(s.pathId)) drop.add(s.id);
          }
          const front = Math.max(ordered[0].index, ordered[1].index);
          const next = [];
          doc.shapes.forEach((s, i) => {
            if (drop.has(s.id)) {
              if (i === front) next.push(result);
              return;
            }
            next.push(s);
          });
          if (!next.includes(result)) next.push(result);
          doc.shapes = next;
          selected = [result.id];
          nodeSel = null;
          pushHist(before);
          paint();
          syncInspector();
          const label = op === "union" ? "Union" : op === "subtract" ? "Subtract" : "Intersect";
          setStatus(label + " · " + (performance.now() - t0).toFixed(1) + " ms." + note);
        } catch (err) {
          setStatus(err && err.message ? err.message : "Boolean failed");
        } finally {
          busy = false;
        }
      }, 0);
    }

    function exportSVG() {
      exporting = true;
      let body = "";
      try {
        body = doc.shapes.filter((s) => s.type !== "textPath").map((s) => shapeMarkup(s)).join("");
      } finally {
        exporting = false;
      }
      const json = JSON.stringify(doc).replace(/]]>/g, "]]\\u003e");
      return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${n(doc.width)}" height="${n(doc.height)}" viewBox="0 0 ${n(doc.width)} ${n(doc.height)}">\n<metadata id="folio-doc"><![CDATA[${json}]]></metadata>\n<rect width="100%" height="100%" fill="${xml(doc.background)}"/>\n${body}\n</svg>\n`;
    }

    function download(text, filename, mime) {
      const blob = new Blob([text], { type: mime });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    async function writeHandle(handle, text, filename, mime) {
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      setStatus("Saved " + filename);
    }

    async function saveSVG() {
      const text = exportSVG();
      const filename = (doc.name || "gdrew") + ".svg";
      try {
        if (!root.showSaveFilePicker) throw new Error("no-fs");
        if (!svgHandle) {
          svgHandle = await root.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: "SVG", accept: { "image/svg+xml": [".svg"] } }],
          });
        }
        await writeHandle(svgHandle, text, filename, "image/svg+xml");
      } catch (err) {
        if (err && err.name === "AbortError") return;
        download(text, filename, "image/svg+xml");
        setStatus("Downloaded SVG — the file picker is not available here");
      }
    }

    async function saveJSON() {
      const text = JSON.stringify(doc, null, 2);
      const filename = (doc.name || "gdrew") + ".json";
      try {
        if (!root.showSaveFilePicker) throw new Error("no-fs");
        if (!jsonHandle) {
          jsonHandle = await root.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: "Gdrew project", accept: { "application/json": [".json"] } }],
          });
        }
        await writeHandle(jsonHandle, text, filename, "application/json");
      } catch (err) {
        if (err && err.name === "AbortError") return;
        download(text, filename, "application/json");
        setStatus("Downloaded project JSON — the file picker is not available here");
      }
    }

    function paintOf(el, name, fallback) {
      const style = el.getAttribute("style") || "";
      const found = style.match(new RegExp(name + "\\s*:\\s*([^;]+)"));
      return ((found && found[1]) || el.getAttribute(name) || fallback || "").trim();
    }

    function translateOf(el) {
      const t = el.getAttribute("transform") || "";
      const m = t.match(/translate\(\s*([-\d.]+)(?:[\s,]+([-\d.]+))?\s*\)/);
      if (!m) return { x: 0, y: 0 };
      return { x: parseFloat(m[1]) || 0, y: parseFloat(m[2]) || 0 };
    }

    function importSvg(xmlDoc) {
      const svg = xmlDoc.querySelector("svg");
      const next = blank();
      if (!svg) return next;
      const vb = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
      if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) {
        next.width = vb[2];
        next.height = vb[3];
      } else {
        const w = parseFloat(svg.getAttribute("width"));
        const h = parseFloat(svg.getAttribute("height"));
        if (w) next.width = w;
        if (h) next.height = h;
      }
      svg.querySelectorAll("rect,ellipse,circle,line,polygon,polyline,path,text,image").forEach((el) => {
        if (el.closest("defs") || el.querySelector("textPath")) return;
        const tr = translateOf(el);
        const fill = paintOf(el, "fill", "#0f8b7d") || "#0f8b7d";
        const stroke = paintOf(el, "stroke", "#14171c") || "none";
        const sw = num(paintOf(el, "stroke-width", "2"), 2);
        const tag = el.localName;
        const shape = {
          id: "s" + next.nextId++,
          x: tr.x,
          y: tr.y,
          rotation: 0,
          opacity: num(paintOf(el, "opacity", "1"), 1),
          fill: fill,
          stroke: stroke,
          strokeWidth: sw,
        };
        if (tag === "rect") {
          const w = el.getAttribute("width");
          const h = el.getAttribute("height");
          if (w === "100%" || h === "100%") {
            if (fill && fill !== "none") next.background = fill;
            return;
          }
          shape.type = "rect";
          shape.x += num(el.getAttribute("x"), 0);
          shape.y += num(el.getAttribute("y"), 0);
          shape.w = Math.max(1, num(w, 10));
          shape.h = Math.max(1, num(h, 10));
          if (shape.w >= next.width - 1 && shape.h >= next.height - 1 && shape.x === 0 && shape.y === 0) {
            next.background = fill;
            return;
          }
        } else if (tag === "ellipse" || tag === "circle") {
          const rx = tag === "circle" ? num(el.getAttribute("r"), 10) : num(el.getAttribute("rx"), 10);
          const ry = tag === "circle" ? rx : num(el.getAttribute("ry"), 10);
          shape.type = "ellipse";
          shape.w = Math.max(1, rx * 2);
          shape.h = Math.max(1, ry * 2);
          shape.x += num(el.getAttribute("cx"), 0) - rx;
          shape.y += num(el.getAttribute("cy"), 0) - ry;
        } else if (tag === "line") {
          shape.type = "line";
          shape.x1 = num(el.getAttribute("x1"), 0);
          shape.y1 = num(el.getAttribute("y1"), 0);
          shape.x2 = num(el.getAttribute("x2"), 10);
          shape.y2 = num(el.getAttribute("y2"), 10);
        } else if (tag === "polygon" || tag === "polyline") {
          const nums = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
          const anchors = [];
          for (let i = 0; i + 1 < nums.length; i += 2) anchors.push(makeAnchor(nums[i], nums[i + 1]));
          if (anchors.length < 2) return;
          shape.type = "path";
          shape.rings = [anchors];
          shape.closed = tag === "polygon";
          shape.fillRule = "nonzero";
        } else if (tag === "path") {
          const rings = parsePathD(el.getAttribute("d") || "");
          if (!rings.length) return;
          rings.forEach((ring, idx) => {
            const path = idx === 0 ? shape : { ...shape, id: "s" + next.nextId++ };
            path.type = "path";
            path.rings = [ring.anchors];
            path.closed = ring.closed;
            path.fillRule = (el.getAttribute("fill-rule") || "nonzero") === "evenodd" ? "evenodd" : "nonzero";
            if (!path.closed) path.fill = "none";
            next.shapes.push(path);
          });
          return;
        } else if (tag === "text") {
          shape.type = "text";
          shape.x += num(el.getAttribute("x"), 0);
          shape.y += num(el.getAttribute("y"), 0);
          shape.text = el.textContent || "Text";
          shape.font = paintOf(el, "font-family", REGULAR).replace(/['"]/g, "") || REGULAR;
          shape.size = Math.max(1, num(paintOf(el, "font-size", "24"), 24));
          shape.stroke = "none";
          shape.strokeWidth = 0;
        } else if (tag === "image") {
          const href = el.getAttribute("href") || el.getAttributeNS("http://www.w3.org/1999/xlink", "href") || "";
          if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(href)) return;
          shape.type = "image";
          shape.w = Math.max(1, num(el.getAttribute("width"), 100));
          shape.h = Math.max(1, num(el.getAttribute("height"), 100));
          shape.src = href;
          shape.name = "image";
          shape.fill = "none";
          shape.stroke = "none";
          shape.strokeWidth = 0;
        } else return;
        next.shapes.push(shape);
      });
      return next;
    }

    function loadText(text, filename) {
      const before = JSON.stringify(doc);
      const trimmed = text.trim();
      let next;
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) next = JSON.parse(trimmed);
      else {
        const xmlDoc = new DOMParser().parseFromString(text, "image/svg+xml");
        if (xmlDoc.querySelector("parsererror")) throw new Error("That file is not valid SVG");
        const meta = xmlDoc.querySelector("#folio-doc");
        if (meta && meta.textContent.trim().startsWith("{")) next = JSON.parse(meta.textContent);
        else next = importSvg(xmlDoc);
      }
      doc = normalize(next);
      if (filename) doc.name = filename.replace(/\.(svg|json)$/i, "").slice(0, 80);
      selected = [];
      nodeSel = null;
      pen = null;
      pushHist(before);
      paint();
      syncInspector();
      fitSoon();
      setStatus("Opened " + (filename || doc.name));
    }

    function readImageFile(file) {
      return new Promise((resolve, reject) => {
        if (!file || !/^image\/(png|jpeg|webp|gif)$/i.test(file.type)) {
          reject(new Error("Use a PNG, JPEG, WebP, or GIF"));
          return;
        }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          const srcW = img.naturalWidth || img.width;
          const srcH = img.naturalHeight || img.height;
          if (!srcW || !srcH) {
            reject(new Error("Could not read that image"));
            return;
          }
          const limit = 1600;
          const scale = Math.min(1, limit / Math.max(srcW, srcH));
          const cw = Math.max(1, Math.round(srcW * scale));
          const ch = Math.max(1, Math.round(srcH * scale));
          const canvas = document.createElement("canvas");
          canvas.width = cw;
          canvas.height = ch;
          canvas.getContext("2d").drawImage(img, 0, 0, cw, ch);
          resolve({ src: canvas.toDataURL("image/png"), w: srcW, h: srcH, name: file.name || "image" });
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Could not read that image"));
        };
        img.src = url;
      });
    }

    function placeImage(info) {
      const before = JSON.stringify(doc);
      let w = info.w;
      let h = info.h;
      const fit = Math.min(1, (doc.width * 0.8) / w, (doc.height * 0.8) / h);
      w = Math.max(1, Math.round(w * fit));
      h = Math.max(1, Math.round(h * fit));
      const rect = svg.getBoundingClientRect();
      const center = clientToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const shape = {
        id: allocId(),
        type: "image",
        x: snapN(center.x - w / 2),
        y: snapN(center.y - h / 2),
        w: w,
        h: h,
        rotation: 0,
        opacity: 1,
        src: info.src,
        name: String(info.name || "image").slice(0, 80),
        fill: "none",
        stroke: "none",
        strokeWidth: 0,
      };
      doc.shapes.push(shape);
      selected = [shape.id];
      nodeSel = null;
      tool = "select";
      pushHist(before);
      publishTool();
      paint();
      syncInspector();
      setStatus("Placed " + (shape.name || "image") + ". Format options can make one color transparent.");
    }

    function hexToRgb(hex) {
      const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ""));
      if (!m) return { r: 255, g: 255, b: 255 };
      const n = parseInt(m[1], 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function sampleImageColor(shape, world) {
      return new Promise((resolve) => {
        const local = worldToLocal(shape, world);
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || 1;
          canvas.height = img.naturalHeight || 1;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          const px = Math.floor((local.x / shape.w) * canvas.width);
          const py = Math.floor((local.y / shape.h) * canvas.height);
          if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) {
            resolve(null);
            return;
          }
          const p = ctx.getImageData(px, py, 1, 1).data;
          resolve("#" + [p[0], p[1], p[2]].map((v) => v.toString(16).padStart(2, "0")).join(""));
        };
        img.onerror = () => resolve(null);
        img.src = shape.src;
      });
    }

    function knockBitmap(src, hex, tolerance) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || 1;
          canvas.height = img.naturalHeight || 1;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = image.data;
          const rgb = hexToRgb(hex);
          const tol = Math.max(0, tolerance);
          const feather = Math.max(6, Math.round(tol * 0.45));
          for (let i = 0; i < d.length; i += 4) {
            const dist = Math.max(Math.abs(d[i] - rgb.r), Math.abs(d[i + 1] - rgb.g), Math.abs(d[i + 2] - rgb.b));
            if (dist <= tol) d[i + 3] = 0;
            else if (dist < tol + feather) d[i + 3] = Math.round(d[i + 3] * ((dist - tol) / feather));
          }
          ctx.putImageData(image, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => reject(new Error("Could not read that image"));
        img.src = src;
      });
    }

    async function knockSelected() {
      const shapes = selected.map(byId).filter((s) => s && s.type === "image" && s.src);
      if (!shapes.length) {
        setStatus("Select an image first");
        return;
      }
      const hex = $("img-key").value || "#ffffff";
      const tol = Number($("img-tol").value) || 0;
      setStatus("Removing " + hex + "…");
      try {
        const before = JSON.stringify(doc);
        for (const shape of shapes) shape.src = await knockBitmap(shape.src, hex, tol);
        pushHist(before);
        paint();
        syncInspector();
        setStatus("Made " + hex + " transparent");
      } catch (err) {
        setStatus(err && err.message ? err.message : "Could not change that image");
      }
    }

    async function importPng() {
      try {
        if (root.showOpenFilePicker) {
          const [handle] = await root.showOpenFilePicker({
            multiple: false,
            types: [{
              description: "Image",
              accept: {
                "image/png": [".png"],
                "image/jpeg": [".jpg", ".jpeg"],
                "image/webp": [".webp"],
                "image/gif": [".gif"],
              },
            }],
          });
          placeImage(await readImageFile(await handle.getFile()));
          return;
        }
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
      $("file-png").click();
    }

    async function openFile() {
      try {
        if (root.showOpenFilePicker) {
          const [handle] = await root.showOpenFilePicker({
            multiple: false,
            types: [{
              description: "Gdrew drawing",
              accept: { "image/svg+xml": [".svg"], "application/json": [".json"] },
            }],
          });
          const file = await handle.getFile();
          if (/\.json$/i.test(file.name)) jsonHandle = handle;
          else svgHandle = handle;
          loadText(await file.text(), file.name);
          return;
        }
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
      $("file-open").click();
    }

    function onPointerDown(e) {
      if (busy) return;
      if (e.button === 2 && tool !== "point") return;
      if (e.target.closest && e.target.closest(".ruler, .ruler-corner")) return;
      stage.focus({ preventScroll: true });
      const world = clientToWorld(e.clientX, e.clientY);
      if (keyPick) {
        keyPick = false;
        publishTool();
        const hit = identify(e.target);
        const shape = hit.shape ? byId(hit.shape) : null;
        if (!shape || shape.type !== "image") {
          setStatus("Click the image itself");
          return;
        }
        sampleImageColor(shape, world).then((hex) => {
          if (!hex) {
            setStatus("Could not read that pixel");
            return;
          }
          const input = $("img-key");
          if (input) input.value = hex;
          setStatus("Color " + hex + ". Make transparent when it looks right.");
        });
        return;
      }
      if (e.button === 1 || tool === "hand" || spaceDown) {
        drag = { mode: "pan", pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, panX: panX, panY: panY };
        stage.setPointerCapture(e.pointerId);
        publishTool();
        return;
      }
      const hit = identify(e.target);
      if (tool === "point") {
        if (e.button === 0 || e.button === 2) placePoint(world, e.button === 2 ? "corner" : "smooth", e.detail || 1, e.shiftKey);
        return;
      }
      if (tool === "pen") {
        let p = snapPt(world);
        if (!pen) pen = { anchors: [], dragging: false, hover: null };
        if (e.shiftKey && pen.anchors.length) p = lock45(pen.anchors[pen.anchors.length - 1], world);
        if (pen.anchors.length >= 3) {
          const a0 = pen.anchors[0];
          if (Math.hypot(p.x - a0.x, p.y - a0.y) < 14 / zoom) {
            commitPen(true);
            paint();
            syncInspector();
            return;
          }
        }
        const a = makeAnchor(p.x, p.y);
        pen.anchors.push(a);
        pen.dragging = true;
        drag = { mode: "pen", pointerId: e.pointerId };
        stage.setPointerCapture(e.pointerId);
        paint();
        return;
      }
      if (tool === "rect" || tool === "ellipse" || tool === "line" || tool === "shape") {
        drag = { mode: tool, pointerId: e.pointerId, start: snapPt(world), before: JSON.stringify(doc), moved: false };
        stage.setPointerCapture(e.pointerId);
        return;
      }
      if (tool === "text") {
        placeText(world);
        return;
      }
      if (e.detail === 2 && tool === "select" && hit.shape) {
        const s = byId(hit.shape);
        if (s && s.type === "path") {
          selected = [s.id];
          setTool("nodes");
          syncInspector();
          return;
        }
      }
      if (e.detail === 2 && tool === "nodes") {
        const node = hit.node || nearestNode(world);
        if (node && node.kind === "anchor") {
          const s = byId(node.shape);
          if (s) toggleAnchor(s, node.ring, node.index, s.rings[node.ring][node.index].mode === "smooth" ? "corner" : "smooth");
          return;
        }
        if (hit.shape) {
          const s = byId(hit.shape);
          if (s && s.type === "path") {
            const before = JSON.stringify(doc);
            if (insertOnPath(s, worldToLocal(s, world))) {
              selected = [s.id];
              pushHist(before);
              paint();
              syncInspector();
            }
            return;
          }
        }
      }
      if (tool === "nodes") {
        const node = hit.node || nearestNode(world);
        if (node) {
          selected = [node.shape];
          nodeSel = { shapeId: node.shape, ring: node.ring, index: node.index };
          drag = { mode: "node", pointerId: e.pointerId, node: node, before: JSON.stringify(doc) };
          stage.setPointerCapture(e.pointerId);
          paint();
          syncInspector();
          return;
        }
      }
      if (tool === "select" && hit.handle) {
        const s = byId(hit.handle.shape);
        if (!s) return;
        if (!selected.includes(s.id)) selected = [s.id];
        if (hit.handle.handle !== "move" && hit.handle.handle !== "rotate") ensureRef(s);
        if (hit.handle.handle === "move") {
          drag = {
            mode: "move",
            pointerId: e.pointerId,
            start: world,
            before: JSON.stringify(doc),
            origins: selected.map((id) => {
              const item = byId(id);
              return { id: id, x: item ? item.x || 0 : 0, y: item ? item.y || 0 : 0 };
            }),
          };
          stage.setPointerCapture(e.pointerId);
          return;
        }
        const center = localToWorld(s, localCenter(s));
        drag = {
          mode: hit.handle.handle === "rotate" ? "rotate" : "scale",
          pointerId: e.pointerId,
          handle: hit.handle.handle,
          shapeId: s.id,
          snapshot: structuredClone(s),
          before: JSON.stringify(doc),
          startAngle: Math.atan2(world.y - center.y, world.x - center.x),
        };
        stage.setPointerCapture(e.pointerId);
        return;
      }
      const shapeId = hit.shape;
      if (shapeId && (tool === "select" || tool === "nodes")) {
        if (e.shiftKey) {
          const i = selected.indexOf(shapeId);
          if (i >= 0) selected.splice(i, 1);
          else selected.push(shapeId);
        } else if (!selected.includes(shapeId)) selected = [shapeId];
        nodeSel = null;
        const shape = byId(shapeId);
        if (shape && shape.type !== "textPath") {
          drag = {
            mode: "move",
            pointerId: e.pointerId,
            start: world,
            before: JSON.stringify(doc),
            origins: selected.map((id) => {
              const s = byId(id);
              return { id: id, x: s ? s.x || 0 : 0, y: s ? s.y || 0 : 0 };
            }),
          };
          stage.setPointerCapture(e.pointerId);
        }
        paint();
        syncInspector();
        return;
      }
      if (!e.shiftKey) selected = [];
      nodeSel = null;
      drag = {
        mode: "marquee",
        pointerId: e.pointerId,
        additive: e.shiftKey,
        baseSel: selected.slice(),
        before: null,
      };
      marquee = { x0: world.x, y0: world.y, x1: world.x, y1: world.y };
      stage.setPointerCapture(e.pointerId);
      paint();
      syncInspector();
    }

    function onPointerMove(e) {
      const world = clientToWorld(e.clientX, e.clientY);
      const coords = $("folio-coords");
      if (coords) coords.textContent = formatLen(world.x) + ", " + formatLen(world.y);
      if (!drag) {
        if ((tool === "pen" || tool === "point") && pen) {
          pen.hover = e.shiftKey && pen.anchors.length ? lock45(pen.anchors[pen.anchors.length - 1], world) : snapPt(world);
          requestPaint();
        }
        return;
      }
      if (drag.pointerId !== e.pointerId) return;
      if (drag.mode === "pan") {
        panX = drag.panX + (e.clientX - drag.sx);
        panY = drag.panY + (e.clientY - drag.sy);
        cam.setAttribute("transform", `translate(${n(panX)} ${n(panY)}) scale(${n(zoom)})`);
        return;
      }
      if (drag.mode === "pen" && pen && pen.dragging) {
        const a = pen.anchors[pen.anchors.length - 1];
        const p = e.shiftKey ? lock45({ x: a.x, y: a.y }, world) : snapPt(world);
        a.outX = p.x - a.x;
        a.outY = p.y - a.y;
        a.inX = -a.outX;
        a.inY = -a.outY;
        a.mode = Math.hypot(a.outX, a.outY) > 0.5 ? "smooth" : "corner";
        requestPaint();
        return;
      }
      if (drag.mode === "rect" || drag.mode === "ellipse" || drag.mode === "line" || drag.mode === "shape") {
        let p = snapPt(world);
        if (e.shiftKey && drag.mode === "line") p = lock45(drag.start, world);
        if (e.shiftKey && drag.mode !== "line") {
          const dx = world.x - drag.start.x;
          const dy = world.y - drag.start.y;
          const s = Math.max(Math.abs(dx), Math.abs(dy));
          p = { x: drag.start.x + Math.sign(dx || 1) * s, y: drag.start.y + Math.sign(dy || 1) * s };
          p = snapPt(p);
        }
        if (drag.mode === "line") {
          draft = {
            id: "draft",
            type: "line",
            x: 0,
            y: 0,
            rotation: 0,
            x1: drag.start.x,
            y1: drag.start.y,
            x2: p.x,
            y2: p.y,
            fill: "none",
            stroke: currentStyle.stroke,
            strokeWidth: currentStyle.strokeWidth,
            opacity: currentStyle.opacity,
          };
        } else {
          const x = Math.min(drag.start.x, p.x);
          const y = Math.min(drag.start.y, p.y);
          const w = Math.max(1, Math.abs(p.x - drag.start.x));
          const h = Math.max(1, Math.abs(p.y - drag.start.y));
          if (drag.mode === "shape") {
            draft = w > 2 && h > 2 ? {
              id: "draft",
              type: "path",
              x: x,
              y: y,
              rotation: 0,
              rings: [buildRing(shapeKind, w, h)],
              closed: true,
              fillRule: "nonzero",
              fill: currentStyle.fill,
              stroke: currentStyle.stroke,
              strokeWidth: currentStyle.strokeWidth,
              opacity: currentStyle.opacity,
            } : null;
          } else {
            draft = {
              id: "draft",
              type: drag.mode,
              x: x,
              y: y,
              w: w,
              h: h,
              rotation: 0,
              fill: currentStyle.fill,
              stroke: currentStyle.stroke,
              strokeWidth: currentStyle.strokeWidth,
              opacity: currentStyle.opacity,
            };
          }
        }
        requestPaint();
        return;
      }
      if (drag.mode === "move") {
        let dx = world.x - drag.start.x;
        let dy = world.y - drag.start.y;
        if (e.shiftKey) {
          if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const o = drag.origins[0];
        if (o && doc.snap && doc.grid) {
          dx = snapN(o.x + dx) - o.x;
          dy = snapN(o.y + dy) - o.y;
          if (e.shiftKey) {
            if (Math.abs(world.x - drag.start.x) >= Math.abs(world.y - drag.start.y)) dy = 0;
            else dx = 0;
          }
        }
        for (const origin of drag.origins) {
          const s = byId(origin.id);
          if (!s || s.type === "textPath") continue;
          s.x = origin.x + dx;
          s.y = origin.y + dy;
        }
        requestPaint();
        return;
      }
      if (drag.mode === "marquee") {
        marquee.x1 = world.x;
        marquee.y1 = world.y;
        requestPaint();
        return;
      }
      if (drag.mode === "node") {
        const s = byId(drag.node.shape);
        const a = s && s.rings[drag.node.ring] && s.rings[drag.node.ring][drag.node.index];
        if (!a) return;
        let p = e.shiftKey ? world : snapPt(world);
        const local = worldToLocal(s, p);
        if (drag.node.kind === "anchor") {
          const target = e.shiftKey ? lock45(worldToLocal(s, drag.startWorld || localToWorld(s, a)), local) : local;
          if (!drag.startWorld) drag.startWorld = localToWorld(s, { x: a.x, y: a.y });
          const from = worldToLocal(s, drag.startWorld);
          const locked = e.shiftKey ? lock45(from, local) : local;
          a.x = locked.x;
          a.y = locked.y;
        } else if (drag.node.kind === "out" || drag.node.kind === "in") {
          const rel = e.shiftKey ? lock45({ x: a.x, y: a.y }, local) : local;
          const ox = rel.x - a.x;
          const oy = rel.y - a.y;
          if (drag.node.kind === "out") {
            a.outX = ox;
            a.outY = oy;
            if (a.mode === "smooth" && !e.altKey) {
              a.inX = -ox;
              a.inY = -oy;
            }
          } else {
            a.inX = ox;
            a.inY = oy;
            if (a.mode === "smooth" && !e.altKey) {
              a.outX = -ox;
              a.outY = -oy;
            }
          }
        }
        requestPaint();
        return;
      }
      if (drag.mode === "scale" || drag.mode === "rotate") {
        const live = byId(drag.shapeId);
        if (!live) return;
        const snap = drag.snapshot;
        restore(live, snap);
        if (drag.mode === "rotate") {
          const c = localToWorld(snap, localCenter(snap));
          const ang = Math.atan2(world.y - c.y, world.x - c.x);
          let deg = snap.rotation + ((ang - drag.startAngle) * 180) / Math.PI;
          if (e.shiftKey) deg = Math.round(deg / 45) * 45;
          live.rotation = deg;
        } else if (live.type === "rect" || live.type === "ellipse" || live.type === "image") {
          scaleBox(live, snap, drag.handle, world, e.shiftKey || snap.lockRatio !== false);
        } else if (live.type === "line") {
          scaleFree(live, snap, drag.handle, world, e.shiftKey || snap.lockRatio !== false, (sx, sy, fix) => {
            const mapx = (x) => fix.x + (x - fix.x) * sx;
            const mapy = (y) => fix.y + (y - fix.y) * sy;
            live.x1 = mapx(snap.x1);
            live.y1 = mapy(snap.y1);
            live.x2 = mapx(snap.x2);
            live.y2 = mapy(snap.y2);
          });
        } else if (live.type === "path") {
          scaleFree(live, snap, drag.handle, world, e.shiftKey || snap.lockRatio !== false, (sx, sy, fix) => {
            live.rings.forEach((ring, ri) => {
              ring.forEach((a, ai) => {
                const src = snap.rings[ri][ai];
                a.x = fix.x + (src.x - fix.x) * sx;
                a.y = fix.y + (src.y - fix.y) * sy;
                a.inX = src.inX * sx;
                a.inY = src.inY * sy;
                a.outX = src.outX * sx;
                a.outY = src.outY * sy;
              });
            });
          });
        } else if (live.type === "group") {
          scaleFree(live, snap, drag.handle, world, e.shiftKey || snap.lockRatio !== false, (sx, sy, fix) => {
            live.children = (snap.children || []).map((src) => {
              const copy = structuredClone(src);
              scaleMember(copy, src, sx, sy, fix);
              return copy;
            });
          });
        }
        requestPaint();
      }
    }

    function onPointerUp(e) {
      if (!drag || drag.pointerId !== e.pointerId) return;
      if (drag.mode === "pen") {
        pen.dragging = false;
        const a = pen.anchors[pen.anchors.length - 1];
        if (a && Math.hypot(a.outX, a.outY) < 0.5) {
          a.inX = a.inY = a.outX = a.outY = 0;
          a.mode = "corner";
        }
        drag = null;
        paint();
        return;
      }
      if (drag.mode === "rect" || drag.mode === "ellipse" || drag.mode === "line" || drag.mode === "shape") {
        const before = drag.before;
        const made = draft && (draft.type === "line" ? Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 2 : draft.type === "path" ? true : draft.w > 2 && draft.h > 2);
        if (made) {
          draft.id = allocId();
          ensureRef(draft);
          doc.shapes.push(draft);
          selected = [draft.id];
          pushHist(before);
        }
        draft = null;
        drag = null;
        paint();
        syncInspector();
        return;
      }
      if (drag.mode === "marquee") {
        const ids = shapesInRect(marquee.x0, marquee.y0, marquee.x1, marquee.y1);
        selected = drag.additive ? Array.from(new Set(drag.baseSel.concat(ids))) : ids;
        if (Math.hypot(marquee.x1 - marquee.x0, marquee.y1 - marquee.y0) < 3 && !drag.additive) selected = [];
        marquee = null;
        drag = null;
        paint();
        syncInspector();
        return;
      }
      if (drag.mode === "pan") {
        drag = null;
        publishTool();
        return;
      }
      const before = drag.before;
      if (drag.mode === "rotate") {
        for (const id of selected) {
          const s = byId(id);
          if (s) s.rotation = normDeg(s.rotation || 0);
        }
      }
      drag = null;
      if (before && JSON.stringify(doc) !== before) pushHist(before);
      paint();
      syncInspector();
    }

    function onWheel(e) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      zoomAt(e.clientX, e.clientY, zoom * factor);
    }

    function onKeyDown(e) {
      const el = e.target;
      const typing = !!(el && typeof el.closest === "function" && (el.closest("input, textarea, select") || el.isContentEditable));
      if (e.key === "Escape") {
        const openDialog = shell.querySelector(".dialog:not([hidden])");
        const popOpen = shell.querySelector(".menu-pop:not([hidden]), .shape-pop:not([hidden]), .color-pop:not([hidden])");
        if (openDialog || popOpen) {
          if (openDialog) openDialog.hidden = true;
          closePops();
          return;
        }
        if (keyPick) {
          keyPick = false;
          publishTool();
          setStatus("Color pick cancelled");
          return;
        }
        if (typing) {
          e.target.blur();
          return;
        }
        if (drag && drag.before) doc = JSON.parse(drag.before);
        drag = null;
        draft = null;
        marquee = null;
        if (pen) {
          pen = null;
          paint();
          setStatus("Pen cancelled");
          return;
        }
        selected = [];
        nodeSel = null;
        paint();
        syncInspector();
        return;
      }
      if (e.key === " " && !typing) {
        e.preventDefault();
        spaceDown = true;
        publishTool();
        return;
      }
      if (typing) return;
      const meta = e.metaKey || e.ctrlKey;
      if (e.key === "Tab" && !meta) {
        const focus = document.activeElement;
        const onCanvas = !focus || focus === document.body || focus === stage || focus === shell || stage.contains(focus);
        if (onCanvas) {
          e.preventDefault();
          cycleSelection(e.shiftKey ? -1 : 1);
          return;
        }
      }
      const key = e.key.toLowerCase();
      if (meta && (e.key === "/" || e.code === "Slash")) {
        e.preventDefault();
        const box = $("shortcuts");
        if (box && !box.hidden) box.hidden = true;
        else openShortcuts();
        return;
      }
      if (meta && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redoDoc();
        else undoDoc();
        return;
      }
      if (meta && key === "y") {
        e.preventDefault();
        redoDoc();
        return;
      }
      if (meta && key === "d") {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (meta && key === "g") {
        e.preventDefault();
        if (e.shiftKey) ungroupSelected();
        else groupSelected();
        return;
      }
      if (meta && key === "a") {
        e.preventDefault();
        selected = doc.shapes.map((s) => s.id);
        paint();
        syncInspector();
        return;
      }
      if (meta && key === "s") {
        e.preventDefault();
        if (e.shiftKey) saveJSON();
        else saveSVG();
        return;
      }
      if (meta && key === "o") {
        e.preventDefault();
        openFile();
        return;
      }
      if (meta && key === "n") {
        e.preventDefault();
        newDoc();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (e.key === "Enter" && (tool === "pen" || tool === "point")) {
        e.preventDefault();
        commitPen(false);
        paint();
        syncInspector();
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudge(-step, 0);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        nudge(step, 0);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        nudge(0, -step);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        nudge(0, step);
        return;
      }
      if (e.key === "]") {
        e.preventDefault();
        reorder(meta ? "front" : "forward");
        return;
      }
      if (e.key === "[") {
        e.preventDefault();
        reorder(meta ? "back" : "backward");
        return;
      }
      if (!meta && !e.altKey) {
        const tools = { v: "select", a: "nodes", p: "pen", y: "point", r: "rect", e: "ellipse", l: "line", t: "text", h: "hand" };
        if (tools[key]) {
          setTool(tools[key]);
          return;
        }
      }
    }

    function onKeyUp(e) {
      if (e.key === " ") {
        spaceDown = false;
        publishTool();
      }
    }

    function readNum(id, fallback) {
      const el = $(id);
      const v = parseFloat(el.value);
      return Number.isFinite(v) ? v : fallback;
    }

    function onFocusIn(e) {
      if (e.target.matches("input, textarea, select")) focusSnap = JSON.stringify(doc);
    }

    function noteEdit() {
      if (focusSnap) {
        pushHist(focusSnap);
        focusSnap = null;
      }
    }

    function onInspector(e) {
      const t = e.target;
      if (!t.id) return;
      if (t.id === "img-tol") {
        const lab = $("img-tol-val");
        if (lab) lab.textContent = t.value;
        return;
      }
      if (t.id === "pref-snap" || t.id === "snap-custom") {
        noteEdit();
        const px = parseLen(t.value, doc.grid);
        if (px > 0) doc.grid = clamp(px, 0.25, 800);
        doc.snap = true;
        dirtySave();
        paint();
        syncInspector();
        const unit = currentUnit();
        const mark = unit === "decimal" || unit === "fraction" ? "in" : unit;
        setStatus("Snap " + formatLen(doc.grid) + " " + mark);
        return;
      }
      if (t.id === "pref-theme") {
        theme = t.value === "dark" || t.value === "light" ? t.value : "system";
        try {
          localStorage.setItem("gdrew.theme", theme);
        } catch (err) {
          /* this visit still uses the chosen theme */
        }
        applyTheme();
        paint();
        return;
      }
      if (t.id === "custom-color") {
        applyGoogleColor(t.value, "custom");
        return;
      }
      if (t.id === "doc-name") {
        noteEdit();
        doc.name = t.value.slice(0, 80);
        dirtySave();
        return;
      }
      if (t.id === "doc-unit") {
        doc.unit = UNITS.indexOf(t.value) >= 0 ? t.value : "px";
        doc.grid = defaultSnapPx(doc.unit);
        doc.snap = true;
        try {
          localStorage.setItem("gdrew.unit", doc.unit);
        } catch (err) {
          /* this drawing still uses the chosen unit */
        }
        dirtySave();
        syncInspector();
        drawRulers();
        savePrefs();
        return;
      }
      if (t.id === "doc-w" || t.id === "doc-h") {
        noteEdit();
        doc.width = clamp(readLen("doc-w", doc.width), 16, 8000);
        doc.height = clamp(readLen("doc-h", doc.height), 16, 8000);
        dirtySave();
        paint();
        savePrefs();
        return;
      }
      if (t.id === "doc-bg" || t.id === "pref-page-none") {
        noteEdit();
        doc.background = t.id === "pref-page-none" ? (t.checked ? "none" : ($("doc-bg").value || "#ffffff")) : t.value;
        dirtySave();
        paint();
        savePrefs();
        return;
      }
      if (t.id === "pref-nofill" || t.id === "pref-fill" || t.id === "pref-stroke" || t.id === "pref-sw") {
        if (t.id === "pref-nofill") currentStyle.fill = t.checked ? "none" : ($("pref-fill").value || "#ffffff");
        else if (t.id === "pref-fill") {
          currentStyle.fill = t.value;
          $("pref-nofill").checked = false;
        } else if (t.id === "pref-stroke") currentStyle.stroke = t.value;
        else currentStyle.strokeWidth = Math.max(0, readLen("pref-sw", currentStyle.strokeWidth || 0));
        savePrefs();
        syncInspector();
        return;
      }
      if (t.id === "shape-list") {
        focusSnap = null;
        const id = t.value;
        const picked = id ? byId(id) : null;
        selected = picked ? [picked.id] : [];
        nodeSel = null;
        if (picked && tool !== "select" && tool !== "nodes") setTool("select");
        else paint();
        syncInspector();
        if (picked) setStatus(shapeTitle(picked));
        return;
      }
      const shapes = selected.map(byId).filter(Boolean);
      const s = shapes.length === 1 ? shapes[0] : null;
      if (t.id === "shape-name") {
        if (!s) return;
        noteEdit();
        const name = cleanName(t.value);
        if (name) s.name = name;
        else delete s.name;
        dirtySave();
        syncShapeList();
        const label = $("sel-label");
        if (label) label.textContent = shapeTitle(s);
        return;
      }
      if (t.id === "prop-x" || t.id === "prop-y" || t.id === "prop-rot") {
        if (!s || s.type === "textPath") return;
        noteEdit();
        s.x = readLen("prop-x", s.x || 0);
        s.y = readLen("prop-y", s.y || 0);
        s.rotation = readNum("prop-rot", s.rotation || 0);
        dirtySave();
        paint();
        return;
      }
      if (t.id === "prop-w" || t.id === "prop-h" || t.id === "prop-sx" || t.id === "prop-sy") {
        if (!s || s.type === "textPath") return;
        if ((t.id === "prop-w" || t.id === "prop-h") && (s.type === "text" || s.type === "group")) return;
        noteEdit();
        ensureRef(s);
        const size = shapeSize(s);
        const lock = $("prop-lock").checked;
        let nw = size.w;
        let nh = size.h;
        if (t.id === "prop-w" || t.id === "prop-h") {
          const value = Math.max(1, readLen(t.id, 1));
          if (t.id === "prop-w") {
            nw = value;
            if (lock) nh = size.h * (nw / size.w);
          } else {
            nh = value;
            if (lock) nw = size.w * (nh / size.h);
          }
        } else {
          const pct = clamp(readNum(t.id, 100), 1, 10000);
          if (t.id === "prop-sx" || lock) nw = s.refW * pct / 100;
          if (t.id === "prop-sy" || lock) nh = s.refH * pct / 100;
        }
        setShapeSize(s, nw, nh);
        s.lockRatio = lock;
        dirtySave();
        paint();
        syncInspector();
        return;
      }
      if (t.id === "prop-lock") {
        if (!s || s.type === "textPath") return;
        s.lockRatio = t.checked;
        dirtySave();
        return;
      }
      if (t.id === "prop-fill" || t.id === "prop-nofill" || t.id === "prop-stroke" || t.id === "prop-sw" || t.id === "prop-op") {
        if (!shapes.length) return;
        noteEdit();
        if (t.id === "prop-nofill") paintShapes(shapes, "fill", t.checked ? "none" : $("prop-fill").value);
        else if (t.id === "prop-fill") {
          paintShapes(shapes, "fill", t.value);
          $("prop-nofill").checked = false;
        } else if (t.id === "prop-stroke") paintShapes(shapes, "stroke", t.value);
        else if (t.id === "prop-sw") paintShapes(shapes, "width", Math.max(0, readLen("prop-sw", 0)));
        else if (t.id === "prop-op") {
          for (const shape of shapes) shape.opacity = clamp(Number(t.value) / 100, 0, 1);
        }
        const painted = styleOf(shapes[shapes.length - 1]);
        if (painted) remember(painted);
        dirtySave();
        paint();
        return;
      }
      if (!s) return;
      if (t.id === "path-rule" && s.type === "path") {
        noteEdit();
        s.fillRule = t.value;
        dirtySave();
        paint();
        return;
      }
      if ((t.id === "node-x" || t.id === "node-y") && s.type === "path" && nodeSel) {
        const a = s.rings[nodeSel.ring] && s.rings[nodeSel.ring][nodeSel.index];
        if (!a) return;
        noteEdit();
        const local = worldToLocal(s, { x: readLen("node-x", 0), y: readLen("node-y", 0) });
        a.x = local.x;
        a.y = local.y;
        dirtySave();
        paint();
        return;
      }
      if (t.id === "text-body" || t.id === "text-font" || t.id === "text-size" || t.id === "tp-angle" || t.id === "tp-baseline" || t.id === "tp-side" || t.id === "tp-tracking") {
        if (s.type !== "text" && s.type !== "textPath") return;
        noteEdit();
        if (t.id === "text-body") s.text = t.value;
        if (t.id === "text-font") {
          s.font = t.value;
          s.fontWeight = weightFor(t.value);
        }
        if (t.id === "text-size") s.size = Math.max(1, readLen("text-size", s.size));
        if (t.id === "tp-angle" && s.type === "textPath") s.startAngle = readNum("tp-angle", 0);
        if (t.id === "tp-baseline" && s.type === "textPath") s.baseline = readLen("tp-baseline", 0);
        if (t.id === "tp-side" && s.type === "textPath") s.side = t.value === "inside" ? "inside" : "outside";
        if (t.id === "tp-tracking" && s.type === "textPath") s.letterSpacing = readLen("tp-tracking", 0);
        dirtySave();
        paint();
      }
    }

    function closePops() {
      shell.querySelectorAll(".menu-pop, .shape-pop, .color-pop").forEach((el) => { el.hidden = true; });
      shell.querySelectorAll("[aria-expanded='true']").forEach((el) => {
        if (el.id === "props-toggle") return;
        el.setAttribute("aria-expanded", "false");
      });
    }

    async function pickScreenColor() {
      if (typeof EyeDropper !== "function") {
        setStatus("Eyedropper is not available in this browser");
        const input = $("custom-color");
        if (input) input.click();
        return;
      }
      try {
        const result = await new EyeDropper().open();
        if (result && result.sRGBHex) applyGoogleColor(result.sRGBHex, "picked");
      } catch (err) {
        /* the user cancelled the eyedropper */
      }
    }

    function openPop(id, anchor) {
      const pop = $(id);
      if (!pop || !anchor) return;
      pop.hidden = false;
      pop.style.position = "fixed";
      pop.style.zIndex = "80";
      const r = anchor.getBoundingClientRect();
      let left = r.left;
      let top = r.bottom + 6;
      pop.style.left = left + "px";
      pop.style.top = top + "px";
      const pw = pop.offsetWidth || 220;
      const ph = pop.offsetHeight || 180;
      if (left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pw - 8);
      if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
      pop.style.left = left + "px";
      pop.style.top = top + "px";
      anchor.setAttribute("aria-expanded", "true");
    }

    function toggleNamed(id, btn) {
      const pop = $(id);
      if (!pop) return;
      const willOpen = pop.hidden;
      closePops();
      if (!willOpen) return;
      pop.hidden = false;
      if (btn) btn.setAttribute("aria-expanded", "true");
    }

    function zoomCenter(nz) {
      const r = svg.getBoundingClientRect();
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, nz);
    }

    function setBorderWeight(px) {
      const shapes = selected.map(byId).filter((s) => s && s.type !== "textPath" && s.type !== "image");
      currentStyle.strokeWidth = px;
      if (!shapes.length) {
        syncInspector();
        savePrefs();
        setStatus("Border " + px + "px");
        return;
      }
      const before = JSON.stringify(doc);
      paintShapes(shapes, "width", px);
      pushHist(before);
      paint();
      syncInspector();
      setStatus("Border " + px + "px");
      savePrefs();
    }

    const SHORTCUTS = [
      ["Tools", [
        ["Select", "V"],
        ["Nodes", "A"],
        ["Pen", "P"],
        ["Point pen", "Y"],
        ["Rectangle", "R"],
        ["Ellipse", "E"],
        ["Line", "L"],
        ["Text box", "T"],
        ["Hand", "H"],
      ]],
      ["With objects", [
        ["Duplicate", "Ctrl D"],
        ["Group", "Ctrl G"],
        ["Ungroup", "Ctrl Shift G"],
        ["Delete", "Del"],
        ["Nudge 1 px", "Arrows"],
        ["Nudge 10 px", "Shift Arrows"],
        ["Bring forward", "]"],
        ["Send backward", "["],
        ["Bring to front", "Ctrl ]"],
        ["Send to back", "Ctrl ["],
        ["Next shape", "Tab"],
        ["Previous shape", "Shift Tab"],
        ["Deselect", "Esc"],
      ]],
      ["Drawing", [
        ["Finish an open pen path", "Enter"],
        ["Point pen corner, or start", "Right-click"],
        ["Point pen smooth node", "Left-click"],
        ["Finish an open point path", "Double-click"],
        ["Close a point path", "Click start"],
        ["Cancel the pen", "Esc"],
        ["Constrain a drag to 45°", "Shift"],
        ["Pan", "Space"],
        ["Zoom", "Wheel"],
      ]],
      ["File", [
        ["New", "Ctrl N"],
        ["Open", "Ctrl O"],
        ["Download SVG", "Ctrl S"],
        ["Download JSON", "Ctrl Shift S"],
        ["Undo", "Ctrl Z"],
        ["Redo", "Ctrl Shift Z"],
        ["Redo again", "Ctrl Y"],
        ["Select all", "Ctrl A"],
        ["Paste an image", "Ctrl V"],
        ["Keyboard shortcuts", "Ctrl /"],
      ]],
    ];

    function renderShortcuts() {
      const list = $("shortcut-list");
      const q = ($("shortcut-search").value || "").trim().toLowerCase();
      if (!list) return;
      let html = "";
      for (const [title, rows] of SHORTCUTS) {
        const kept = rows.filter(([name, keys]) => !q || (name + " " + keys).toLowerCase().includes(q));
        if (!kept.length) continue;
        html += `<h3 class="shortcut-sec">${xml(title)}</h3>`;
        for (const [name, keys] of kept) {
          const chips = keys.split(" ").filter(Boolean).map((k) => `<kbd>${xml(k)}</kbd>`).join("");
          html += `<div class="shortcut-row"><span>${xml(name)}</span><span class="shortcut-keys">${chips}</span></div>`;
        }
      }
      list.innerHTML = html || `<p class="hint">No shortcuts match.</p>`;
    }

    function openShortcuts() {
      const box = $("shortcuts");
      const search = $("shortcut-search");
      if (!box || !search) return;
      closePops();
      search.value = "";
      renderShortcuts();
      box.hidden = false;
      search.focus();
    }

    function runCmd(cmd) {
      if (cmd === "undo") undoDoc();
      else if (cmd === "redo") redoDoc();
      else if (cmd === "png") importPng();
      else if (cmd === "page" || cmd === "prefs") $("prefs").hidden = false;
      else if (cmd === "dup") duplicateSelected();
      else if (cmd === "del") deleteSelected();
      else if (cmd === "all") {
        selected = doc.shapes.map((s) => s.id);
        nodeSel = null;
        paint();
        syncInspector();
      } else if (cmd === "zoom-in") zoomCenter(zoom * 1.15);
      else if (cmd === "zoom-out") zoomCenter(zoom / 1.15);
      else if (cmd === "zoom-fit") { fit(); paint(); }
      else if (cmd === "front" || cmd === "forward" || cmd === "backward" || cmd === "back") reorder(cmd);
      else if (cmd === "flip-h") mirrorSelection("h");
      else if (cmd === "flip-v") mirrorSelection("v");
      else if (cmd === "group") groupSelected();
      else if (cmd === "ungroup") ungroupSelected();
      else if (cmd === "on-path") bindText();
      else if (cmd === "fill" || cmd === "border") {
        paletteTarget = cmd === "fill" ? "fill" : "stroke";
        syncPaletteUi();
        openPop("color-pop", $(cmd === "fill" ? "btn-fill" : "btn-border"));
      } else if (cmd === "weight") openPop("weight-pop", $("btn-weight"));
      else if (cmd === "shapes") toggleShapeMenu();
      else if (cmd === "shortcuts") openShortcuts();
    }

    shell.addEventListener("click", (e) => {
      const menuBtn = e.target.closest(".menu-btn");
      if (menuBtn) {
        const pop = $(menuBtn.getAttribute("aria-controls"));
        const willOpen = pop && pop.hidden;
        closePops();
        if (willOpen) {
          pop.hidden = false;
          menuBtn.setAttribute("aria-expanded", "true");
        }
        return;
      }
      if (e.target.closest("#zoom-btn")) {
        const pop = $("menu-zoom");
        const willOpen = pop && pop.hidden;
        closePops();
        if (willOpen) openPop("menu-zoom", $("zoom-btn"));
        return;
      }
      if (e.target.closest("#btn-weight")) {
        const pop = $("weight-pop");
        const willOpen = pop && pop.hidden;
        closePops();
        if (willOpen) openPop("weight-pop", $("btn-weight"));
        return;
      }
      const fillBtn = e.target.closest("#btn-fill");
      const borderBtn = e.target.closest("#btn-border");
      if (fillBtn || borderBtn) {
        const target = fillBtn ? "fill" : "stroke";
        const pop = $("color-pop");
        const same = pop && !pop.hidden && paletteTarget === target;
        closePops();
        if (!same) {
          paletteTarget = target;
          syncPaletteUi();
          openPop("color-pop", fillBtn || borderBtn);
        }
        return;
      }
      const onCaret = e.target.closest("#shape-caret");
      if (onCaret) {
        const willOpen = $("shape-pop").hidden;
        closePops();
        if (willOpen) toggleShapeMenu();
        return;
      }
      const picked = e.target.closest("[data-lib]");
      if (picked) {
        setShapeKind(picked.dataset.lib);
        closePops();
        return;
      }
      const weight = e.target.closest("[data-weight]");
      if (weight) {
        setBorderWeight(Number(weight.dataset.weight));
        closePops();
        return;
      }
      const zoomPick = e.target.closest("[data-zoom]");
      if (zoomPick) {
        zoomCenter(Number(zoomPick.dataset.zoom));
        closePops();
        return;
      }
      const cmdEl = e.target.closest("[data-cmd]");
      if (cmdEl) {
        const cmd = cmdEl.dataset.cmd;
        closePops();
        runCmd(cmd);
        return;
      }
      const swatch = e.target.closest("[data-swatch]");
      if (swatch) {
        applyGoogleColor(swatch.dataset.swatch, swatch.dataset.name || "");
        closePops();
        return;
      }
      const toolBtn = e.target.closest("[data-tool]");
      if (toolBtn) {
        setTool(toolBtn.dataset.tool);
        closePops();
        return;
      }
      const op = e.target.closest("[data-op]");
      if (op) {
        runBoolean(op.dataset.op);
        closePops();
        return;
      }
      const alignBtn = e.target.closest("[data-align]");
      if (alignBtn) {
        alignSelection(alignBtn.dataset.align);
        closePops();
        return;
      }
      if (e.target.classList.contains("dialog")) e.target.hidden = true;
      if (!e.target.closest(".menu-pop, .shape-pop, .color-pop, .dialog-card")) closePops();
      const grid = e.target.closest("[data-grid]");
      if (grid) {
        const before = JSON.stringify(doc);
        doc.grid = Number(grid.dataset.grid);
        doc.snap = true;
        pushHist(before);
        paint();
        syncInspector();
        setStatus("Snap " + doc.grid + "px");
        closePops();
        return;
      }
      const id = e.target.closest("button") && e.target.closest("button").id;
      if (id === "btn-undo") undoDoc();
      else if (id === "btn-redo") redoDoc();
      else if (id === "btn-theme") {
        theme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
        try {
          localStorage.setItem("gdrew.theme", theme);
        } catch (err) {
          /* the drawing still flips for this visit */
        }
        applyTheme();
        paint();
      }
      else if (id === "btn-dropper") pickScreenColor();
      else if (id === "btn-group") groupSelected();
      else if (id === "btn-ungroup") ungroupSelected();
      else if (id === "btn-new") newDoc();
      else if (id === "btn-open") openFile();
      else if (id === "btn-png") importPng();
      else if (id === "btn-svg") saveSVG();
      else if (id === "btn-json") saveJSON();
      else if (id === "snap-toggle") {
        const before = JSON.stringify(doc);
        doc.snap = !doc.snap;
        pushHist(before);
        syncInspector();
        setStatus(doc.snap ? "Snap on" : "Snap off");
      } else if (id === "grid-toggle") {
        const before = JSON.stringify(doc);
        doc.showGrid = !doc.showGrid;
        pushHist(before);
        paint();
        syncInspector();
      } else if (id === "zoom-in") {
        const r = svg.getBoundingClientRect();
        zoomAt(r.left + r.width / 2, r.top + r.height / 2, zoom * 1.15);
      } else if (id === "zoom-out") {
        const r = svg.getBoundingClientRect();
        zoomAt(r.left + r.width / 2, r.top + r.height / 2, zoom / 1.15);
      } else if (id === "zoom-fit") {
        fit();
        paint();
      } else if (id === "props-toggle") {
        inspectorOpen = !inspectorOpen;
        shell.classList.toggle("open-inspector", inspectorOpen);
        syncInspector();
      } else if (id === "btn-dup") duplicateSelected();
      else if (id === "btn-del") deleteSelected();
      else if (id === "btn-flip-h") mirrorSelection("h");
      else if (id === "btn-flip-v") mirrorSelection("v");
      else if (id === "btn-front") reorder("front");
      else if (id === "btn-back") reorder("backward");
      else if (id === "btn-forward") reorder("forward");
      else if (id === "btn-to-back") reorder("back");
      else if (id === "prefs-done" || id === "prefs-close") $("prefs").hidden = true;
      else if (id === "shortcuts-close") $("shortcuts").hidden = true;
      else if (id === "btn-pick-key") {
        keyPick = true;
        stage.style.cursor = "crosshair";
        setStatus("Click the color on the image");
      }
      else if (id === "btn-knock") knockSelected();
      else if (id === "btn-on-path") bindText();
      else if (id === "btn-add-node") addNode();
      else if (id === "node-corner" || id === "node-smooth") {
        const s = single();
        if (s && s.type === "path" && nodeSel) toggleAnchor(s, nodeSel.ring, nodeSel.index, id === "node-smooth" ? "smooth" : "corner");
      }
      if (id && e.target.closest(".menu-pop")) closePops();
    });

    shell.addEventListener("pointerover", (e) => {
      const swatch = e.target.closest && e.target.closest("[data-swatch]");
      const name = $("palette-name");
      if (!swatch || !name) return;
      name.textContent = (swatch.dataset.name || "") + " " + (swatch.dataset.swatch || "");
    });
    shell.addEventListener("input", onInspector);
    shell.addEventListener("change", onInspector);
    $("shortcut-search").addEventListener("input", renderShortcuts);
    shell.addEventListener("focusin", onFocusIn);
    $("file-open").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        loadText(await file.text(), file.name);
      } catch (err) {
        setStatus(err && err.message ? err.message : "Could not open that file");
      }
    });
    $("file-png").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        placeImage(await readImageFile(file));
      } catch (err) {
        setStatus(err && err.message ? err.message : "Could not import that image");
      }
    });
    window.addEventListener("paste", async (e) => {
      const el = e.target;
      const typing = !!(el && typeof el.closest === "function" && el.closest("input, textarea, select"));
      if (typing || !e.clipboardData) return;
      const items = e.clipboardData.items ? Array.from(e.clipboardData.items) : [];
      const item = items.find((it) => it.kind === "file" && /^image\/(png|jpeg|webp|gif)$/i.test(it.type));
      const file = item ? item.getAsFile() : null;
      if (!file) return;
      e.preventDefault();
      try {
        placeImage(await readImageFile(file));
      } catch (err) {
        setStatus(err && err.message ? err.message : "Could not paste that image");
      }
    }, opt);
    stage.addEventListener("dragover", (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) e.preventDefault();
    }, opt);
    stage.addEventListener("drop", async (e) => {
      const files = e.dataTransfer ? Array.from(e.dataTransfer.files || []) : [];
      const file = files.find((f) => /^image\/(png|jpeg|webp|gif)$/i.test(f.type));
      if (!file) return;
      e.preventDefault();
      try {
        placeImage(await readImageFile(file));
      } catch (err) {
        setStatus(err && err.message ? err.message : "Could not drop that image");
      }
    }, opt);
    stage.addEventListener("pointerdown", onPointerDown, opt);
    if (window.ResizeObserver) new ResizeObserver(() => requestRulers()).observe(svg);
    stage.addEventListener("pointermove", (e) => {
      rulerCursor = clientToWorld(e.clientX, e.clientY);
      requestRulers();
    }, opt);
    stage.addEventListener("pointerleave", () => {
      rulerCursor = null;
      requestRulers();
    }, opt);
    stage.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (tool === "point") return;
      const hit = identify(e.target);
      if (hit.shape && !selected.includes(hit.shape)) {
        selected = [hit.shape];
        nodeSel = null;
        if (tool !== "select" && tool !== "nodes") setTool("select");
        else { paint(); syncInspector(); }
      }
      if (!selected.length) {
        closePops();
        return;
      }
      closePops();
      const ctx = $("ctx");
      ctx.hidden = false;
      const hostR = shell.getBoundingClientRect();
      const pw = 240;
      const ph = 560;
      let left = e.clientX - hostR.left;
      let top = e.clientY - hostR.top;
      if (left + pw > hostR.width - 8) left = Math.max(8, hostR.width - pw - 8);
      if (top + ph > hostR.height - 8) top = Math.max(8, hostR.height - ph - 8);
      ctx.style.left = left + "px";
      ctx.style.top = top + "px";
    }, opt);
    stage.addEventListener("wheel", onWheel, { passive: false, signal: ac.signal });
    window.addEventListener("pointermove", onPointerMove, opt);
    window.addEventListener("pointerup", onPointerUp, opt);
    window.addEventListener("pointercancel", onPointerUp, opt);
    window.addEventListener("keydown", onKeyDown, opt);
    window.addEventListener("keyup", onKeyUp, opt);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushSave();
    }, opt);
    narrow.addEventListener("change", () => {
      if (narrow.matches && inspectorOpen) {
        inspectorOpen = false;
        shell.classList.remove("open-inspector");
        syncInspector();
      }
    });

    function destroy() {
      alive = false;
      ac.abort();
      clearTimeout(saveTimer);
      flushSave();
      if (raf) cancelAnimationFrame(raf);
      if (rulerRaf) cancelAnimationFrame(rulerRaf);
      for (const hit of imageBlobs.values()) URL.revokeObjectURL(hit.url);
      imageBlobs.clear();
      host.__folio = null;
      delete host.__folioApi;
    }

    host.__folioApi = { destroy: destroy };
    publishTool();
    applyTheme();
    paint();
    syncInspector();
    fitSoon();
    setStatus("Drafts stay in this browser. Select two closed shapes, then Union or Subtract.");
    root.__folioReady = true;
  }

  function unmount(host) {
    if (!host) return;
    if (host.__folioApi) host.__folioApi.destroy();
    host.innerHTML = "";
  }

  root.Folio = { mount: mount, unmount: unmount };
})(typeof globalThis !== "undefined" ? globalThis : this);
