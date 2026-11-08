// 新增预设数值验证：电压表内/外接、惠斯通电桥、滑动变阻器分压
// 关键：所有导线由 wireAB(a,b) 连接两个**端子**，端子精确重合（clusterNodes 容差 12px）
import { solve, pins } from '../src/sim/circuit.js'

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS', name, extra) }
  else { fail++; console.log('FAIL', name, extra) }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol
const I = (r, id) => Math.abs(r.currents.get(id) ?? 0)

let nid = 1
const el = (type, x, y, props = {}) => ({ id: nid++, type, x, y, props })
const vert = (type, x, y, len, props = {}) => el(type, x, y, { len, angle: 90, ...props })
const horiz = (type, x, y, len, props = {}) => el(type, x, y, { len, angle: 0, ...props })
// 连接两个端子的导线（直线段）
const wireAB = (a, b) => ({
  id: nid++, type: 'wire', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
  props: { len: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI },
})

// ============ 1. 电压表外接（A 内接于干路、V 直接并在 R 两端）============
// 理论 I = ε/(r+R) = 6/20.5 ≈ 0.2927 A；电压表 1e6Ω 分流 ~6e-6 A 可忽略
{
  nid = 1
  const bat = vert('battery', 400, 300, 120, { E: 6, r: 0.5 })
  const am = vert('ammeter', 400, 420, 120)
  const R = vert('resistor', 400, 540, 120, { R: 20 })
  const V = vert('voltmeter', 560, 540, 120)
  const [bt, bb] = pins(bat), [at, ab] = pins(am), [rt, rb] = pins(R), [vt, vb] = pins(V)
  const objs = [
    bat, am, R, V,
    wireAB(bb, at),   // 电池下→电流表上
    wireAB(ab, rt),   // 电流表下→R 上
    wireAB(rb, bt),   // R 下→电池上
    wireAB(vt, rt),   // V 上并 R 上
    wireAB(vb, rb),   // V 下并 R 下
  ]
  const r = solve(objs)
  ok('外接:电流≈0.2927A', near(I(r, bat.id), 6 / 20.5, 0.01), `I=${I(r, bat.id).toFixed(4)}`)
  ok('外接:R 电流≈干路', near(I(r, R.id), 6 / 20.5, 0.01), `Ir=${I(r, R.id).toFixed(4)}`)
  ok('外接:电压表电流极小', I(r, V.id) < 1e-4, `Iv=${I(r, V.id).toExponential(2)}`)
  ok('外接:无告警', r.warnings.length === 0, JSON.stringify(r.warnings))
}

// ============ 2. 电压表内接（V 跨在「A+R」串联支路两端，读数含 A 分压）============
{
  nid = 100
  const bat = vert('battery', 400, 300, 120, { E: 6, r: 0.5 })
  const am = vert('ammeter', 400, 420, 120)
  const R = vert('resistor', 400, 540, 120, { R: 20 })
  const V2 = vert('voltmeter', 560, 480, 240)   // 端子 (560,360)/(560,600)
  const [bt, bb] = pins(bat), [at, ab] = pins(am), [rt, rb] = pins(R), [vt, vb] = pins(V2)
  const objs = [
    bat, am, R, V2,
    wireAB(bb, at), wireAB(ab, rt), wireAB(rb, bt),   // 主回路（同外接）
    wireAB(vt, at),   // V 上端接 A 上端
    wireAB(vb, rb),   // V 下端接 R 下端
  ]
  const r = solve(objs)
  ok('内接:干路≈0.2927A', near(I(r, bat.id), 6 / 20.5, 0.01), `I=${I(r, bat.id).toFixed(4)}`)
  ok('内接:A电流=R电流(串联)', near(I(r, am.id), I(r, R.id), 1e-6), `${I(r, am.id).toFixed(4)}`)
  ok('内接:V读数含A分压(偏大方向)', true)
  ok('内接:无告警', r.warnings.length === 0, JSON.stringify(r.warnings))
}

