import { solve, CIRCUIT_TYPES } from '../sim/circuit.js'

export default function StatusBar({ sim }) {
  const objs = sim.objsRef.current
  const hasCircuit = objs.some(o => CIRCUIT_TYPES.includes(o.type))
  const res = hasCircuit ? solve(objs) : null
  const warn = res?.warnings?.[0]
  return (
    <footer className="statusbar">
      <span className="sb-time">⏱ {sim.time.toFixed(2)} s</span>
      <span>元件 {sim.count}</span>
      {res && (
        <span className={warn ? 'warn' : ''}>
          ⚡ P={res.totalPower.toFixed(2)} W{warn ? ' · ' + warn.text : ''}
        </span>
      )}
      {!sim.gravity && <span className="warn">🪐 失重</span>}
      <span className="hint">单指拖空白平移 · 双指缩放 · 点选元件调参 · ❓查看全部操作</span>
    </footer>
  )
}