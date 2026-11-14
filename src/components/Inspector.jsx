import { useEffect, useState } from 'react'
import { registry } from '../sim/registry.js'
import { solve, CIRCUIT_TYPES, resistance } from '../sim/circuit.js'

const ROTATABLE = new Set(['battery', 'wire', 'resistor', 'rheostat', 'bulb', 'switch', 'ammeter', 'voltmeter',
  'lightSource', 'mirror', 'lens', 'screen', 'constantForce', 'uniformB', 'uniformE'])

export default function Inspector({ object, onChange, onDelete, open, onClose, body, objs, rev = 0 }) {
  const [draft, setDraft] = useState({})
  const [vals, setVals] = useState({})
  const [text, setText] = useState({})   // 数字框的原始文本（允许 "-" / "1." 这类中间态）
  // rev = 场景重置计数：重置会把 props.U 之类改回放置值，草稿必须跟着刷新，否则面板显示旧值
  useEffect(() => { setDraft(object ? { ...object } : {}); setVals({}); setText({}) }, [object?.id, rev])
  if (!object || !open) return null   // 关闭即卸载：桌面上侧栏常驻时 ✕ 也要真的「返回」
  const fields = registry[object.type]?.fields || []
  const isCircuit = CIRCUIT_TYPES.includes(object.type)
  const circ = isCircuit && objs ? solve(objs) : null
  const I = circ?.currents?.get(object.id)
  const nodes = circ?.nodeOf?.get(object.id)
  const U = nodes ? circ.V[nodes.b] - circ.V[nodes.a] : null
  const setField = (k, v) => { setVals(d => ({ ...d, [k]: v })); setText(t => ({ ...t, [k]: String(v) })); onChange(k, v) }
  const typed = (k, raw) => {
    setText(t => ({ ...t, [k]: raw }))
    const v = parseFloat(raw)
    if (raw.trim() !== '' && !Number.isNaN(v)) setField(k, v)   // "-"/"." 等中间态只留在文本框里
  }
  return (
    <aside className={'inspector' + (open ? ' open' : '')}>
      <div className="insp-head">
        <h2>{registry[object.type]?.name || object.type}</h2>
        <button type="button" className="insp-close" aria-label="关闭"
          onPointerDown={e => { e.preventDefault(); e.stopPropagation(); onClose() }}>✕</button>
      </div>
      {fields.map(f => (
        <div className="field" key={f.key}>
          <label>
            <span className="fl">{f.label}{f.unit ? ` (${f.unit})` : ''}</span>
            <input className="fnum" type="number" step={f.step} inputMode="decimal"
              value={text[f.key] ?? String(vals[f.key] ?? draft[f.key] ?? 0)}
              onChange={(e) => typed(f.key, e.target.value)} />
          </label>
          <input type="range" min={f.min} max={f.max} step={f.step}
            value={Math.min(f.max, Math.max(f.min, vals[f.key] ?? draft[f.key] ?? 0))}
            onChange={(e) => setField(f.key, parseFloat(e.target.value))} aria-label={f.label} />
        </div>
      ))}
      {ROTATABLE.has(object.type) && !fields.some(f => f.key === 'angle') && (
        <div className="field">
          <label>
            <span className="fl">旋转 (°)</span>
            <input className="fnum" type="number" step={5} inputMode="decimal"
              value={text.angle ?? String(vals.angle ?? object.angle ?? 0)}
              onChange={(e) => typed('angle', e.target.value)} />
          </label>
          <input type="range" min={-180} max={180} step={5}
            value={Math.min(180, Math.max(-180, vals.angle ?? object.angle ?? 0))}
            onChange={(e) => setField('angle', parseFloat(e.target.value))} />
        </div>
      )}
      {object.type === 'switch' && (
        <button className={object.closed ? 'primary' : ''} style={{ marginBottom: '.5rem' }}
          onClick={() => onChange('closed', !object.closed)}>
          {object.closed ? '开关：闭合中（点按断开）' : '开关：断开中（点按闭合）'}
        </button>
      )}
      {isCircuit && I != null && (
        <div className="insp-readout">
          <div><span>I</span>{Math.abs(I).toFixed(3)} A</div>
          <div><span>U</span>{Math.abs(U ?? 0).toFixed(2)} V</div>
          {object.type !== 'battery' && object.type !== 'switch' && object.type !== 'wire' && object.type !== 'ammeter' && object.type !== 'voltmeter'
            ? <div><span>P</span>{(I * I * resistance({ props: object })).toFixed(2)} W</div> : null}
        </div>
      )}
      {!body && !isCircuit && (
        <div className="insp-readout">
          <div><span>x</span>{(object.x / 100).toFixed(2)} m</div>
          <div><span>y</span>{((560 - object.y) / 100).toFixed(2)} m</div>
        </div>
      )}
      {body && (
        <div className="insp-readout">
          <div><span>v</span>{(Math.hypot(body.velocity.x, body.velocity.y) * 0.6).toFixed(2)} m/s</div>
          <div><span>x</span>{(body.position.x / 100).toFixed(2)} m</div>
          <div><span>y</span>{((560 - body.position.y) / 100).toFixed(2)} m</div>
        </div>
      )}
      <button className="danger block-btn" onClick={onDelete}>🗑 删除元件</button>
    </aside>
  )
}