/* Folio geometry — polygon boolean and bezier sampling.
   No dependencies. Exposes globalThis.FolioGeom. */
(function (root) {
  "use strict";

  function signedArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
  }

  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x;
      const yi = poly[i].y;
      const xj = poly[j].x;
      const yj = poly[j].y;
      const hit = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (hit) inside = !inside;
    }
    return inside;
  }

  function onSeg(px, py, a, b, tol) {
    const limit = tol == null ? 1e-5 : tol;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = px - a.x;
    const apy = py - a.y;
    const cross = abx * apy - aby * apx;
    const len = Math.hypot(abx, aby) || 1;
    if (Math.abs(cross) / len > limit) return false;
    const dot = apx * abx + apy * aby;
    if (dot < -limit * len) return false;
    const len2 = abx * abx + aby * aby;
    if (dot > len2 + limit * len) return false;
    return true;
  }

  function onBoundary(x, y, poly) {
    for (let i = 0; i < poly.length; i++) {
      if (onSeg(x, y, poly[i], poly[(i + 1) % poly.length], 1e-4)) return true;
    }
    return false;
  }

  function dedupe(pts) {
    const out = [];
    for (const p of pts) {
      const prev = out[out.length - 1];
      if (prev && Math.hypot(prev.x - p.x, prev.y - p.y) < 1e-6) continue;
      out.push({ x: p.x, y: p.y });
    }
    if (out.length > 1) {
      const a = out[0];
      const b = out[out.length - 1];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) out.pop();
    }
    return out;
  }

  function dropCollinear(pts) {
    if (pts.length < 4) return pts;
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n];
      const b = pts[i];
      const c = pts[(i + 1) % n];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      const base = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y);
      if (base > 1e-6 && Math.abs(cross) / base < 1e-3) continue;
      out.push(b);
    }
    return out.length >= 3 ? out : pts;
  }

  function cleanRing(pts) {
    const d = dedupe(pts);
    if (d.length < 3) return null;
    if (Math.abs(signedArea(d)) < 0.25) return null;
    return d;
  }

  function segmentIntersect(a, b, c, d) {
    const rpx = b.x - a.x;
    const rpy = b.y - a.y;
    const spx = d.x - c.x;
    const spy = d.y - c.y;
    const den = rpx * spy - rpy * spx;
    if (Math.abs(den) < 1e-12) return null;
    const t = ((c.x - a.x) * spy - (c.y - a.y) * spx) / den;
    const u = ((c.x - a.x) * rpy - (c.y - a.y) * rpx) / den;
    const eps = 1e-8;
    if (t > eps && t < 1 - eps && u > eps && u < 1 - eps) {
      return { x: a.x + t * rpx, y: a.y + t * rpy, t, u };
    }
    return null;
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
    return { minX, minY, maxX, maxY };
  }

  function bboxOverlap(a, b) {
    const ba = bounds(a);
    const bb = bounds(b);
    return !(ba.maxX < bb.minX - 1e-6 || bb.maxX < ba.minX - 1e-6 || ba.maxY < bb.minY - 1e-6 || bb.maxY < ba.minY - 1e-6);
  }

  function keyOf(p) {
    return Math.round(p.x * 1000) + "," + Math.round(p.y * 1000);
  }

  function edgeKey(a, b) {
    return keyOf(a) + ">" + keyOf(b);
  }

  function relation(x, y, poly) {
    if (onBoundary(x, y, poly)) return "on";
    return pointInPoly(x, y, poly) ? "in" : "out";
  }

  function splitPoly(poly, other) {
    const edges = [];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      const cuts = [{ t: 0, x: a.x, y: a.y }];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const len2 = abx * abx + aby * aby;
      for (let j = 0; j < other.length; j++) {
        const c = other[j];
        const d = other[(j + 1) % other.length];
        const hit = segmentIntersect(a, b, c, d);
        if (hit) cuts.push({ t: hit.t, x: hit.x, y: hit.y });
        if (len2 < 1e-18) continue;
        const t = ((c.x - a.x) * abx + (c.y - a.y) * aby) / len2;
        if (t <= 1e-8 || t >= 1 - 1e-8) continue;
        const x = a.x + t * abx;
        const y = a.y + t * aby;
        if (Math.hypot(x - c.x, y - c.y) <= 1e-4) cuts.push({ t: t, x: c.x, y: c.y });
      }
      cuts.sort((p, q) => p.t - q.t);
      const uniq = [];
      for (const cut of cuts) {
        const prev = uniq[uniq.length - 1];
        if (prev && Math.abs(prev.t - cut.t) < 1e-8) continue;
        uniq.push(cut);
      }
      if (!uniq.length || uniq[uniq.length - 1].t < 1 - 1e-8) uniq.push({ t: 1, x: b.x, y: b.y });
      for (let k = 0; k < uniq.length - 1; k++) {
        const p = uniq[k];
        const q = uniq[k + 1];
        if (Math.hypot(p.x - q.x, p.y - q.y) <= 1e-7) continue;
        edges.push({ a: { x: p.x, y: p.y }, b: { x: q.x, y: q.y } });
      }
    }
    return edges;
  }

  function hasEdge(edges, a, b) {
    const want = edgeKey(a, b);
    for (const e of edges) {
      if (edgeKey(e.a, e.b) === want) return true;
    }
    return false;
  }

  function dedupeEdges(edges) {
    const seen = new Set();
    const out = [];
    for (const e of edges) {
      const k = edgeKey(e.a, e.b);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
    return out;
  }

  function selectEdges(sEdges, cEdges, S, C, op) {
    const out = [];
    for (const e of sEdges) {
      const rel = relation((e.a.x + e.b.x) / 2, (e.a.y + e.b.y) / 2, C);
      if (op === "union" && rel === "out") out.push(e);
      else if (op === "union" && rel === "on" && !hasEdge(cEdges, e.b, e.a)) out.push(e);
      else if (op === "intersect" && rel === "in") out.push(e);
      else if (op === "intersect" && rel === "on" && hasEdge(cEdges, e.a, e.b)) out.push(e);
      else if (op === "subtract" && rel === "out") out.push(e);
      else if (op === "subtract" && rel === "on" && !hasEdge(cEdges, e.a, e.b)) out.push(e);
    }
    for (const e of cEdges) {
      const rel = relation((e.a.x + e.b.x) / 2, (e.a.y + e.b.y) / 2, S);
      if (op === "union" && rel === "out") out.push(e);
      else if (op === "union" && rel === "on" && !hasEdge(sEdges, e.b, e.a)) out.push(e);
      else if (op === "intersect" && rel === "in") out.push(e);
      else if (op === "intersect" && rel === "on" && hasEdge(sEdges, e.a, e.b)) out.push(e);
      else if (op === "subtract" && rel === "in") out.push({ a: e.b, b: e.a });
    }
    return dedupeEdges(out);
  }

  function stitch(edges) {
    const from = new Map();
    for (const e of edges) {
      const k = keyOf(e.a);
      if (!from.has(k)) from.set(k, []);
      from.get(k).push(e);
    }
    const used = new Set();
    const rings = [];
    for (const start of edges) {
      if (used.has(start)) continue;
      const ring = [];
      let cur = start;
      let guard = 0;
      while (cur && !used.has(cur) && guard++ < edges.length + 2) {
        used.add(cur);
        ring.push({ x: cur.a.x, y: cur.a.y });
        const nexts = (from.get(keyOf(cur.b)) || []).filter((e) => !used.has(e));
        if (!nexts.length) break;
        if (nexts.length === 1) {
          cur = nexts[0];
          continue;
        }
        const dx = cur.b.x - cur.a.x;
        const dy = cur.b.y - cur.a.y;
        let best = nexts[0];
        let bestAng = -1;
        for (const n of nexts) {
          const ex = n.b.x - n.a.x;
          const ey = n.b.y - n.a.y;
          let ang = Math.atan2(ex * dy - ey * dx, ex * dx + ey * dy);
          if (ang <= 1e-9) ang += Math.PI * 2;
          if (ang > bestAng) {
            bestAng = ang;
            best = n;
          }
        }
        cur = best;
      }
      const cleaned = cleanRing(ring);
      if (cleaned) rings.push(cleaned);
    }
    return rings;
  }

  /**
   * @param {{x:number,y:number}[]} subject
   * @param {{x:number,y:number}[]} clip
   * @param {"union"|"subtract"|"intersect"} op
   * @returns {{x:number,y:number}[][]}
   */
  function polygonBoolean(subject, clip, op) {
    let S = dedupe(subject);
    let C = dedupe(clip);
    if (S.length < 3 || C.length < 3) return [];
    if (signedArea(S) < 0) S = S.slice().reverse();
    if (signedArea(C) < 0) C = C.slice().reverse();
    if (!bboxOverlap(S, C)) {
      if (op === "intersect") return [];
      if (op === "union") return [S, C];
      return [S];
    }
    const sEdges = splitPoly(S, C);
    const cEdges = splitPoly(C, S);
    return stitch(selectEdges(sEdges, cEdges, S, C, op)).map(dropCollinear).map(cleanRing).filter(Boolean);
  }

  function cubicPoint(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    return {
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    };
  }

  function sampleCubic(p0, p1, p2, p3, steps) {
    const pts = [];
    for (let i = 1; i <= steps; i++) pts.push(cubicPoint(p0, p1, p2, p3, i / steps));
    return pts;
  }

  function ellipsePoints(cx, cy, rx, ry, steps) {
    const n = steps || 48;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
    }
    return pts;
  }

  root.FolioGeom = {
    polygonBoolean,
    signedArea,
    pointInPoly,
    sampleCubic,
    ellipsePoints,
    dedupe,
    cleanRing,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
