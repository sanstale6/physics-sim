// 「⟲ 重置」必须清运行时状态：极板电荷/电压、附着钉死的电荷、电容电压、
// 回旋加速器相位、电子枪计时、恒力绑定。否则重置后物理状态停在上一次运行的结果上。
import Matter from 'matter-js'
import { createWorld, applyForces, resetRuntime, VEL_SCALE, gravityState } from '../src/sim/engine.js'

// 点电荷自带「抵消重力」的力，测试世界里把全局重力设为 0 时必须同时关掉重力开关，
// 否则会凭空受到「反重力」向上飞（其他带电测试脚本同样是这么处理的）
gravityState.on = false

let pass = 0, fail = 0
const ok = (name, cond, info = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name, info) }

// —— 1. 电荷附着极板：累积电荷、U 上升、电荷被 setStatic 钉住 ——
{
  const w = createWorld()
  w.gravity.y = 0
  const plates = {
    id: 'p1', type: 'plates', x: 400, y: 300,
    props: { len: 200, gap: 100, U: 0, angle: 0 }, init: { len: 200, gap: 100, U: 0, angle: 0 },
  }
  const charge = {
    id: 'c1', type: 'charge', x: 400, y: 200,
    props: { q: 1, m: 0.5, r: 8 }, body: Matter.Bodies.circle(400, 200, 8, { frictionAir: 0 }),
  }
  Matter.Body.setMass(charge.body, 0.5)
  Matter.Composite.add(w.world, charge.body)
  Matter.Body.setVelocity(charge.body, { x: 0, y: 2 / VEL_SCALE })
  const comps = [plates, charge]
  let attachedAt = -1
  for (let i = 0; i < 240; i++) {
    applyForces(comps)
    Matter.Engine.update(w, 1000 / 60)
    if (charge.body._attached) { attachedAt = i; break }
  }
  ok('电荷能附着到极板', attachedAt >= 0, `step ${attachedAt}`)
  ok('附着后极板累积电荷 Q≠0', Math.abs(plates.props._Q ?? 0) > 1e-9, `Q=${(plates.props._Q ?? 0).toFixed(3)}`)
  ok('附着后极板电压 U 变化', Math.abs(plates.props.U) > 1e-9, `U=${plates.props.U.toFixed(3)}V`)
  ok('附着后电荷被钉成静态', charge.body.isStatic === true)

  resetRuntime(comps)
  ok('重置：极板电荷 Q 清零', (plates.props._Q ?? 0) === 0)
  ok('重置：极板电压回到放置值 0', plates.props.U === 0, `U=${plates.props.U}`)
  ok('重置：电荷解除钉住（isStatic=false）', charge.body.isStatic === false)
  ok('重置：附着标记清除', charge.body._attached === undefined)

  // 重置后电荷能继续运动（曾经会被永久钉在板上）
  const x0 = charge.body.position.x
  for (let i = 0; i < 30; i++) { applyForces(comps); Matter.Engine.update(w, 1000 / 60) }
  ok('重置：电荷重新可运动', Math.abs(charge.body.position.y - 200) > 1 || Math.abs(charge.body.position.x - x0) > 1,
    `pos (${charge.body.position.x.toFixed(1)}, ${charge.body.position.y.toFixed(1)})`)
}

// —— 2. 电容器：积分出的电压在重置后清空 ——
{
  const wireAB = (id, a, b) => ({
    id, type: 'wire',
    x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2,
    props: { len: Math.hypot(b[0] - a[0], b[1] - a[1]), angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI },
  })
  const comps = [
    { id: 'b', type: 'battery', x: 200, y: 200, props: { E: 6, r: 0.5, len: 200, angle: 0 } },
    { id: 'r', type: 'resistor', x: 450, y: 200, props: { R: 10, len: 200, angle: 0 } },
    { id: 'c', type: 'capacitor', x: 700, y: 200, props: { C: 100, len: 200, angle: 180 }, init: { C: 100, len: 200, angle: 180 } },
    wireAB('w1', [300, 200], [350, 200]),
    wireAB('w2', [550, 200], [600, 200]),
    { id: 'w3', type: 'wire', x: 450, y: 400, props: { len: 700, angle: 0 } },
    { id: 'w4', type: 'wire', x: 100, y: 300, props: { len: 200, angle: 90 } },
    { id: 'w5', type: 'wire', x: 800, y: 300, props: { len: 200, angle: 90 } },
  ]
  const cap = comps.find(c => c.type === 'capacitor')
  for (let i = 0; i < 240; i++) applyForces(comps)     // 4s 充电
  ok('电容器充电到 U>2V', cap.props.U > 2, `U=${(cap.props.U ?? 0).toFixed(2)}V`)
  resetRuntime(comps)
  ok('重置：电容器电压清空（不再带电）', cap.props.U === undefined || cap.props.U === 0, `U=${cap.props.U}`)
  applyForces(comps)
  const U1 = cap.props.U ?? 0
  for (let i = 0; i < 60; i++) applyForces(comps)
  const U2 = cap.props.U ?? 0
  ok('重置后从 0 重新充电（第一步电压很小）', Math.abs(U1) < 0.5, `U(1步)=${U1.toFixed(3)}V`)
  ok('重置后重新充电正常上升', U2 > 1.5 && U2 > U1, `U(1s)=${U2.toFixed(2)}V`)
}

// —— 3. 回旋加速器相位 / 电子枪计时 / 恒力绑定 / 交流瞬时值 ——
{
  const w = createWorld()
  w.gravity.y = 0
  const charge = {
    id: 'c2', type: 'charge', x: 400, y: 300,
    props: { q: 1, m: 0.5, r: 8 }, body: Matter.Bodies.circle(400, 300, 8, { frictionAir: 0 }),
  }
  const cyc = { id: 'cy1', type: 'cyclotron', x: 400, y: 300, props: { R: 160, B: 2, U: 5 } }
  const gun = { id: 'g1', type: 'electronGun', x: 100, y: 100, props: { q: -1, m: 0.5, v: 5, rate: 2, angle: 0 }, _t: 1.7 }
  const force = { id: 'f1', type: 'constantForce', x: 300, y: 300, props: { fx: 10, fy: 0 }, _target: 'c2' }
  const batt = { id: 'b1', type: 'battery', x: 600, y: 300, props: { E: 6, r: 0.5, len: 100, angle: 0, ac: 1, freq: 1, _eInst: 3.2 } }
  Matter.Composite.add(w.world, charge.body)
  Matter.Body.setVelocity(charge.body, { x: 6 / VEL_SCALE, y: 0 })
  const comps = [charge, cyc, gun, force, batt]
  for (let i = 0; i < 120; i++) { applyForces(comps); Matter.Engine.update(w, 1000 / 60) }
  ok('回旋加速器状态已建立', !!charge.body._cyc || charge.body._cycOut != null)
  resetRuntime(comps)
  ok('重置：回旋相位清除', charge.body._cyc === undefined && charge.body._cycOut === undefined)
  ok('重置：穿缝计数清除', cyc._crossings === undefined)
  ok('重置：电子枪计时清除', gun._t === undefined)
  ok('重置：恒力绑定清除', force._target === undefined)
  ok('重置：交流瞬时电动势清除', batt.props._eInst === undefined)
  ok('重置：保留摆放结构（_par/_a/_b 不被清）', (() => {
    const t = { id: 'x', type: 'wire', props: { _par: { a1: { x: 1, y: 2 } }, _a: 3, _b: 4 } }
    resetRuntime([t])
    return !!t.props._par && t.props._a === 3 && t.props._b === 4
  })())
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
