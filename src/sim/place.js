// 放置辅助：把物块/小球吸附到斜面上（真题里物体总是贴着斜面）
import { registry } from './registry.js'
import { inclineGeom } from './incline.js'

const ROUND = new Set(['ball', 'particle', 'charge'])

// 返回 { x, y, angle }：物体中心沿斜面法线抬高自身半高，角度对齐斜面
export function snapToIncline(type, x, y, objs) {
  const reg = registry[type]
  if (!reg) return null
  const p = reg.defaults()
  let half
  if (type === 'block') half = (p.h ?? 30) / 2
  else if (ROUND.has(type)) half = p.r ?? 12
  else return null

  let best = null
  for (const o of objs) {
    if (o.type !== 'incline') continue
    const g = inclineGeom(o)
    const [p0, p1] = g.hyp
    const dx = p1.x - p0.x, dy = p1.y - p0.y
    const L2 = dx * dx + dy * dy || 1
    const t = ((x - p0.x) * dx + (y - p0.y) * dy) / L2
    if (t < 0.02 || t > 0.98) continue
    const q = { x: p0.x + dx * t, y: p0.y + dy * t }
    const nx = Math.sin(g.a), ny = -Math.cos(g.a)   // 斜边外法线（朝上）
    const s = (x - q.x) * nx + (y - q.y) * ny
    const d = Math.hypot(x - q.x, y - q.y)
    if (s < 0 || s > 100 || d > 100) continue        // 只吸附斜边正上方
    if (!best || d < best.d) best = { d, q, nx, ny, a: g.a }
  }
  if (!best) return null
  return {
    x: best.q.x + best.nx * (half + 1),
    y: best.q.y + best.ny * (half + 1),
    angle: best.a,
  }
}
