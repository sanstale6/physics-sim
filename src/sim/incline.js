// 斜面几何：真题里的直角三角形（竖直直角边在左，斜边为滑动面，θ 在右下角）
// 约定：o.x / o.y 是斜边中点，物理刚体是沿斜边放置的旋转厚板，中心与之重合。
const DEG = Math.PI / 180

export function inclineGeom(o) {
  const p = o.props || {}
  const a = (p.angle ?? 30) * DEG
  const L = p.len ?? 320
  const hx = (L / 2) * Math.cos(a)
  const hy = (L / 2) * Math.sin(a)
  const apex = { x: o.x - hx, y: o.y - hy }    // 顶点（左上）
  const baseL = { x: o.x - hx, y: o.y + hy }   // 左下（直角）
  const baseR = { x: o.x + hx, y: o.y + hy }   // 右下（θ 角）
  return { a, L, apex, baseL, baseR, hyp: [apex, baseR] }
}

// 三角形容差命中
export function inTriangle(x, y, g, slop = 0) {
  const { apex: A, baseL: B, baseR: C } = g
  const s = (p, q, r) => (p.x - r.x) * (q.y - r.y) - (q.x - r.x) * (p.y - r.y)
  const P = { x, y }
  const d1 = s(P, A, B), d2 = s(P, B, C), d3 = s(P, C, A)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  if (!(hasNeg && hasPos)) return true
  if (slop <= 0) return false
  return segDist(x, y, A, B) <= slop || segDist(x, y, B, C) <= slop || segDist(x, y, C, A) <= slop
}

function segDist(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const L2 = dx * dx + dy * dy || 1
  let t = ((px - a.x) * dx + (py - a.y) * dy) / L2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t))
}

// 物体是否贴在斜面表面：返回 { inc, a, geom } 或 null
// 判据：刚体顶点在斜边平面法向上的投影必须「跨越」平面（允许少量嵌入），
// 且圆心投影落在斜边线段范围内 —— 这样斜边以外、三角形内部都不会误判。
export function contactIncline(o, objs) {
  if (!o.body) return null
  const b = o.body
  const p = b.position
  for (const inc of objs) {
    if (inc.type !== 'incline') continue
    const g = inclineGeom(inc)
    const [p0, p1] = g.hyp
    const dx = p1.x - p0.x, dy = p1.y - p0.y
    const L2 = dx * dx + dy * dy || 1
    const tRaw = ((p.x - p0.x) * dx + (p.y - p0.y) * dy) / L2
    if (tRaw < -0.02 || tRaw > 1.02) continue          // 只认斜边正上方
    const t = Math.max(0, Math.min(1, tRaw))
    const q = { x: p0.x + dx * t, y: p0.y + dy * t }
    const nx = Math.sin(g.a), ny = -Math.cos(g.a)     // 斜面外法线（朝左上）
    const vs = b.vertices || []
    let sMin = Infinity, sMax = -Infinity
    for (const v of vs) {
      const s = (v.x - q.x) * nx + (v.y - q.y) * ny
      if (s < sMin) sMin = s
      if (s > sMax) sMax = s
    }
    if (!vs.length) {
      const s = (p.x - q.x) * nx + (p.y - q.y) * ny
      sMin = sMax = s
    }
    if (sMin > 10) continue                            // 整体悬在面上方
    if (sMax < -10) continue                           // 整体在面下方（三角形内部/地面）
    if (Math.hypot(p.x - q.x, p.y - q.y) > 120) continue
    return { inc, a: g.a, geom: g }
  }
  return null
}
