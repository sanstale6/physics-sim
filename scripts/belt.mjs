// 传送带旋转功能：倾斜传送带的接触检测 + 摩擦带动
import Matter from 'matter-js'
import { registry } from '../src/sim/registry.js'
import { applyForces, createWorld } from '../src/sim/engine.js'
import { contactIncline } from '../src/sim/incline.js'
import { frictionForce } from '../src/sim/contacts.js'
import { presets } from '../src/sim/presets.js'

let pass = 0, fail = 0
const ok = (name, cond, info = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`) }

function mkConveyor(props = {}) {
  const pr = { ...registry.conveyor.defaults(), ...props }
  return { type: 'conveyor', x: 400, y: 400, props: pr, body: null }
}

function mkBlock(x, y, props = {}) {
  const pr = { ...registry.block.defaults(), ...props }
  const body = Matter.Bodies.rectangle(x, y, 50, 30, { friction: 0, frictionStatic: 0 })
  if (pr.m != null) Matter.Body.setMass(body, pr.m)
  return { type: 'block', x, y, props: pr, body }
}

// 带面中点（中心线沿上方法线上移半高 8）：(x + 8sin a, y - 8cos a)
const cv30 = mkConveyor({ len: 400, angle: 30, v: 3 })
const a30 = Math.PI / 6
const midX = 400 + 8 * Math.sin(a30), midY = 400 - 8 * Math.cos(a30)

// —— 1. contactIncline 识别倾斜传送带 ——
{
  const blk = mkBlock(midX, midY - 15, { m: 1, mu: 0.4 })
  const c = contactIncline(blk, [cv30])
  ok('倾斜传送带被识别', !!c, c ? `a=${(c.a * 180 / Math.PI).toFixed(1)}°` : 'null')
  ok('角度≈30°', c && Math.abs(c.a - a30) < 0.02, c ? `${(c.a * 180 / Math.PI).toFixed(2)}°` : '')
  ok('isBelt 标记', c && c.geom.isBelt === true)
}

// —— 2. 水平传送带不走 contactIncline（走 supportUnder 水平分支）——
{
  const cv0 = mkConveyor({ len: 400, angle: 0, v: 3 })
  const blk = mkBlock(400, 392, { m: 1, mu: 0.4 })
  const c = contactIncline(blk, [cv0])
  ok('水平传送带 contactIncline 返回 null', c === null)
}

// —— 3. 倾斜传送带摩擦：静止物块被带速带动（沿带向下）——
{
  const blk = mkBlock(midX, midY - 15, { m: 1, mu: 0.4 })
  const f = frictionForce(blk, [cv30])
  ok('摩擦力非空', !!f)
  // 带面方向 d = (cos30, sin30)，f 应沿 +d（带动物体向下）
  const d = { x: Math.cos(a30), y: Math.sin(a30) }
  const fd = f ? f.x * d.x + f.y * d.y : 0
  ok('摩擦沿带面向下带动', f && fd > 0, f ? `fd=${fd.toFixed(2)}N (f=${f.x.toFixed(2)},${f.y.toFixed(2)})` : '')
  const muN = 0.4 * 9.8 * Math.cos(a30)
  ok('摩擦大小=μN', f && Math.abs(Math.hypot(f.x, f.y) - muN) < 0.01, f ? `|f|=${Math.hypot(f.x, f.y).toFixed(3)} μN=${muN.toFixed(3)}` : '')
}

// —— 4. 倾斜传送带带速向上（v<0）：摩擦沿带向上带动物体（μ>tan30 能顶住重力）——
{
  const cvUp = mkConveyor({ len: 400, angle: 30, v: -3 })
  const blk = mkBlock(midX, midY - 15, { m: 1, mu: 0.8 })
  const f = frictionForce(blk, [cvUp])
  const d = { x: Math.cos(a30), y: Math.sin(a30) }
  const fd = f ? f.x * d.x + f.y * d.y : 0
  ok('带速向上时摩擦沿带向上', f && fd < 0, f ? `fd=${fd.toFixed(2)}N` : '')
}

// —— 5. 水平传送带端到端：物块被带动到带速（回归）——
{
  const engine = createWorld()
  const objs = presets['传送带'].map((it, i) => {
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
  const blk = objs.find(o => o.type === 'block')
  for (let t = 0; t < 80; t++) { applyForces(objs); Matter.Engine.update(engine, 1000 / 60) }
  const vx = blk.body.velocity.x * 0.6   // px/step → m/s
  ok('水平传送带物块被带到带速 v=2', Math.abs(vx - 2) < 0.2, `v=${vx.toFixed(2)}m/s x=${blk.body.position.x.toFixed(0)}`)
}

// —— 6. 倾斜传送带端到端：物块被带速带动沿带面下滑 ——
{
  const engine = createWorld()
  const objs = presets['倾斜传送带'].map((it, i) => {
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
  const blk = objs.find(o => o.type === 'block')
  for (let t = 0; t < 80; t++) { applyForces(objs); Matter.Engine.update(engine, 1000 / 60) }
  const d = { x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) }
  const vd = (blk.body.velocity.x * d.x + blk.body.velocity.y * d.y) * 0.6   // 沿带面向下 m/s
  ok('倾斜传送带物块沿带面运动', vd > 0.3, `vd=${vd.toFixed(2)}m/s pos=(${blk.body.position.x.toFixed(0)},${blk.body.position.y.toFixed(0)})`)
}

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
