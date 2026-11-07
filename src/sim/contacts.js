// 接触检测与自定义摩擦（绕开 matter 静摩擦在斜面上锁死的缺陷）
import { contactIncline } from './incline.js'

const G = 9.8
const FORCE_SCALE = 1e-4
const VT_EPS = 0.02      // px/step，小于它视作静止
const VEL = 0.6          // px/step → m/s

export { contactIncline }

// 水平支撑面：地面 / 桌面·轨道（任意静态矩形）
const SURFACES = new Set(['ground', 'track', 'conveyor'])

export function supportUnder(o, objs) {
  if (!o.body) return null
  const bd = o.body.bounds
  for (const s of objs) {
    if (!SURFACES.has(s.type)) continue
    const b = s.body?.bounds
    const top = b ? b.min.y : s.y - 10
    const l = b ? b.min.x : s.x - 200
    const r = b ? b.max.x : s.x + 200
    if (bd.max.x < l - 2 || bd.min.x > r + 2) continue     // 横向没踩到
    if (bd.max.y >= top - 12 && bd.max.y <= top + 18) return { top, surf: s }
  }
  return null
}

export function touchingGround(o, objs) {
  return !!supportUnder(o, objs)
}

// 本步已施加在物体上的外力（牛顿）。Matter 每步结束会清空 body.force，
// 所以这里读到的是「重力之外、我们刚加的那些力」，用来判断静摩擦能否顶住。
function appliedN(o) {
  const f = o.body.force
  return { x: f.x / FORCE_SCALE, y: f.y / FORCE_SCALE }
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// 返回施加到物体的力（物理单位 N），由 engine 统一乘 FORCE_SCALE
export function frictionForce(o, objs) {
  const mu = o.props.mu ?? 0
  if (!(mu > 0) || !o.body || o.body.isStatic) return null
  const m = o.props.m ?? 1
  const v = o.body.velocity
  const ap = appliedN(o)
  const f = { x: 0, y: 0 }

  const c = contactIncline(o, objs)
  if (c) {
    const a = c.a
    const N = m * G * Math.cos(a)
    const d = { x: Math.cos(a), y: Math.sin(a) }        // 沿斜面向下
    const vt = v.x * d.x + v.y * d.y
    const maxF = mu * N
    const drive = m * G * Math.sin(a) + ap.x * d.x + ap.y * d.y  // 切向驱动力（正=向下）
    if (Math.abs(vt) > VT_EPS) {
      f.x = -d.x * maxF * Math.sign(vt)
      f.y = -d.y * maxF * Math.sign(vt)
    } else {
      const need = -drive                              // 顶住所需
      const mag = clamp(need, -maxF, maxF)
      f.x = d.x * mag
      f.y = d.y * mag
    }
    return f
  }

  const sup = supportUnder(o, objs)
  if (sup) {
    const N = m * G
    const maxF = mu * N
    // 传送带：摩擦方向取「相对皮带」的速度，物块最终被带到带速
    const belt = sup.surf.type === 'conveyor' ? (sup.surf.props.v ?? 0) : 0
    const vrel = v.x * VEL - belt          // m/s，正 = 物块比皮带快
    const drive = ap.x
    if (Math.abs(vrel) > 0.02) f.x = -maxF * Math.sign(vrel)
    else f.x = clamp(-drive, -maxF, maxF)
    return f
  }
  return null
}
