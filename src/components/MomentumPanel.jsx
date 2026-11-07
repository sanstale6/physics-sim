import { registry } from '../sim/registry.js'

const MOVING = (o) => o.body && !o.body.isStatic

export default function MomentumPanel({ objs, running, tick }) {
  void tick
  const dyn = objs.filter(MOVING)
  if (dyn.length === 0) return null
  const px = dyn.reduce((s, o) => s + o.body.mass * o.body.velocity.x, 0)
  const py = dyn.reduce((s, o) => s + o.body.mass * o.body.velocity.y, 0)
  const ke = dyn.reduce((s, o) => s + 0.5 * o.body.mass * (o.body.velocity.x ** 2 + o.body.velocity.y ** 2), 0)
  const P = { x: px * 6, y: py * 6 }
  const rows = dyn.slice(0, 5).map((o) => {
    const m = o.props.m ?? 1
    const v = Math.hypot(o.body.velocity.x, o.body.velocity.y) * 0.6
    return { name: registry[o.type]?.name ?? o.type, m, v, p: m * v }
  })
  return (
    <div className="momentumpanel">
      <div className="dp-head"><strong>动量对账</strong>{running && <span className="dp-read">运行中</span>}</div>
      <table className="mp-table">
        <thead><tr><th>物体</th><th>m/kg</th><th>v/(m/s)</th><th>p</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}><td>{r.name}</td><td>{r.m}</td><td>{r.v.toFixed(2)}</td><td>{r.p.toFixed(2)}</td></tr>
          ))}
          <tr className="mp-total"><td>Σp</td><td>—</td><td>—</td><td>{P.x.toFixed(2)}</td></tr>
        </tbody>
      </table>
      <div className="mp-note">Σp<sub>y</sub> = {P.y.toFixed(2)} · ΣE<sub>k</sub> = {ke.toFixed(2)} J</div>
    </div>
  )
}