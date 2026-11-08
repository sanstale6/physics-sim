import Matter from 'matter-js'
import { pins, CIRCUIT_TYPES } from './circuit.js'
import { inclineGeom, inTriangle } from './incline.js'

// 屏幕坐标下的命中测试：带容差（手指比鼠标粗），从后往前（后放的在上层）
export function hitTest(objs, x, y, slop = 6) {
  for (let i = objs.length - 1; i >= 0; i--) {
    if (hitObject(objs[i], x, y, slop, objs)) return objs[i]
  }
  return null
}

// 命中全部元件（放置顺序，后放的在末尾）
export function hitTestAll(objs, x, y, slop = 6) {
  const out = []
  for (let i = 0; i < objs.length; i++) {
    if (hitObject(objs[i], x, y, slop, objs)) out.push(objs[i])
  }
  return out
}

export function hitObject(o, x, y, slop = 6, objs = []) {
  const p = o.props || {}
  if (o.type === 'incline') {
    const g = inclineGeom(o)
    return inTriangle(x, y, g, slop) || distToSeg(x, y, g.hyp[0], g.hyp[1]) <= slop
  }
  if (o.body) {
    const b = o.body
    if (b.circleRadius) return Math.hypot(x - b.position.x, y - b.position.y) <= b.circleRadius + slop
    const bd = b.bounds
    if (x < bd.min.x - slop || x > bd.max.x + slop || y < bd.min.y - slop || y > bd.max.y + slop) return false
    if (Matter.Vertices.contains(b.vertices, { x, y })) return true
    return distToPoly(b.vertices, x, y) <= slop
  }
  if (CIRCUIT_TYPES.includes(o.type)) {
    const [a, b] = pins(o)
    return distToSeg(x, y, a, b) <= 10 + slop
  }
  if (p.len && (o.type === 'mirror' || o.type === 'lens' || o.type === 'screen')) {
    const ang = ((p.angle ?? 0) * Math.PI) / 180, L = p.len / 2
    return distToSeg(x, y,
      { x: o.x - Math.cos(ang) * L, y: o.y - Math.sin(ang) * L },
      { x: o.x + Math.cos(ang) * L, y: o.y + Math.sin(ang) * L }) <= 8 + slop
  }
  if (p.w && p.h) return Math.abs(x - o.x) <= p.w / 2 + slop && Math.abs(y - o.y) <= p.h / 2 + slop
  if (o.type === 'spring' || o.type === 'rope' || o.type === 'pulley') {
    const ends = pairEnds(o, objs)
    if (ends) {
      const [a, b] = ends
      if (distToSeg(x, y, a.body.position, b.body.position) <= 12 + slop) return true
      if (o.type === 'pulley' && Math.hypot(x - o.x, y - o.y) <= (p.r ?? 22) + slop) return true
    }
    if (o.type === 'pulley') return Math.hypot(x - o.x, y - o.y) <= (p.r ?? 22) + slop
  }
  return Math.hypot(x - o.x, y - o.y) <= 24 + slop
}

export function pairEnds(c, components) {
  const dyn = components.filter(o => o.body && !o.body.isStatic)
  if (dyn.length < 2) return null
  const sorted = dyn.slice().sort((a, b) =>
    Math.hypot(a.body.position.x - c.x, a.body.position.y - c.y) -
    Math.hypot(b.body.position.x - c.x, b.body.position.y - c.y))
  return [sorted[0], sorted[1]]
}

export function distToSeg(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const L2 = dx * dx + dy * dy || 1
  let t = ((px - a.x) * dx + (py - a.y) * dy) / L2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t))
}

function distToPoly(vs, x, y) {
  let best = Infinity
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i], b = vs[(i + 1) % vs.length]
    best = Math.min(best, distToSeg(x, y, a, b))
  }
  return best
}
