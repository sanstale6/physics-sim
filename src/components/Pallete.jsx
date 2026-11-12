import { memo } from 'react'
import { registry } from '../sim/registry.js'
import { presets } from '../sim/presets.js'

const GROUPS = [
  ['力学', ['select', 'particle', 'block', 'ball', 'incline', 'ground', 'track', 'conveyor', 'constantForce', 'spring', 'rope', 'pulley', 'pendulum']],
  ['电磁', ['charge', 'uniformE', 'uniformB', 'metalRod', 'magnet', 'compass', 'solenoid', 'electronGun', 'plates', 'cyclotron']],
  ['电路', ['battery', 'wire', 'junction', 'resistor', 'rheostat', 'bulb', 'switch', 'ammeter', 'voltmeter', 'capacitor']],
  ['光学', ['lightSource', 'mirror', 'lens', 'screen']],
]
const BY_TYPE = Object.fromEntries(GROUPS.flatMap(([, ts]) => ts.map(t => [t, true])))

function Pallete({ tool, onPick, onLoadPreset }) {
  const extra = Object.keys(registry).filter(k => !BY_TYPE[k] && k !== 'select')
  return (
    <div className="pallete">
      <div className="pal-scroll">
      {GROUPS.map(([label, types]) => (
        <div className="pal-group" key={label}>
          <span className="pal-label">{label}</span>
          {types.filter(t => t === 'select' || registry[t]).map(t => (
            <button key={t} className={tool === t ? 'active' : ''}
              onPointerDown={(e) => { e.preventDefault(); onPick(t) }}
              title={registry[t]?.name ?? '选择/移动'}>
              {t === 'select' ? '☝ 选择' : registry[t].name}
            </button>
          ))}
        </div>
      ))}
      {extra.length > 0 && (
        <div className="pal-group">
          <span className="pal-label">其他</span>
          {extra.map(t => (
            <button key={t} className={tool === t ? 'active' : ''}
              onPointerDown={(e) => { e.preventDefault(); onPick(t) }}>
              {registry[t].name}
            </button>
          ))}
        </div>
      )}
      </div>
      <select className="pal-preset" value="" onChange={(e) => { if (e.target.value) { onLoadPreset(e.target.value); e.target.value = '' } }}>
        <option value="" disabled>📖 真题预设…</option>
        {Object.keys(presets).map(k => <option key={k} value={k}>{k}</option>)}
      </select>
    </div>
  )
}

// 元件栏有 30+ 个按钮，props 都是稳定引用，用 memo 避免每次面板刷新都重建整棵按钮树
export default memo(Pallete)
