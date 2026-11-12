// 多用电表三档验证：A 档（串联测电流）、V 档（并联测电压）、Ω 档（表内电池测阻值）
// Ω 档原理：表内电池 E=3V + 内阻 R内=100Ω，表笔接电阻 R → I=E/(R内+R) → R=E/I−R内
import { solve, pins, OHM_BATTERY, OHM_RESISTOR } from '../src/sim/circuit.js'

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
const near = (a, b, tol) => Math.abs(a - b) <= tol
const I = (r, id) => Math.abs(r.currents.get(id) ?? 0)

let nid = 1
const el = (type, x, y, props = {}) => ({ id: nid++, type, x, y, props })
const vert = (type, x, y, len, props = {}) => el(type, x, y, { len, angle: 90, ...props })
const wireAB = (a, b) => ({ id: nid++, type: 'wire', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, props: { len: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI } })

// ============ 1. A 档：串联测电流 ============
// 电池(E6,r0.5) + 万用表(A 档 0.1Ω) + 电阻(10Ω) 串联 → I=6/10.6=0.566A
{
  nid = 1
  const bat = vert('battery', 400, 300, 120, { E: 6, r: 0.5 })
  const mm = vert('multimeter', 400, 420, 120, { mode: 0 })
  const R = vert('resistor', 400, 540, 120, { R: 10 })
  const [bt, bb] = pins(bat), [mt, mb] = pins(mm), [rt, rb] = pins(R)
  const objs = [bat, mm, R, wireAB(bb, mt), wireAB(mb, rt), wireAB(rb, bt)]
  const r = solve(objs)
  ok('A 档:电流≈0.566A', near(I(r, mm.id), 6 / 10.6, 0.005), `I=${I(r, mm.id).toFixed(3)}`)
  ok('A 档:无告警', r.warnings.length === 0, JSON.stringify(r.warnings))
}

// ============ 2. V 档：并联测电压 ============
// 电池(E6,r0.5)+电阻(10Ω) 串联，万用表(V 档 1e6Ω) 并在 R 两端 → U=6×10/10.5=5.714V
{
  nid = 100
  const bat = vert('battery', 400, 300, 120, { E: 6, r: 0.5 })
  const R = vert('resistor', 400, 540, 120, { R: 10 })
  const mm = vert('multimeter', 560, 540, 120, { mode: 1 })
  const [bt, bb] = pins(bat), [rt, rb] = pins(R), [mt, mb] = pins(mm)
  const objs = [bat, R, mm, wireAB(bb, rt), wireAB(rb, bt), wireAB(mt, rt), wireAB(mb, rb)]
  const r = solve(objs)
  const uR = I(r, R.id) * 10   // R 两端电压 = I_R × R
  ok('V 档:电压≈5.71V', near(uR, 6 * 10 / 10.5, 0.05), `U=${uR.toFixed(2)}`)
  ok('V 档:万用表分流极小', I(r, mm.id) < 1e-4, `Iv=${I(r, mm.id).toExponential(2)}`)
}

// ============ 3. Ω 档：表笔接电阻测阻值（用户场景：导线连接） ============
// 万用表(Ω) + 电阻(10Ω) 通过两根竖直导线连接 → R=E/I−R内=10Ω
{
  nid = 200
  const mm = el('multimeter', 570, 250, { mode: 2, len: 160, angle: 0 })
  const R = el('resistor', 570, 340, { R: 10, len: 160, angle: 0 })
  const w1 = vert('wire', 650, 295, 90)
  const w2 = vert('wire', 490, 295, 90)
  const objs = [mm, R, w1, w2]
  const r = solve(objs)
  const Rm = OHM_BATTERY / I(r, mm.id) - OHM_RESISTOR
  ok('Ω 档:测 10Ω 电阻', near(Rm, 10, 0.1), `R=${Rm.toFixed(1)}Ω`)
  ok('Ω 档:无断路告警', (r.open || []).length === 0, JSON.stringify((r.open || []).map(e => e.type)))
}

// ============ 4. Ω 档：表笔短接 = R=0（满偏） ============
{
  nid = 300
  const mm = el('multimeter', 570, 250, { mode: 2, len: 160, angle: 0 })
  const w1 = vert('wire', 650, 295, 90)
  const w2 = vert('wire', 490, 295, 90)
  const w3 = el('wire', 570, 340, { len: 160, angle: 0 })
  const objs = [mm, w1, w2, w3]
  const r = solve(objs)
  const Rm = OHM_BATTERY / I(r, mm.id) - OHM_RESISTOR
  ok('Ω 档:短接 R≈0Ω', near(Rm, 0, 0.1), `R=${Rm.toFixed(2)}Ω`)
  ok('Ω 档:短接电流≈满偏 0.03A', near(I(r, mm.id), OHM_BATTERY / OHM_RESISTOR, 1e-3), `I=${I(r, mm.id).toFixed(4)}`)
}

// ============ 5. Ω 档：表笔悬空 = 无电流 ============
{
  nid = 400
  const mm = el('multimeter', 570, 250, { mode: 2, len: 160, angle: 0 })
  const r = solve([mm])
  ok('Ω 档:悬空无电流', I(r, mm.id) < 1e-6, `I=${I(r, mm.id).toExponential(2)}`)
}

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
