import { memo, useEffect, useState } from 'react'
import { registry } from '../sim/registry.js'
import { presets } from '../sim/presets.js'

const GROUPS = [
  ['力学', ['select', 'particle', 'block', 'ball', 'incline', 'ground', 'track', 'conveyor', 'constantForce', 'gravity', 'spring', 'rope', 'pulley', 'pendulum']],
  ['电磁', ['charge', 'uniformE', 'uniformB', 'metalRod', 'magnet', 'compass', 'solenoid', 'electronGun', 'plates', 'cyclotron']],
  ['电路', ['battery', 'wire', 'junction', 'resistor', 'rheostat', 'bulb', 'switch', 'ammeter', 'voltmeter', 'diode', 'multimeter', 'capacitor']],
  ['光学', ['lightSource', 'mirror', 'lens', 'screen']],
]
const BY_TYPE = Object.fromEntries(GROUPS.flatMap(([, ts]) => ts.map(t => [t, true])))

// 底部元件栏：分类 tab + 当前分类的元件按钮 + 真题预设。
// 原来 39 个按钮排在一条横向滚动条里（手机上要划很久、桌面 1280px 也会把预设下拉挤出去），
// 改成分类后一次只显示一类（宽屏用 CSS 放开全部），预设下拉固定在右侧不会被挤掉。
function Pallete({ tool, onPick, onLoadPreset }) {
  const [gi, setGi] = useState(0)
  const extra = Object.keys(registry).filter(k => !BY_TYPE[k] && k !== 'select')
  const extraKey = extra.join(',')

  // 通过其它入口换了工具（比如快捷键/预设）时，把元件栏切到对应的分类，别让当前工具「藏起来」
  useEffect(() => {
    const i = GROUPS.findIndex(([, ts]) => ts.includes(tool))
    if (i >= 0) setGi(i)
    else if (extra.includes(tool)) setGi(GROUPS.length)
  }, [tool, extraKey])   // eslint-disable-line react-hooks/exhaustive-deps

  const btn = (t, label) => (
    <button key={t} className={tool === t ? 'active' : ''}
      onPointerDown={(e) => { e.preventDefault(); onPick(t) }}
      title={label}>
      {label}
    </button>
  )

  return (
    <div className="pallete">
      <div className="pal-tabs" role="tablist" aria-label="元件分类">
        {GROUPS.map(([label], i) => (
          <button key={label} role="tab" aria-selected={gi === i}
            className={'pal-tab' + (gi === i ? ' active' : '')}
            onPointerDown={(e) => { e.preventDefault(); setGi(i) }}>{label}</button>
        ))}
        {extra.length > 0 && (
          <button role="tab" aria-selected={gi === GROUPS.length}
            className={'pal-tab' + (gi === GROUPS.length ? ' active' : '')}
            onPointerDown={(e) => { e.preventDefault(); setGi(GROUPS.length) }}>其他</button>
        )}
      </div>
      <div className="pal-scroll">
        {GROUPS.map(([label, types], i) => (
          <div className={'pal-group' + (i === gi ? '' : ' hidden')} key={label}>
            <span className="pal-label">{label}</span>
            {types.filter(t => t === 'select' || registry[t]).map(t => btn(t, t === 'select' ? '☝ 选择' : registry[t].name))}
          </div>
        ))}
        {extra.length > 0 && (
          <div className={'pal-group' + (gi === GROUPS.length ? '' : ' hidden')}>
            <span className="pal-label">其他</span>
            {extra.map(t => btn(t, registry[t].name))}
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

// 元件栏有 40 个按钮，props 都是稳定引用，用 memo 避免每次面板刷新都重建整棵按钮树
export default memo(Pallete)