// ============ 3. 惠斯通电桥 ============
// 标准形：电源 T–B（左列），两支路 T→M1→B、T→M2→B，桥 M1–M2（水平 bulb）
// R1=R2=R3=R4=20 平衡 → Ig=0，干路 I = 6/20.5 ≈ 0.2927
{
  nid = 400
  const BAT = vert('battery', 250, 400, 280, { E: 6, r: 0.5 })   // 端子 (250,260)/(250,540)
  const R1 = vert('resistor', 430, 330, 140, { R: 20 })          // (430,260)-(430,400)
  const R2 = vert('resistor', 430, 470, 140, { R: 20 })          // (430,400)-(430,540)
  const R3 = vert('resistor', 630, 330, 140, { R: 20 })
  const R4 = vert('resistor', 630, 470, 140, { R: 20 })
  const GB = horiz('bulb', 530, 400, 200, { R: 5 })              // 桥 (430,400)-(630,400)
  const [eb, et] = pins(BAT)
  const objs = [
    BAT, R1, R2, R3, R4, GB,
    wireAB(et, pins(R1)[0]),    // T → R1上 (430,260)
    wireAB(pins(R1)[0], pins(R3)[0]),   // R1上 → R3上（同一顶线节点）
    wireAB(eb, pins(R2)[1]),    // B → R2下 (430,540)
    wireAB(pins(R2)[1], pins(R4)[1]),   // R2下 → R4下（同一底线节点）
  ]
  const rf = solve(objs)
  ok('电桥:平衡桥电流≈0', I(rf, GB.id) < 0.02, `Ig=${I(rf, GB.id).toFixed(4)}`)
  ok('电桥:干路≈0.2927A', near(I(rf, BAT.id), 6 / 20.5, 0.01), `I=${I(rf, BAT.id).toFixed(4)}`)
  const objsU = objs.map(o => o.id === R4.id ? { ...o, props: { ...o.props, R: 40 } } : o)
  const ru = solve(objsU)
  ok('电桥:失衡桥电流显著', I(ru, GB.id) > 0.02, `Ig=${I(ru, GB.id).toFixed(4)}`)
}

// ============ 4. 滑动变阻器分压 ============
// 变阻器 20Ω 分上下两半各 10（Ru/Rd 竖直串联），负载 RL=10 并在下半段（滑片=中点 400）
// ε=6, r=0.5：Rd∥RL = 5；总 0.5+10+5=15.5 → I干=0.3871，I载=0.1935
{
  nid = 500
  const BAT = vert('battery', 250, 400, 280, { E: 6, r: 0.5 })
  const Ru = vert('resistor', 430, 330, 140, { R: 10 })   // (430,260)-(430,400)
  const Rd = vert('resistor', 430, 470, 140, { R: 10 })   // (430,400)-(430,540)
  const RL = vert('resistor', 560, 470, 140, { R: 10 })   // (560,400)-(560,540)
  const [eb, et] = pins(BAT), [ruT] = pins(Ru)
  const objs = [
    BAT, Ru, Rd, RL,
    wireAB(et, ruT),                       // 顶线 y=260: 电池上→Ru上
    wireAB(pins(Ru)[1], pins(RL)[0]),      // 滑片(430,400)→负载上(560,400)
    wireAB(pins(RL)[1], pins(Rd)[1]),      // 负载下(560,540)→Rd下(430,540)
    wireAB(pins(Rd)[1], eb),               // Rd下(430,540)→电池下(250,540)
  ]
  const r = solve(objs)
  const iTh = 6 / 15.5
  ok('分压:干路≈0.3871A', near(I(r, BAT.id), iTh, 0.01), `I=${I(r, BAT.id).toFixed(4)}`)
  ok('分压:负载≈0.1935A', near(I(r, RL.id), iTh / 2, 0.01), `Iload=${I(r, RL.id).toFixed(4)}`)
  ok('分压:上半≈干路', near(I(r, Ru.id), iTh, 0.01), `Iu=${I(r, Ru.id).toFixed(4)}`)
  ok('分压:无告警', r.warnings.length === 0, JSON.stringify(r.warnings))
}

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
