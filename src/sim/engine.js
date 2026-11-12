import Matter from 'matter-js'
import { registry } from './registry.js'
import { frictionForce } from './contacts.js'
import { solve } from './circuit.js'

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
// 电荷相互作用开关：关掉后只算外加场（匀强电场/磁场/极板）对电荷的作用，
// 用来演示「粒子在电场中偏转」时不希望同批电荷互相排斥干扰
export const coulombState = { on: true }

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
  // 一次性分类，避免在电荷主循环内反复全量遍历 components（N 电荷 × M 元件 的三重嵌套）
  const platesList = components.filter(c => c.type === 'plates')
  const staticBodies = components.filter(c => c.body && c.body.isStatic && c.type !== 'charge')
  const cyclotrons = components.filter(c => c.type === 'cyclotron')
  const magnets = components.filter(c => c.type === 'magnet')
  const rods = components.filter(c => c.type === 'metalRod' && c.body)
  const caps = components.filter(c => c.type === 'capacitor')

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
  if (coulombState.on) for (let i = 0; i < charges.length; i++)
    for (let j = i + 1; j < charges.length; j++) {
      const a = charges[i].body, b = charges[j].body
      const dx = b.position.x - a.position.x, dy = b.position.y - a.position.y
      // 距离截断：相距 > 8m（800px）时库仑力 < k·q²/64 ≈ 0.016N（对 m=0.5kg 的电荷
      // 加速度 < 0.03 m/s²），教学精度下可忽略。用矩形（Chebyshev）快速判断跳过 hypot。
      if (Math.abs(dx) > 800 || Math.abs(dy) > 800) continue
      const rPx = Math.max(Math.hypot(dx, dy), 20)
      const r = rPx / SCALE
      const F = K * charges[i].props.q * uC * charges[j].props.q * uC / (r * r) // N
      const Fm = F * FORCE_SCALE
      const ux = dx / rPx, uy = dy / rPx
      Matter.Body.applyForce(a, a.position, { x: -Fm * ux, y: -Fm * uy })
      Matter.Body.applyForce(b, b.position, { x: Fm * ux, y: Fm * uy })
    }

  // 失重物体（g=0）：matter 没有 body.gravityScale 开关，全局重力会施加到每个非静态体。
  // 靠施加「大小相等、方向相反」的反向力抵消，使行星只剩引力提供向心力（太空环境演示）。
  for (const c of components) {
    if (!c.body || c.body.isStatic || c.props.g !== 0) continue
    const gw = gravityState.on ? c.body.mass * GRAV.y * GRAV.scale : 0
    if (gw) Matter.Body.applyForce(c.body, c.body.position, { x: 0, y: -gw })
  }

  // 万有引力：F = G·M·m / r²，指向引力源（恒星/大质量天体）。
  // 教学缩放：G·M 默认 120，使 r=300px(3m) 圆轨道周期 2πr/√(GM/r) = 2π×3/√40 ≈ 2.98s，适合课堂观察。
  const gravs = components.filter(c => c.type === 'gravity')
  for (const g of gravs) {
    const GM = (g.props.G ?? 1) * (g.props.M ?? 120)   // N·m²/kg（教学值）
    for (const c of components) {
      if (c === g || !c.body || c.body.isStatic || c.type === 'gravity') continue
      const m = c.props.m ?? 0
      if (m <= 0) continue
      const dx = g.x - c.body.position.x, dy = g.y - c.body.position.y
      const rPx = Math.max(Math.hypot(dx, dy), 20)      // 软化：避免 r→0 时力爆炸
      const r = rPx / SCALE
      const F = GM * m / (r * r)                        // N
      const Fm = F * FORCE_SCALE
      const ux = dx / rPx, uy = dy / rPx
      Matter.Body.applyForce(c.body, c.body.position, { x: Fm * ux, y: Fm * uy })
    }
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
    for (const f of platesList) {
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
      // E+B 叠加时（速度选择器/质谱仪）kick 统一延后到 B 旋转之后一次完成：
      // v ← R(v) + R(a·Δt)?? 否——kick 不共转：v ← R(v) + a·Δt 的固定点模长恒定且无横向漂移。
      // 跳蛙两半步会被旋转劈开造成 E×B 漂移相位残差（实测质谱仪圆轨迹膨胀 34px）。
      // 纯 E 场（无 B）时顺序无所谓，等价恒力积分。
      body._eKick = { ax: eax, ay: eay }
    }
    let vx = body.velocity.x * VEL_SCALE    // m/s，屏幕 x
    let vy = body.velocity.y * VEL_SCALE    // m/s，屏幕 y（向下为正）
    const vx0 = vx, vy0 = vy               // 本步旋转前速度快照（解析圆心用）
    let rotated = false, phiSum = 0
    for (const f of fields) {
      if (f.type !== 'uniformB' || !inside(body, f)) continue
      const w = (c.props.q * f.props.bz) / m            // rad/s
      const phi = w / 60                                // 每步 1/60 s
      const cs = Math.cos(phi), sn = Math.sin(phi)
      const nx = vx * cs - vy * sn
      const ny = vx * sn + vy * cs
      vx = nx; vy = ny; rotated = true; phiSum += phi
    }
    if (!rotated && body._eKick) {
      // 无 B：直接全步 kick（等价恒力积分）
      const { ax, ay } = body._eKick
      delete body._eKick
      Matter.Body.setVelocity(body, {
        x: body.velocity.x + (ax / VEL_SCALE) * (1 / 60),
        y: body.velocity.y + (ay / VEL_SCALE) * (1 / 60),
      })
    }
    if (rotated) {
      // 解析圆周 + 预补偿：位置 = 本步弧终点 − 新速度×Δt，Engine.update 走完 Δt 恰好落在弧终点。
      // 直线积分的弦步误差不再累积（每步都被拉回真圆）。
      const vpx0 = Math.hypot(vx, vy)
      Matter.Body.setVelocity(body, { x: vx / VEL_SCALE, y: vy / VEL_SCALE })
      if (vpx0 > 0.01 && Math.abs(phiSum) > 1e-6) {
        const R = (vpx0 / VEL_SCALE) / Math.abs(phiSum)   // px：matter 速度 ÷ 每步转角（原用 m/s 与 rad 混算，半径缩水 0.6 倍）
        const sgn = Math.sign(phiSum)
        // 圆心必须用「旋转前」速度推算：C = P + 右法向(v_old)·R，P 绕 C 转 φ 后
        // P−C 与转后速度仍垂直（切向关系保持，圆心逐帧不动）。用转后速度会形成收缩螺旋。
        const uxv = vx0 / vpx0, uyv = vy0 / vpx0        // 电场 kick：共转（E 加速度随 φ 旋转，E 在旋转系中恒定）。
        // 在圆心计算（用 v_old）之后、位置预补偿之前——kick 改变速度后预补偿用新速度，
        // Engine.update 位移恰好落在弧终点+kick 位移，无残余污染。
        if (body._eKick) {
          const { ax, ay } = body._eKick
          delete body._eKick
          const cs2 = Math.cos(phiSum), sn2 = Math.sin(phiSum)
          const kax = ax * cs2 - ay * sn2, kay = ax * sn2 + ay * cs2
          vx += (kax / VEL_SCALE) / 60; vy += (kay / VEL_SCALE) / 60
        }

        const cx = body.position.x - uyv * sgn * R
        const cy = body.position.y + uxv * sgn * R
        const cs = Math.cos(phiSum), sn = Math.sin(phiSum)
        const rx = body.position.x - cx, ry = body.position.y - cy
        const endX = cx + rx * cs - ry * sn, endY = cy + rx * sn + ry * cs
        // matter velocity 单位 = px/step。预补偿：把位置放到「终点 − 一步位移」，让 Engine.update
        // 的直线积分恰好落在弧终点；positionPrev 同步回退一步，Verlet 速度保持不变。
        //（调试钩子已移除）
        const vel = body.velocity
        Matter.Body.setPosition(body, { x: endX - vel.x, y: endY - vel.y }, false)
        body.positionPrev.x = body.position.x - vel.x
      }
    }
    // 感光屏/感光板钉住：带电粒子撞上静态板（track/block 等）后原地钉住（模拟感光屏记录位置），
    // 避免 matter solver 与解析圆周的 positionPrev 操控冲突产生 NaN
    for (const f of staticBodies) {
      const dx = Math.abs(body.position.x - f.body.position.x)
      const dy = Math.abs(body.position.y - f.body.position.y)
      const bw = (f.body.bounds.max.x - f.body.bounds.min.x) / 2 + c.props.r
      const bh = (f.body.bounds.max.y - f.body.bounds.min.y) / 2 + c.props.r
      if (dx < bw && dy < bh) {
        Matter.Body.setStatic(body, true)
        Matter.Body.setPosition(body, { x: body.position.x, y: body.position.y }, false)
        body._photographed = f.id
        break
      }
    }
    // 回旋加速器（极坐标驱动，教科书图景）：
    //  - 粒子在 D 形盒内做半径 r 的圆周运动，角速度 ω=qB/m（速率不变）
    //  - 每穿过一次水平缝隙（极角跨过 0 或 π）动能增加 qU → v'=√(v²+2qU/m)、r'=v'/ω
    //  - 圆心始终是加速器中心（真实机器圆心会缓慢漂移，教学图里要的是同心半圆）
    //  - r ≥ R 时离开磁场，沿当前速度直线飞出
    for (const cy of cyclotrons) {
      const R = cy.props.R ?? 160, B = cy.props.B ?? 0.5, U = cy.props.U ?? 5
      const q = c.props.q * uC
      const wAbs = Math.abs((q * B) / m)          // rad/s
      if (wAbs < 1e-9) continue
      let st = body._cyc
      const dx0 = body.position.x - cy.x, dy0 = body.position.y - cy.y
      if (!st || st.id !== cy.id) {
        if (Math.hypot(dx0, dy0) > R + 20) continue
        const v0 = Math.hypot(body.velocity.x, body.velocity.y) * VEL_SCALE
        // 半径由速度定；速度过小就从盒中心附近起步，相位取速度方向
        let r0 = (m * v0) / (Math.abs(q) * B) * SCALE
        if (r0 < 1) r0 = 0
        st = body._cyc = { id: cy.id, th: r0 > 1 ? Math.atan2(dy0, dx0) : Math.atan2(body.velocity.y, body.velocity.x), r: r0, v: v0, cross: 0 }
      }
      if (body._cycOut === cy.id) continue
      // 出盒：半径达到 D 形盒半径 → 停止驱动，交给常规物理直线飞出
      if (st.r >= R) { body._cycOut = cy.id; body._cyc = null; continue }
      const dth = wAbs / 60
      const thNew = st.th + dth
      // 穿缝：极角跨过 0 / π（水平缝隙）
      if (Math.floor(thNew / Math.PI) !== Math.floor(st.th / Math.PI)) {
        st.v = Math.sqrt(st.v * st.v + (2 * Math.abs(q) * U) / m)
        st.cross++
        cy._crossings = st.cross
      }
      st.th = thNew
      st.r = (m * st.v) / (Math.abs(q) * B) * SCALE
      if (st.r >= R) {
        // 到达盒边缘的这一帧仍画在边缘上，下一帧起直线飞出
        const px = cy.x + Math.cos(st.th) * R, py = cy.y + Math.sin(st.th) * R
        Matter.Body.setPosition(body, { x: px, y: py }, false)
        const vpx = (st.v * -Math.sin(st.th)) / VEL_SCALE, vpy = (st.v * Math.cos(st.th)) / VEL_SCALE
        Matter.Body.setVelocity(body, { x: vpx, y: vpy })
        body.positionPrev = { x: body.position.x - body.velocity.x, y: body.position.y - body.velocity.y }
        body._cycOut = cy.id; body._cyc = null
        continue
      }
      const px = cy.x + Math.cos(st.th) * st.r, py = cy.y + Math.sin(st.th) * st.r
      Matter.Body.setPosition(body, { x: px, y: py }, false)
      const vpx = (st.v * -Math.sin(st.th)) / VEL_SCALE, vpy = (st.v * Math.cos(st.th)) / VEL_SCALE
      Matter.Body.setVelocity(body, { x: vpx, y: vpy })
      body.positionPrev = { x: body.position.x - body.velocity.x, y: body.position.y - body.velocity.y }
    }
    // 点电荷不计重力（高中题设定）；带电物块/小球正常受重力
    if (c.type === 'charge') {
      const gw = gravityState.on ? body.mass * GRAV.y * GRAV.scale : 0
      if (gw) Matter.Body.applyForce(body, body.position, { x: 0, y: -gw })
    }
  }

  // —— 金属棒切割磁感线（电磁感应 + 楞次定律）——
  // 感应电动势 ε = B·L·(vx sinθ − vy cosθ)（与电荷洛伦兹力同一 B 符号约定）；
  // 安培力 F = I·L·(û × B)，方向由上式符号自动保证「阻碍相对运动」（楞次定律）。
  if (rods.length) {
    for (const rod of rods) {
      const b = rod.body
      const L = (rod.props.len ?? 200) / SCALE
      const th = b.angle
      const vx = b.velocity.x * VEL_SCALE, vy = b.velocity.y * VEL_SCALE
      let B = 0
      for (const f of fields) if (f.type === 'uniformB' && inside(b, f)) B += f.props.bz
      rod.props._eInst = B * L * (vx * Math.sin(th) - vy * Math.cos(th))
      // 导轨上的棒 g=0（失重）已由上方统一失重段抵消重力，此处不再重复施力（否则 force 累加导致向上漂移）
    }
    const res = solve(components)
    if (res?.currents) {
      for (const rod of rods) {
        const b = rod.body
        const I = res.currents.get(rod.id) ?? 0
        if (Math.abs(I) < 1e-9) continue
        const L = (rod.props.len ?? 200) / SCALE
        const th = b.angle
        let B = 0
        for (const f of fields) if (f.type === 'uniformB' && inside(b, f)) B += f.props.bz
        if (!B) continue
        const Fx = I * L * (-B * Math.sin(th)), Fy = I * L * (B * Math.cos(th))
        Matter.Body.applyForce(b, b.position, { x: Fx * FORCE_SCALE, y: Fy * FORCE_SCALE })
        rod.props._amp = { Fx, Fy, I }
      }
    }
  }

  // —— 电容器充放电（RC 暂态）——
  // 电容是储能元件：每个物理步用节点电压法求瞬时电流 Ic，再积分电容电压
  //   dU/dt = −Ic / C_eff   （Ic 正方向 a→b，即从 + 端 b 流出 = 放电）
  // C 单位 μF，内部放大 1000 倍（CAP_TC_SCALE）让 RC 时间常数 τ=RC 落在秒级、肉眼可见。
  if (caps.length) {
    const res = solve(components)
    if (res?.currents) {
      const dt = 1 / 60   // 物理步长 s（与 useSim 的 STEP_MS = 1000/60 一致）
      for (const cap of caps) {
        const Ic = res.currents.get(cap.id) ?? 0
        const Ceff = Math.max(0.01, cap.props.C ?? 100) * 1e-3   // μF → 教学 F
        // 前向欧拉：Ic<0 充电（U 上升），Ic>0 放电（U 下降）
        cap.props.U = (cap.props.U ?? 0) - (Ic * dt) / Ceff
      }
    }
  }

  // 条形磁铁：对带电运动电荷的简化演示力——F ∝ s·q·v/r²，方向为速度旋转 90°（N 极逆时针/S 极顺时针）
  for (const mg of magnets) {
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
