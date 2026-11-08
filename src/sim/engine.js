import Matter from 'matter-js'
import { registry } from './registry.js'
import { frictionForce } from './contacts.js'

// —— 单位约定 ——
// 100 px = 1 m；质量用 kg；力用 N；Matter 每步 16.67 ms
export const SCALE = 100
export const G = 9.8
export const FORCE_SCALE = 1e-4   // N → matter 力（配合 mass=kg、step=16.67ms，a=F/m 精确成立）
export const VEL_SCALE = 0.6      // matter 速度 px/step → m/s

// matter 的重力：force = mass · gravity.y · gravity.scale，每个 body 都吃，没有 gravityScale 开关
export const GRAV = { y: G / 10, scale: 0.001 }
// 重力开关（失重演示用）；关掉时带电体也不必再抵消重力
export const gravityState = { on: true }

// —— 平行板电容（教学缩放）——
// 真实 C = ε0·S/d 极小（pF 级），单电荷附着后 U 巨大。教学模型：
// C 正比于板长×间距（几何），单电荷 q=1 附着后 U 约 2V 量级，多个电荷线性累积
export const CAP_U_SCALE = 2
export function capacitance(p) {
  const L = (p.len ?? 200) / SCALE   // m
  const d = (p.gap ?? 100) / SCALE   // m
  return Math.max(L * d, 0.05)       // F（缩放后），避免除零
}

export function createWorld() {
  const e = Matter.Engine.create()
  e.gravity.y = GRAV.y            // 0.98 × scale 0.001 → a = 9.8 px 换算法下正好 9.8 m/s²
  e.gravity.scale = GRAV.scale
  e.enableSleeping = false
  e.positionIterations = 8
  e.velocityIterations = 6
  return e
}

import { enforceConstraints } from './constraints.js'

