import { contactIncline } from './incline.js'
import { supportUnder } from './contacts.js'

// 受力分析：对选中的动态刚体给出重力/支持力/摩擦力/外力/合力
// 约定：屏幕坐标 y 向下为正；重力矢量 = (0, +mg)
const G = 9.8
const LEN_PER_WEIGHT = 55 // 重力矢量固定 55px，其余按比例
const mag = (v) => Math.hypot(v.x, v.y)

export function analyzeForces(o, objs) {
  if (!o || !o.body || o.body.isStatic || o.props.m == null) return null
  const m = o.props.m, W = m * G
  const p = o.body.position
  const base = []
  base.push({ label: 'G', name: '重力', vec: { x: 0, y: W }, color: '#ff9f43', text: `mg=${W.toFixed(1)}N` })

  // 外力（恒力元件）
  const ext = []
  for (const c of objs) {
    if (c.type !== 'constantForce' || nearestBody(c, objs) !== o) continue
    ext.push({ label: 'F', name: '恒力', vec: { x: c.props.fx, y: -c.props.fy }, color: '#38bdf8', text: `F=${mag({ x: c.props.fx, y: c.props.fy }).toFixed(1)}N` })
  }

  const inc = contactIncline(o, objs)
  let friction = null, decompose = null
  if (inc) {
    const a = inc.a
    const N = W * Math.cos(a)
    const n = { x: Math.sin(a), y: -Math.cos(a) }   // 外法线（朝上）
    const d = { x: Math.cos(a), y: Math.sin(a) }    // 沿斜面向下
    base.push({ label: 'N', name: '支持力', vec: { x: n.x * N, y: n.y * N }, color: '#5ad1a5', text: `N=mg·cosθ=${N.toFixed(1)}N` })
    decompose = { a, along: W * Math.sin(a), perp: N,
      textAlong: `mg·sinθ=${(W * Math.sin(a)).toFixed(1)}N`, textPerp: `mg·cosθ=${N.toFixed(1)}N` }
    // 切向：重力沿斜面 + 外力切向
    const vt = o.body.velocity.x * d.x + o.body.velocity.y * d.y
    const T = W * Math.sin(a) + ext.reduce((s, v) => s + v.vec.x * d.x + v.vec.y * d.y, 0)
    const mu = o.props.mu ?? 0.2
    const f = Math.abs(vt) > 0.05 ? mu * N : Math.min(mu * N, Math.abs(T))
    const dir = Math.abs(vt) > 0.05 ? -Math.sign(vt) : -Math.sign(T)
    if (mu > 0 && f > 0.01) friction = { label: 'f', name: '摩擦力', vec: { x: d.x * f * dir, y: d.y * f * dir }, color: '#ff5f56', text: `fμ=${f.toFixed(1)}N` }
  } else if (supportUnder(o, objs)) {
    base.push({ label: 'N', name: '支持力', vec: { x: 0, y: -W }, color: '#5ad1a5', text: `N=mg=${W.toFixed(1)}N` })
    const mu = o.props.mu ?? 0
    const vx = o.body.velocity.x
    const T = ext.reduce((s, v) => s + v.vec.x, 0)
    const f = Math.abs(vx) > 0.05 ? mu * W : Math.min(mu * W, Math.abs(T))
    const dir = Math.abs(vx) > 0.05 ? -Math.sign(vx) : -Math.sign(T)
    if (mu > 0 && f > 0.01) friction = { label: 'f', name: '摩擦力', vec: { x: f * dir, y: 0 }, color: '#ff5f56', text: `fμ=${f.toFixed(1)}N` }
  }

  const list = [...base, ...ext]
  if (friction) list.push(friction)
  const net = list.reduce((s, v) => ({ x: s.x + v.vec.x, y: s.y + v.vec.y }), { x: 0, y: 0 })
  list.push({ label: 'F合', name: '合力', vec: net, color: '#f6e05e', text: `F合=${mag(net).toFixed(1)}N → a=${(mag(net) / m).toFixed(2)}m/s²`, isNet: true })

  list.decompose = decompose
  list.scale = LEN_PER_WEIGHT / W
  list.origin = { x: p.x, y: p.y }
  return list
}

function nearestBody(f, objs) {
  let best = null, bd = 1e9
  for (const c of objs) {
    if (!c.body || (c.type !== 'block' && c.type !== 'ball')) continue
    const d = Math.hypot(c.body.position.x - f.x, c.body.position.y - f.y)
    if (d < bd) { bd = d; best = c }
  }
  return best
}
