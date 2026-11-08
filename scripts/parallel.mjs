// 并联对齐 / 螺线管接入电路 回归
import { findParallel, solve, connPins } from '../src/sim/circuit.js'

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS', name, extra) }
  else { fail++; console.log('FAIL', name, extra) }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol

const ring = () => [
  { id: 1, type: 'battery', x: 951, y: 269, props: { E: 6, r: 0.5, len: 290, angle: 0 } },
  { id: 2, type: 'ammeter', x: 1096, y: 399, props: { len: 260, angle: 90 } },
  { id: 3, type: 'rheostat', x: 806, y: 399, props: { R: 20, len: 260, angle: 270 } },
  { id: 4, type: 'solenoid', x: 946, y: 529, props: { len: 280, angle: 0, R: 11.5 } },
]

// 1. 螺线管能接入电路：I = 6 / (0.5+20+11.5+0.01) ≈ 0.1874
{
  const r = solve(ring())
  const I = r.currents.get(4)
  ok('螺线管接入电路', near(Math.abs(I), 6 / 32.01, 0.002), `I=${I.toFixed(4)} A`)
  ok('螺线管不报短路', !r.warnings.some(w => w.kind === 'short'))
}

// 2. 并联检测：电池上方 100px 放 250px 导线 → 对齐到电池两端（290px）
{
  const par = findParallel(951, 170, 250, 0, ring())
  ok('并联触发', !!par)
  ok('并联对齐长度', par && near(par.len, 290, 1), par && `len=${par.len.toFixed(1)}`)
  ok('并联保留垂直偏移', par && near(Math.abs(par.perp), 99, 3), par && `perp=${par.perp.toFixed(1)}`)
}

// 3. 角度差 30° 不触发
ok('角度不平行不触发', findParallel(951, 170, 250, 30, ring()) === null)
// 4. 距离过远不触发
ok('距离过远不触发', findParallel(951, 700, 250, 0, ring()) === null)
// 5. 长度差过大不触发
ok('长度差过大不触发', findParallel(951, 170, 120, 0, ring()) === null)

// 6. 并联态电气连接：connPins 返回 A1A2，且与电池并联的电阻分流
{
  const par = findParallel(951, 170, 250, 0, ring())
  const R = 10
  const res = { id: 5, type: 'resistor', x: par.cx, y: par.cy, props: { R, len: par.len, angle: par.angle, _par: { a1: par.a1, a2: par.a2 } } }
  const cp = connPins(res)
  ok('并联态连接点=A1A2', near(cp[0].x, par.a1.x, 0.01) && near(cp[1].y, par.a2.y, 0.01))
  const s = solve([...ring(), res])
  // 电池 6V、内阻 0.5；并联支路 R10 与 原环 31.51Ω → 并联总阻 ≈ 7.62 → I ≈ 0.742
  const Rext = 31.51, Rp = (R * Rext) / (R + Rext)
  const Ibat = 6 / (0.5 + Rp)
  ok('并联分流正确', near(Math.abs(s.currents.get(1)), Ibat, 0.01), `Ibat=${Math.abs(s.currents.get(1)).toFixed(3)} 理论 ${Ibat.toFixed(3)}`)
  ok('新支路有电流', Math.abs(s.currents.get(5)) > 0.1, `I=${Math.abs(s.currents.get(5)).toFixed(3)}`)
}

console.log(`\n${pass} 通过, ${fail} 失败`)
if (fail) process.exit(1)
