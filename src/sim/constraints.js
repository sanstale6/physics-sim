import Matter from 'matter-js'
import { pairEnds } from './hit.js'

// 轻绳 / 定滑轮：按「不可伸长」的硬约束处理（位置投影 + 去掉分离速度），
// 比弹簧模型稳定，也更贴近真题里「轻绳、绳长不变」的假设。
function invMass(o) {
  return o.body && !o.body.isStatic ? 1 / o.body.mass : 0
}
function shift(o, dx, dy) {
  const p = o.body.position
  Matter.Body.setPosition(o.body, { x: p.x + dx, y: p.y + dy }, false)
}
function setVel(o, x, y) { Matter.Body.setVelocity(o.body, { x, y }) }

function rope(c, objs) {
  const ends = pairEnds(c, objs); if (!ends) return
  const [a, b] = ends
  const pa = a.body.position, pb = b.body.position
  const dx = pb.x - pa.x, dy = pb.y - pa.y
  const d = Math.hypot(dx, dy)
  const L = c.props.len ?? 150
  if (d <= L + 1e-6 || d < 1e-6) return
  const ux = dx / d, uy = dy / d
  const ia = invMass(a), ib = invMass(b), M = ia + ib
  if (M <= 0) return
  const over = d - L
  shift(a, ux * over * ia / M, uy * over * ia / M)
  shift(b, -ux * over * ib / M, -uy * over * ib / M)
  const va = a.body.velocity, vb = b.body.velocity
  const vrel = (vb.x - va.x) * ux + (vb.y - va.y) * uy   // 正 = 正在分离
  if (vrel > 0) {
    const dv = vrel / M
    setVel(a, va.x + ux * dv * ia, va.y + uy * dv * ia)
    setVel(b, vb.x - ux * dv * ib, vb.y - uy * dv * ib)
  }
}

function pulley(c, objs) {
  const ends = pairEnds(c, objs); if (!ends) return
  const [a, b] = ends
  const L = c.props.len ?? 320
  const da = Math.hypot(a.body.position.x - c.x, a.body.position.y - c.y)
  const db = Math.hypot(b.body.position.x - c.x, b.body.position.y - c.y)
  if (da < 1e-6 || db < 1e-6) return
  const over = da + db - L
  if (over <= 1e-6) return
  const ia = invMass(a), ib = invMass(b), M = ia + ib
  if (M <= 0) return
  const uax = (c.x - a.body.position.x) / da, uay = (c.y - a.body.position.y) / da
  const ubx = (c.x - b.body.position.x) / db, uby = (c.y - b.body.position.y) / db
  shift(a, uax * over * ia / M, uay * over * ia / M)
  shift(b, ubx * over * ib / M, uby * over * ib / M)
  const va = a.body.velocity, vb = b.body.velocity
  const out = -(va.x * uax + va.y * uay) - (vb.x * ubx + vb.y * uby)  // >0 表示绳在变长
  if (out > 0) {
    const dv = out / M
    setVel(a, va.x + uax * dv * ia, va.y + uay * dv * ia)
    setVel(b, vb.x + ubx * dv * ib, vb.y + uby * dv * ib)
  }
}

// 单摆：悬点固定，摆球与悬点距离恒为 len（轻绳不可伸长）
function pendulum(conn, objs) {
  const L = conn.props.len ?? 120
  let tgt = conn._target != null ? objs.find(o => o.id === conn._target) : null
  if (!tgt || !tgt.body || tgt.body.isStatic || !objs.includes(tgt)) {
    tgt = null
    let bd = Infinity
    for (const o of objs) {
      if (!o.body || o.body.isStatic) continue
      const d = Math.hypot(o.body.position.x - conn.x, o.body.position.y - conn.y)
      if (d < bd) { bd = d; tgt = o }
    }
    if (!tgt || bd > L * 3) return
    conn._target = tgt.id
  }
  const p = tgt.body.position
  let dx = p.x - conn.x, dy = p.y - conn.y
  let d = Math.hypot(dx, dy)
  if (d < 1e-6) { dx = 0; dy = L; d = L }
  const ux = dx / d, uy = dy / d
  if (Math.abs(d - L) > 0.01) shift(tgt, (L - d) * ux, (L - d) * uy)
  const v = tgt.body.velocity
  const vr = v.x * ux + v.y * uy
  if (Math.abs(vr) > 1e-6) setVel(tgt, v.x - vr * ux, v.y - vr * uy)
}

export function enforceConstraints(objs) {
  for (const c of objs) {
    if (c.type === 'rope') rope(c, objs)
    else if (c.type === 'pulley') pulley(c, objs)
    else if (c.type === 'pendulum') pendulum(c, objs)
  }
}
