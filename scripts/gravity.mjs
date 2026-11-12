// 万有引力（开普勒定律）：F = G·M·m/r²，指向恒星
// 预设数值：M=120、G=1（GM=120）、行星 r=3m(300px)、m=1kg
//   圆速度 v = √(GM/r) = √40 ≈ 6.32 m/s → 周期 2πr/v ≈ 2.98s
//   椭圆：初速 4m/s < 圆速度 → 近地点 75px、远地点 300px
import Matter from 'matter-js'
import { registry } from '../src/sim/registry.js'
import { applyForces, createWorld, VEL_SCALE } from '../src/sim/engine.js'
import { presets } from '../src/sim/presets.js'

let pass = 0, fail = 0
const ok = (name, cond, info = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`) }

function build(name) {
  const engine = createWorld()
  const objs = presets[name].map((it, i) => {
    const props = { ...registry[it.type].defaults(), ...(it.props || {}) }
    const o = { id: i + 1, type: it.type, x: it.x, y: it.y, props, body: null }
    const def = registry[it.type].body?.(o.x, o.y, props)
    if (def?.type === 'circle') o.body = Matter.Bodies.circle(o.x, o.y, def.r, def.options)
    else if (def?.type === 'rectangle') o.body = Matter.Bodies.rectangle(o.x, o.y, def.w, def.h, def.options)
    else if (def?.type === 'rotRect') { o.body = Matter.Bodies.rectangle(o.x, o.y, def.w, def.h, def.options); Matter.Body.setAngle(o.body, def.angle) }
    if (o.body) {
      if (props.m != null) Matter.Body.setMass(o.body, props.m)
      Matter.Composite.add(engine.world, o.body)
      // 初速度（ball/particle 的 v0x/v0y，单位 m/s，向上为正）
      if (props.v0x != null || props.v0y != null) Matter.Body.setVelocity(o.body, { x: (props.v0x ?? 0) / VEL_SCALE, y: -(props.v0y ?? 0) / VEL_SCALE })
    }
    return o
  })
  return { engine, objs, star: objs.find(o => o.type === 'gravity'), planet: objs.find(o => o.type === 'ball') }
}
function run({ engine, objs }, steps) {
  for (let t = 0; t < steps; t++) { applyForces(objs); Matter.Engine.update(engine, 1000 / 60) }
}
function rOf(o, star) {
  return Math.hypot(o.body.position.x - star.x, o.body.position.y - star.y)
}
function vOf(o) {
  return Math.hypot(o.body.velocity.x, o.body.velocity.y) * VEL_SCALE
}

// —— 1. 圆轨道：v=√(GM/r)=6.32，半径稳定 300px、速度恒定 ——
{
  const w = build('行星圆周运动')
  run(w, 1)
  ok('初始引力 a=GM/r²≈13.3', Math.abs(vOf(w.planet) - 6.32) < 0.1, `v=${vOf(w.planet).toFixed(2)}m/s`)
  let rmin = 1e9, rmax = 0, vmin = 1e9, vmax = 0
  for (let t = 0; t < 200; t++) {
    run(w, 1)
    const r = rOf(w.planet, w.star), v = vOf(w.planet)
    rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v)
  }
  ok('圆轨道半径稳定 rmax≈300', Math.abs(rmax - 300) < 15, `rmax=${rmax.toFixed(1)}px`)
  ok('圆轨道半径稳定 rmin≈300', Math.abs(rmin - 300) < 15, `rmin=${rmin.toFixed(1)}px`)
  ok('圆轨道速率恒定 v≈6.32', Math.abs(vmax - 6.32) < 0.6 && Math.abs(vmin - 6.32) < 0.6, `v∈[${vmin.toFixed(2)},${vmax.toFixed(2)}]`)
}

// —— 2. 椭圆轨道：v=4 < 圆速度 → 近地点 75px、远地点 300px ——
{
  const w = build('椭圆轨道')
  let rmin = 1e9, rmax = 0
  for (let t = 0; t < 300; t++) {
    run(w, 1)
    const r = rOf(w.planet, w.star)
    rmin = Math.min(rmin, r); rmax = Math.max(rmax, r)
  }
  ok('椭圆远地点≈300', Math.abs(rmax - 300) < 40, `rmax=${rmax.toFixed(1)}px`)
  ok('椭圆近地点≈75', Math.abs(rmin - 75) < 20, `rmin=${rmin.toFixed(1)}px`)
}

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
