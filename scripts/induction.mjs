// 电磁感应：金属棒切割磁感线（ε=BLv / 安培力阻碍运动 / 楞次定律）
// 预设数值：B=1T, L=2m, R棒=2Ω, R电阻=6Ω, m=0.5kg, v0=3m/s
//   ε = BLv = 6V；I = ε/(6+2+0.01) ≈ 0.749A；F = BIL = 1.5N
//   指数衰减 v = v0·e^(−t/τ)，τ = mR总/(B²L²) = 0.5×8.01/4 ≈ 1.00s
import Matter from 'matter-js'
import { registry } from '../src/sim/registry.js'
import { applyForces, createWorld } from '../src/sim/engine.js'
import { solve, pins } from '../src/sim/circuit.js'
import { presets } from '../src/sim/presets.js'

let pass = 0, fail = 0
const ok = (name, cond, info = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`) }

function build(name, patch = {}) {
  const engine = createWorld()
  const objs = presets[name].map((it, i) => {
    const props = { ...registry[it.type].defaults(), ...(it.props || {}), ...(patch[it.type] || {}) }
    const o = { id: i + 1, type: it.type, x: it.x, y: it.y, props, body: null }
    const def = registry[it.type].body?.(o.x, o.y, props)
    if (def?.type === 'rotRect') { o.body = Matter.Bodies.rectangle(o.x, o.y, def.w, def.h, def.options); Matter.Body.setAngle(o.body, def.angle) }
    else if (def?.type === 'rectangle') o.body = Matter.Bodies.rectangle(o.x, o.y, def.w, def.h, def.options)
    if (o.body) {
      if (props.m != null) Matter.Body.setMass(o.body, props.m)
      Matter.Composite.add(engine.world, o.body)
    }
    if (o.type === 'metalRod') Matter.Body.setVelocity(o.body, { x: (props.v0x ?? 0) / 0.6, y: -(props.v0y ?? 0) / 0.6 })
    return o
  })
  return { engine, objs, rod: objs.find(o => o.type === 'metalRod'), am: objs.find(o => o.type === 'ammeter') }
}

function run({ engine, objs }, steps) {
  for (let t = 0; t < steps; t++) { applyForces(objs); Matter.Engine.update(engine, 1000 / 60) }
}

// 注意：applyForces 是「累加」施力（Matter 的 body.force 累加），每步只能调用一次，
// 否则重力抵消项会被加两遍让棒凭空向上漂。所以断言里的电动势在跑完一步后读。
// —— 1. 感应电动势与电流 ——
{
  const w = build('金属棒切割磁感线')
  run(w, 1)
  const eps = w.rod.props._eInst
  // ε 用「本步开始时的速度」算：v0=3m/s、B=1T、L=2m → 6V
  ok('ε=BLv=6V', Math.abs(eps - 6) < 1e-6, `ε=${eps.toFixed(4)}V`)
  const r = solve(w.objs)
  const I = Math.abs(r.currents.get(w.rod.id))
  ok('I=ε/(R总)≈0.749A', Math.abs(I - Math.abs(eps) / 8.01) < 0.005, `I=${I.toFixed(3)}A`)
  ok('无断路警告', (r.open || []).length === 0, JSON.stringify((r.open || []).map(o => o.type)))
  const Ia = Math.abs(r.currents.get(w.am.id))
  ok('电流表读数一致', Math.abs(Ia - I) < 1e-3, `I表=${Ia.toFixed(3)}A`)
}

// —— 2. 楞次定律：安培力阻碍运动，速度指数衰减 ——
{
  const w = build('金属棒切割磁感线')
  const x0 = w.rod.body.position.x
  run(w, 60)
  const v1 = w.rod.body.velocity.x * 0.6
  ok('1s 后 v≈v0·e^-1=1.10', Math.abs(v1 - 1.10) < 0.1, `v=${v1.toFixed(2)}m/s`)
  ok('速度单调减小（受阻碍）', v1 < 3 && v1 > 0, `v=${v1.toFixed(2)}`)
  ok('沿导轨运动（y 不变）', Math.abs(w.rod.body.position.y - 300) < 1.5, `y=${w.rod.body.position.y.toFixed(1)}`)
  ok('位移向右', w.rod.body.position.x > x0, `Δx=${(w.rod.body.position.x - x0).toFixed(0)}px`)
  const r = solve(w.objs)
  ok('电流随 v 减小', Math.abs(r.currents.get(w.rod.id)) < 0.6, `I=${Math.abs(r.currents.get(w.rod.id)).toFixed(3)}A`)
}

// —— 3. 反向磁场：ε 变号，仍是减速（楞次定律与 B 方向无关地阻碍相对运动）——
{
  const w = build('金属棒切割磁感线', { uniformB: { bz: -1 } })
  run(w, 1)
  ok('B 反向 → ε 变号', w.rod.props._eInst < 0, `ε=${w.rod.props._eInst.toFixed(3)}V`)
  run(w, 59)
  const v1 = w.rod.body.velocity.x * 0.6
  ok('反向 B 仍减速', Math.abs(v1 - 1.10) < 0.1, `v=${v1.toFixed(2)}m/s`)
}

// —— 4. 滑动接触：棒移动后两端仍与导轨相连（端子压线）——
{
  const w = build('金属棒切割磁感线')
  run(w, 40)
  const ps = pins(w.rod)
  ok('上端仍压在导轨上', Math.abs(ps[0].y - 200) < 12, `y=${ps[0].y.toFixed(1)}`)
  ok('下端仍压在导轨上', Math.abs(ps[1].y - 400) < 12, `y=${ps[1].y.toFixed(1)}`)
  const r = solve(w.objs)
  ok('运动中电路仍闭合', (r.open || []).length === 0 && Math.abs(r.currents.get(w.rod.id)) > 1e-3,
    `I=${Math.abs(r.currents.get(w.rod.id)).toFixed(3)}A`)
}

// —— 5. 停止切割后（速度≈0）电流趋于 0 ——
{
  const w = build('金属棒切割磁感线')
  run(w, 360)
  const r = solve(w.objs)
  ok('6s 后电流≈0', Math.abs(r.currents.get(w.rod.id)) < 0.02, `I=${Math.abs(r.currents.get(w.rod.id)).toFixed(4)}A`)
  ok('棒未滑出导轨（x<800）', w.rod.body.position.x < 800, `x=${w.rod.body.position.x.toFixed(0)}`)
}

// —— 6. 无磁场：不产生电动势 ——
{
  const w = build('金属棒切割磁感线', { uniformB: { bz: 0 } })
  run(w, 1)
  ok('B=0 → ε=0', Math.abs(w.rod.props._eInst) < 1e-9, `ε=${w.rod.props._eInst}`)
  const v0 = w.rod.body.velocity.x
  run(w, 59)
  ok('B=0 → 匀速（无安培力）', Math.abs(w.rod.body.velocity.x - v0) < 1e-6, `v=${(w.rod.body.velocity.x * 0.6).toFixed(2)}`)
}

console.log(`\n${pass} 通过, ${fail} 失败`)
if (fail) process.exit(1)
