// 安培力通电导线（电磁炮/导轨）：通电金属棒在磁场中受安培力加速，反电动势平衡后匀速
// 预设数值：E=6V, r=0.5Ω, R棒=2Ω, B=2T, L=2m, m=0.5kg, 棒竖直 angle=90
//   初始 I = E/(r+R) = 6/2.5 = 2.4A；F = BIL = 2×2.4×2 = 9.6N 向右
//   a = F/m = 19.2 m/s²；反电动势 ε = BLv = 4v；终速 v = E/(BL) = 1.5 m/s
//   τ = mR总/(B²L²) = 0.5×2.5/16 = 0.078s
import Matter from 'matter-js'
import { registry } from '../src/sim/registry.js'
import { applyForces, createWorld } from '../src/sim/engine.js'
import { solve } from '../src/sim/circuit.js'
import { presets } from '../src/sim/presets.js'

let pass = 0, fail = 0
const ok = (name, cond, info = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`) }

function build(name) {
  const engine = createWorld()
  const objs = presets[name].map((it, i) => {
    const props = { ...registry[it.type].defaults(), ...(it.props || {}) }
    const o = { id: i + 1, type: it.type, x: it.x, y: it.y, props, body: null }
    const def = registry[it.type].body?.(o.x, o.y, props)
    if (def?.type === 'rotRect') { o.body = Matter.Bodies.rectangle(o.x, o.y, def.w, def.h, def.options); Matter.Body.setAngle(o.body, def.angle) }
    else if (def?.type === 'rectangle') o.body = Matter.Bodies.rectangle(o.x, o.y, def.w, def.h, def.options)
    if (o.body) {
      if (props.m != null) Matter.Body.setMass(o.body, props.m)
      Matter.Composite.add(engine.world, o.body)
    }
    return o
  })
  return { engine, objs, rod: objs.find(o => o.type === 'metalRod'), bat: objs.find(o => o.type === 'battery') }
}
function run({ engine, objs }, steps) {
  for (let t = 0; t < steps; t++) { applyForces(objs); Matter.Engine.update(engine, 1000 / 60) }
}

// —— 1. 初始电流 2.4A、棒静止 ε=0 ——
{
  const w = build('安培力通电导线')
  run(w, 1)
  const eps = w.rod.props._eInst
  ok('初始 ε=0（静止）', Math.abs(eps) < 1e-9, `ε=${eps}`)
  const r = solve(w.objs)
  const I = Math.abs(r.currents.get(w.rod.id))
  ok('初始 I=E/(r+R)=2.4A', Math.abs(I - 2.4) < 0.01, `I=${I.toFixed(4)}A`)
  ok('无断路警告', (r.open || []).length === 0, JSON.stringify((r.open || []).map(o => o.type)))
}

// —— 2. 棒向右加速（安培力）——
{
  const w = build('安培力通电导线')
  run(w, 1)
  const v1 = w.rod.body.velocity.x * 0.6
  run(w, 20)
  const v2 = w.rod.body.velocity.x * 0.6
  ok('棒向右加速（v 增大）', v2 > v1 + 0.5, `v1=${v1.toFixed(3)} v2=${v2.toFixed(3)} m/s`)
}

// —— 3. 终速趋近 v=E/(BL)=1.5 m/s ——
{
  const w = build('安培力通电导线')
  run(w, 120)   // 2s，τ=0.078s 早已稳态
  const v = w.rod.body.velocity.x * 0.6
  ok('终速≈1.5 m/s', Math.abs(v - 1.5) < 0.08, `v=${v.toFixed(3)} m/s`)
  const r = solve(w.objs)
  const I = Math.abs(r.currents.get(w.rod.id))
  ok('稳态电流≈0', I < 0.05, `I=${I.toFixed(4)}A`)
}

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
