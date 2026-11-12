import { useCallback, useEffect, useRef, useState } from 'react'
import SimCanvas from './components/SimCanvas.jsx'
import Inspector from './components/Inspector.jsx'
import Pallete from './components/Pallete.jsx'
import Toolbar from './components/Toolbar.jsx'
import StatusBar from './components/StatusBar.jsx'
import SceneIO from './components/SceneIO.jsx'
import DataPanel from './components/DataPanel.jsx'
import Help from './components/Help.jsx'
import { useSim } from './hooks/useSim.js'
import { presets } from './sim/presets.js'
import { CIRCUIT_TYPES, placeCircuit, findParallel } from './sim/circuit.js'
import { registry } from './sim/registry.js'
import { snapToIncline } from './sim/place.js'
import { sceneFromHash } from './sim/share.js'

export default function App() {
  const sim = useSim()
  const [tool, setTool] = useState('select')
  const [selected, setSelected] = useState(null)
  const [showInspector, setShowInspector] = useState(false)
  const [showForces, setShowForces] = useState(true)
  const [showB, setShowB] = useState(true)
  const [showHelp, setShowHelp] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(0)

  // 轻提示（载入预设、导入场景等）
  const notify = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2200)
  }, [])

  // 载入新场景后自动把视角调整到能看见全部元件
  const fitView = useCallback(() => {
    setTimeout(() => window.dispatchEvent(new CustomEvent('sim-fit')), 60)
  }, [])

  const pick = useCallback((id) => { setSelected(id); setShowInspector(true) }, [])

  const pickTool = useCallback((t) => {
    setTool(t)
    if (t === 'select') setShowInspector(false)
  }, [])

  const place = useCallback((x, y) => {
    let px = x, py = y, angle = 0, parLen = null, extra = null
    const snap = snapToIncline(tool, x, y, sim.objsRef.current)
    if (snap) { px = snap.x; py = snap.y; angle = snap.angle }
    else if (CIRCUIT_TYPES.includes(tool)) {
      const d = registry[tool].defaults()
      // 并联对齐：附近存在「等长 + 平行 + 贴近」的一对连接点 → 对齐到该对并延展引线接上
      // 长度匹配用「按下的起点到落点距离」（拖动塑形语义）；鼠标直接点按没有意义距离，退回默认长度
      const st = placeStartRef.current
      const dragLen = (st && Math.hypot(x - st.x, y - st.y) > 12) ? Math.hypot(x - st.x, y - st.y) : 0
      const par = (dragLen && findParallel(x, y, dragLen, d.angle ?? 0, sim.objsRef.current))
        || findParallel(x, y, d.len ?? 90, d.angle ?? 0, sim.objsRef.current)
      if (par) {
        px = par.cx; py = par.cy; parLen = par.len; angle = par.angle
        extra = { _par: { a1: par.a1, a2: par.a2 } }
      } else {
        const t = placeCircuit(x, y, d.len ?? 90, d.angle ?? 0, sim.objsRef.current)
        px = t.x; py = t.y
      }
    }
    const props = (parLen != null || extra) ? { ...(parLen != null ? { len: parLen } : {}), ...(extra ?? {}) } : undefined
    const id = sim.add(tool, px, py, props, angle)
    if (id != null) notify('已放置：' + (registry[tool]?.name ?? tool))
    setSelected(id); setShowInspector(true)
  }, [sim, tool])

  // 触摸放置/拖动的起点（用于并联对齐的长度匹配）
  const placeStartRef = useRef({ x: -1e9, y: -1e9 })

  const loadPreset = useCallback((name) => {
    sim.loadScene(presets[name])
    setSelected(null); setShowInspector(false)
    notify('已载入预设：' + name)
    fitView()
  }, [sim, notify, fitView])

  // 打开分享链接（#scene=…）时自动载入场景
  useEffect(() => {
    const items = sceneFromHash()
    if (items) { sim.loadScene(items); notify('已载入分享的场景'); fitView() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 键盘快捷键（桌面/平板外接键盘）
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      const meta = e.ctrlKey || e.metaKey
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) sim.redo(); else sim.undo()
        return
      }
      if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); sim.redo(); return }
      if (e.code === 'Space') { e.preventDefault(); sim.setRunning(!sim.running); return }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected != null) { e.preventDefault(); sim.remove(selected); setSelected(null); setShowInspector(false) }
        return
      }
      if (e.key === 'Escape') { setShowInspector(false); pickTool('select'); return }
      if (e.key === 'f' || e.key === 'F') setShowForces(v => !v)
      const step = e.shiftKey ? 1 : 10
      const arrow = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
      if (arrow && selected != null) {
        e.preventDefault()
        const o = sim.objsRef.current.find(o => o.id === selected)
        if (o) sim.dragTo(selected, o.x + arrow[0], o.y + arrow[1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sim.undo, sim.redo, sim.remove, sim.setRunning, sim.running, selected, pickTool])

  const sel = selected != null ? sim.getObject(selected) : null
  const selBody = selected != null ? sim.objsRef.current.find(o => o.id === selected)?.body : null

  return (
    <div className="app">
      <header className="topbar">
        <h1>物理模拟器<small>高中 Demo</small></h1>
        <Toolbar running={sim.running} onPlay={() => sim.setRunning(true)}
          onPause={() => sim.setRunning(false)} onReset={sim.reset} onClear={sim.clear}
          showForces={showForces} onToggleForces={() => setShowForces(v => !v)}
          showB={showB} onToggleB={() => setShowB(v => !v)}
          onUndo={sim.undo} onRedo={sim.redo} canUndo={sim.canUndo} canRedo={sim.canRedo}
          onHelp={() => setShowHelp(true)} gravity={sim.gravity} onToggleGravity={() => sim.setGravity(!sim.gravity)}
          coulomb={sim.coulomb} onToggleCoulomb={() => sim.setCoulomb(!sim.coulomb)}
          speed={sim.speed} onSpeed={sim.setSpeed}
          tool={tool} onToolSelect={() => pickTool('select')} />
      </header>
      <div className="main">
        <div className="canvas-wrap">
          <SimCanvas sim={sim} tool={tool} epoch={sim.epoch}
            placeStartRef={placeStartRef}
            onPlace={place} onPick={pick} onTap={pick}
            onSelectEmpty={() => setShowInspector(false)}
            selectedId={selected} showForces={showForces} showB={showB} />
          <DataPanel body={selBody} time={sim.time} running={sim.running} />
        </div>
          {showInspector && <button className="backdrop" aria-label="关闭属性面板" onClick={() => setShowInspector(false)} />}
        <Inspector object={sel} onChange={(k, v) => sim.update(selected, k, v)}
          onDelete={() => { sim.remove(selected); setSelected(null); setShowInspector(false) }}
          open={showInspector} onClose={() => setShowInspector(false)} body={selBody}
          objs={sim.objsRef.current} />
      </div>
      <Pallete tool={tool} onPick={pickTool} onLoadPreset={loadPreset} />
      <SceneIO sim={sim} onClose={() => {}} />
      <StatusBar sim={sim} />
      <Help open={showHelp} onClose={() => setShowHelp(false)} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
