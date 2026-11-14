import { solve, CIRCUIT_TYPES } from '../sim/circuit.js'
import { registry } from '../sim/registry.js'

export default function StatusBar({ sim, tool = 'select' }) {
  const objs = sim.objsRef.current
  const hasCircuit = objs.some(o => CIRCUIT_TYPES.includes(o.type))
  const res = hasCircuit ? solve(objs) : null
  const warn = res?.warnings?.[0]
  // 提示随工具变化：放置模式下告诉用户「点哪里、放什么」，避免选完元件不知道下一步
  const hint = tool !== 'select'
    ? `点击画布放置「${registry[tool]?.name ?? tool}」 · Esc 返回选择`
    : sim.count === 0
      ? '从下方元件栏选元件放置 · ❓查看全部操作'
      : '单指拖空白平移 · 双指缩放 · 点选元件调参 · ❓查看全部操作'
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
      <span className="hint">{hint}</span>
    </footer>
  )
}