// 预设场景冒烟测试：每个预设跑 2 秒，检查不出现 NaN / 爆炸 / 穿透掉出世界
import Matter from 'matter-js'
import { createWorld, applyForces, postStep, VEL_SCALE } from '../src/sim/engine.js'
import { registry } from '../src/sim/registry.js'
import { presets } from '../src/sim/presets.js'

let pass = 0, fail = 0
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('PASS', name, detail ?? '') }
  else { fail++; console.log('FAIL', name, detail ?? '') }
}

function makeBody(o) {
  const reg = registry[o.type]
  if (!reg?.body) return null
  const def = reg.body(o.x, o.y, o.props)
  const opts = { frictionAir: 0, ...def.options, label: def.label }
  let body = null
  if (def.type === 'rectangle') body = Matter.Bodies.rectangle(o.x, o.y, def.w, def.h, opts)
  else if (def.type === 'rotRect') {
    body = Matter.Bodies.rectangle(o.x, o.y, def.w, def.h, opts)
    Matter.Body.setAngle(body, def.angle ?? 0)
  } else if (def.type === 'circle') body = Matter.Bodies.circle(o.x, o.y, def.r, opts)
  else if (def.type === 'vertices') body = Matter.Bodies.fromVertices(o.x, o.y, [def.verts], opts)
  if (body && o.props.m != null && !body.isStatic) Matter.Body.setMass(body, o.props.m)
  return body
}

let id = 1
for (const [name, items] of Object.entries(presets)) {
  const engine = createWorld()
  const objs = []
  for (const it of items) {
    const reg = registry[it.type]
    if (!reg) { console.log('SKIP 未知元件', it.type); continue }
    const props = { ...reg.defaults(), ...(it.props || {}) }
    const o = { id: id++, type: it.type, props, x: it.x, y: it.y, angle: it.angle || 0, body: null }
    const b = makeBody(o)
    if (b) { Matter.Composite.add(engine.world, b); o.body = b }
    objs.push(o)
  }
  for (let i = 0; i < 120; i++) {
    applyForces(objs)
    Matter.Engine.update(engine, 1000 / 60)
    postStep(objs)
  }
  let bad = null, maxSpeed = 0
  for (const o of objs) {
    if (!o.body) continue
    const p = o.body.position, v = o.body.velocity
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(v.x) || !Number.isFinite(v.y)) bad = 'NaN ' + o.type
    if (Math.abs(p.x) > 6000 || p.y > 6000) bad = bad || ('飞出世界 ' + o.type + ' @' + p.x.toFixed(0) + ',' + p.y.toFixed(0))
    maxSpeed = Math.max(maxSpeed, Math.hypot(v.x, v.y) * VEL_SCALE)
  }
  check('预设 ' + name, !bad, bad ? bad : 'vmax=' + maxSpeed.toFixed(1) + ' m/s, 物体 ' + objs.length)
}
console.log(pass + ' 通过, ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