export function applyForces(components) {
  // 弹簧/绳/滑轮等元件的约束力
  for (const c of components) {
    if (registry[c.type]?.force) registry[c.type].force(c, components)
  }
  const forces = components.filter(c => c.type === 'constantForce')
  const charges = components.filter(c => c.body && (c.props.q ?? (c.type === 'charge' ? 1 : 0)) !== 0)
  const fields = components.filter(c => c.type === 'uniformB' || c.type === 'uniformE')

  // 恒力：作用在最近的物块/小球上（超出 260px 视为未连接）
  for (const f of forces) {
    const t = nearestTarget(f, components)
    f._target = t ? t.id : null
    if (t) Matter.Body.applyForce(t.body, t.body.position, { x: f.props.fx * FORCE_SCALE, y: -f.props.fy * FORCE_SCALE })
  }

  // 库仑力：F = k q1 q2 / r²（q 用 μC，r 用 m）
  // 教学单位：电荷量 q 无物理单位（面板里写 μC 只是符号），库仑常量取 1，
  // 使 q=1 相距 1m 时约 1N —— 真实 9e9 会让 1μC 的力大到看不到运动
  const K = 1, uC = 1
  for (let i = 0; i < charges.length; i++)
    for (let j = i + 1; j < charges.length; j++) {
      const a = charges[i].body, b = charges[j].body
      const dx = b.position.x - a.position.x, dy = b.position.y - a.position.y
      const rPx = Math.max(Math.hypot(dx, dy), 20)
      const r = rPx / SCALE
      const F = K * charges[i].props.q * uC * charges[j].props.q * uC / (r * r) // N
      const Fm = F * FORCE_SCALE
      const ux = dx / rPx, uy = dy / rPx
      Matter.Body.applyForce(a, a.position, { x: -Fm * ux, y: Fm * uy })
      Matter.Body.applyForce(b, b.position, { x: Fm * ux, y: -Fm * uy })
    }

  // 场区域内的电荷
  // 磁场：洛伦兹力只改变速度方向。若用「每步加力」的半隐式欧拉，  // 圆运动会一步步变大（能量漂移），所以直接按 ω = qB/m 精确旋转速度矢量。
  // 电场：F = qE，仍按力施加。
  const inside = (body, f) => {
    // 「无限大」场（宽或高 ≥3200）：物理上按 9600×7200 巨区处理，覆盖整个可视世界
    const w = f.props.w >= 3200 ? 9600 : f.props.w
    const h = f.props.h >= 3200 ? 7200 : f.props.h
    return Math.abs(body.position.x - f.x) <= w / 2 && Math.abs(body.position.y - f.y) <= h / 2
  }

  for (const c of charges) {
    const body = c.body
    const m = body.mass || 1
    // —— 电场加速度收集（跳蛙法第一步 kick）：uniformE + 平行极板 ——
    let eax = 0, eay = 0
    for (const f of fields) {
      if (f.type !== 'uniformE' || !inside(body, f)) continue
      const p = f.props
      const q = c.props.q * uC
      // F = qE，物理 y 向上 → 屏幕 y 取反 → 屏幕加速度 (q·ex/m, −q·ey/m)
      eax += (q * p.ex) / m
      eay += (-q * p.ey) / m
    }
    for (const f of components) {
      if (f.type !== 'plates') continue
      const p = f.props
      const qq = c.props.q * uC
      const a = ((p.angle ?? 0) * Math.PI) / 180
      const nx = -Math.sin(a), ny = Math.cos(a)   // 板法线（屏幕坐标）
      const dx = body.position.x - f.x, dy = body.position.y - f.y
      const sAlong = dx * Math.cos(a) + dy * Math.sin(a)
      const sN = dx * nx + dy * ny
      const halfL = (p.len ?? 200) / 2, halfG = (p.gap ?? 100) / 2
      // —— 电容模型：电荷碰到板面（法向距 ≤14px、在板长内）→ 附着并给板充电 ——
      if (!body._attached && Math.abs(sAlong) <= halfL && Math.abs(Math.abs(sN) - halfG) <= 14) {
        const side = sN > 0 ? 1 : -1               // +1 碰法线正侧板，-1 碰负侧板
        p._Q = (p._Q ?? 0) + side * qq             // 正侧板积累 +Q，负侧板 −Q
        p.U = (p._Q ?? 0) / capacitance(p) * CAP_U_SCALE   // U = Q/C 缩放到可视量级
        body._attached = f.id
        Matter.Body.setVelocity(body, { x: 0, y: 0 })
        Matter.Body.setPosition(body, {
          x: f.x + Math.cos(a) * sAlong + nx * (side * (halfG - 6)),
          y: f.y + Math.sin(a) * sAlong + ny * (side * (halfG - 6)),
        })
        Matter.Body.setStatic(body, true)   // 附着后钉在板上，不再参与运动
        continue
      }
      if (body._attached === f.id) continue        // 已附着：不再受力
      if (Math.abs(sAlong) > halfL || Math.abs(sN) > halfG) continue
      const E = (p.U ?? 0) / ((p.gap ?? 100) / SCALE)   // N/C
      // U>0 → 法线正侧板为正 → 场指向负板（−n）
      eax += (-qq * E * nx) / m
      eay += (qq * E * ny) / m
    }
    if (eax || eay) {
      const hdt = (1 / 60) / 2
      Matter.Body.setVelocity(body, {
        x: body.velocity.x + (eax / VEL_SCALE) * hdt,
        y: body.velocity.y + (eay / VEL_SCALE) * hdt,
      })
      body._eKick = { ax: eax, ay: eay }
    }
    let vx = body.velocity.x * VEL_SCALE    // m/s，屏幕 x
    let vy = body.velocity.y * VEL_SCALE    // m/s，屏幕 y（向下为正）
    let rotated = false
    for (const f of fields) {
      if (f.type !== 'uniformB' || !inside(body, f)) continue
      const w = (c.props.q * f.props.bz) / m            // rad/s
      const phi = w / 60                                // 每步 1/60 s
      const cs = Math.cos(phi), sn = Math.sin(phi)
      const nx = vx * cs - vy * sn
      const ny = vx * sn + vy * cs
      vx = nx; vy = ny; rotated = true
    }
    if (rotated) {
      Matter.Body.setVelocity(body, { x: vx / VEL_SCALE, y: vy / VEL_SCALE })
      // 大转角下直线位移落在弦中点（比弧中点更靠内），径向外推补偿 R(1−cos(φ/2))
      const vpx = Math.hypot(body.velocity.x, body.velocity.y)
      let phiSum = 0
      for (const f of fields) {
        if (f.type !== 'uniformB' || !inside(body, f)) continue
        phiSum += (c.props.q * f.props.bz) / m / 60
      }
      if (vpx > 0.01 && Math.abs(phiSum) > 1e-6) {
        const R = vpx / Math.abs(phiSum)
        const half = Math.abs(phiSum) / 2
        const push = R * (1 - Math.cos(half))
        const sgn = Math.sign(phiSum)
        const uxv = body.velocity.x / vpx, uyv = body.velocity.y / vpx
        const cx = body.position.x - uyv * sgn * R
        const cy = body.position.y + uxv * sgn * R
        const dx = body.position.x - cx, dy = body.position.y - cy
        const dl = Math.hypot(dx, dy) || 1
        Matter.Body.setPosition(body, { x: body.position.x + dx / dl * push, y: body.position.y + dy / dl * push }, false)
      }
    }
    // 电场第二次半步 kick（跳蛙法收尾；第一步 kick 在本轮 charges 循环前段已做）
    if (body._eKick) {
      const { ax, ay } = body._eKick
      delete body._eKick
      Matter.Body.setVelocity(body, {
        x: body.velocity.x + (ax / VEL_SCALE) * (1 / 120),
        y: body.velocity.y + (ay / VEL_SCALE) * (1 / 120),
      })
    }
    // 回旋加速器：圆形区域按 ω=qB/m 精确旋转；水平中缝内（|dy|<gap/2）受电场沿 x 加速
    // （简化教学模型：缝内电场方向按粒子来向翻转，模拟高频电源反向，保证每次穿缝都被加速）
    for (const cy of components) {
      if (cy.type !== 'cyclotron') continue
      const R = cy.props.R ?? 160, gap = 14, B = cy.props.B ?? 0.5, U = cy.props.U ?? 5
      const dx = body.position.x - cy.x, dy = body.position.y - cy.y
      if (Math.abs(dx) >= R || Math.abs(dy) >= R + gap) continue
      const q = c.props.q * uC
      // 整个圆形区域有磁场 → 精确旋转
      const w = (q * B) / m, phi = w / 60
      const vxs = body.velocity.x * VEL_SCALE, vys = body.velocity.y * VEL_SCALE
      const cs = Math.cos(phi), sn = Math.sin(phi)
      Matter.Body.setVelocity(body, {
        x: (vxs * cs - vys * sn) / VEL_SCALE,
        y: (vxs * sn + vys * cs) / VEL_SCALE,
      })
      // 缝内：加速电场与回旋同步交变，粒子每次穿缝都沿当前速度方向被加速（能量每穿一次 +qU）
      if (Math.abs(dy) < gap / 2 && Math.abs(dx) < R) {
        const vxs2 = body.velocity.x * VEL_SCALE, vys2 = body.velocity.y * VEL_SCALE
        const sp2 = Math.hypot(vxs2, vys2)
        if (sp2 > 1e-6) {
          const dv = ((q * U / 2) / m) * (1 / 60) * 2   // U/2 每盒，缝内 dt=1/60，×2 补偿短驻留
          Matter.Body.setVelocity(body, {
            x: body.velocity.x + (vxs2 / sp2 * dv) / VEL_SCALE,
            y: body.velocity.y + (vys2 / sp2 * dv) / VEL_SCALE,
          })
        }
      }
    }
    // 点电荷不计重力（高中题设定）；带电物块/小球正常受重力
    if (c.type === 'charge') {
      const gw = gravityState.on ? body.mass * GRAV.y * GRAV.scale : 0
      if (gw) Matter.Body.applyForce(body, body.position, { x: 0, y: -gw })
    }
  }  // 条形磁铁：对带电运动电荷的简化演示力——F ∝ s·q·v/r²，方向为速度旋转 90°（N 极逆时针/S 极顺时针）
  for (const mg of components) {
    if (mg.type !== 'magnet') continue
    const len = mg.props.len ?? 120, a = ((mg.props.angle ?? 0) * Math.PI) / 180
    const ux = Math.cos(a), uy = Math.sin(a)
    const poles = [
      { x: mg.x + ux * len / 2, y: mg.y + uy * len / 2, s: 1 },
      { x: mg.x - ux * len / 2, y: mg.y - uy * len / 2, s: -1 },
    ]
    for (const c of charges) {
      const q = c.props.q ?? (c.type === 'charge' ? 1 : 0)
      if (!q) continue
      const body = c.body
      const vx = body.velocity.x, vy = body.velocity.y
      const v = Math.hypot(vx, vy)
      if (v < 0.01) continue
      let fx = 0, fy = 0
      for (const pole of poles) {
        const dx = body.position.x - pole.x, dy = body.position.y - pole.y
        const d2 = Math.max(dx * dx + dy * dy, 400)
        const F = (mg.props.strength ?? 5) * pole.s * q * v / d2   // 旋向力：N 逆时针、S 顺时针（屏幕坐标）
        fx += -vy / v * F
        fy += vx / v * F
      }
      Matter.Body.applyForce(body, body.position, { x: fx * FORCE_SCALE, y: fy * FORCE_SCALE })
    }
  }

  // 自定义摩擦放在最后：此时 body.force 已包含本步重力之外的各外力，
  // 便于判断静摩擦是否足以顶住（μN 不足则转为滑动）。
  for (const c of components) {
    if (c.body && !c.body.isStatic && (c.type === 'block' || c.type === 'ball' || c.type === 'particle')) {
      const f = frictionForce(c, components)
      if (f && (f.x || f.y)) Matter.Body.applyForce(c.body, c.body.position, { x: f.x * FORCE_SCALE, y: f.y * FORCE_SCALE })
    }
  }
}

export function nearestTarget(f, components) {
  let best = null, bestDist = 260
  for (const c of components) {
    if (!c.body || c.body.isStatic || !['block', 'ball', 'particle', 'charge'].includes(c.type)) continue
    const d = Math.hypot(c.body.position.x - f.x, c.body.position.y - f.y)
    if (d < bestDist) { bestDist = d; best = c }
  }
  return best
}

// 每步 Matter.Engine.update 之后调用：轻绳/滑轮等硬约束的位置投影
export function postStep(components) {
  enforceConstraints(components)
}
