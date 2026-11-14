import { useEffect, useRef, useState } from 'react'

// 顶栏：工具（选择/撤销/重做）+ 运行控制（播放/暂停/速度）+ 显示选项（弹出面板）+ 重置/帮助/清空
// 显示类开关原来平铺成 4 个按钮，加上其它控件共 10 个，窄屏要折两行；
// 收进「显示」面板后顶栏只剩 6 个控件，一行放得下，四个开关的状态也一眼可见。
export default function Toolbar({
  running, onPlay, onPause, onReset, onClear, showForces, onToggleForces,
  onUndo, onRedo, canUndo, canRedo, onHelp, gravity, onToggleGravity,
  speed, onSpeed, tool, onToolSelect, showB, onToggleB,
  coulomb, onToggleCoulomb,
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  // 点面板外面 / 按 Esc 收起
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // 角标只统计「偏离默认」的项（默认：受力开、磁感线开、重力开、电荷力开），
  // 这样默认状态下顶栏干净；一旦失重 / 忽略电荷力这类会改变物理结果的状态被打开，才亮角标提醒
  const changed = [!showForces && '受力分析关', !showB && '磁感线关', !gravity && '失重', !coulomb && '忽略电荷力']
    .filter(Boolean)

  return (
    <div className="toolbar">
      <button className={tool === 'select' ? 'active' : ''} onClick={onToolSelect} title="选择模式 (Esc)" aria-label="选择模式">☝ 选择</button>
      <button onClick={onUndo} disabled={!canUndo} title="撤销 (Ctrl+Z)" aria-label="撤销">↶</button>
      <button onClick={onRedo} disabled={!canRedo} title="重做 (Ctrl+Shift+Z)" aria-label="重做">↷</button>
      {running
        ? <button className="primary running" onClick={onPause} title="暂停 (空格)">⏸ 暂停</button>
        : <button className="primary" onClick={onPlay} title="运行 (空格)">▶ 运行</button>}
      <label className="speed" title="模拟速度倍率">
        <span>⏩</span>
        <select value={speed} onChange={e => onSpeed(Number(e.target.value))} aria-label="运行速度">
          <option value={0.25}>0.25×</option>
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={4}>4×</option>
        </select>
      </label>

      <div className="disp-wrap" ref={wrapRef}>
        <button className={open || changed.length ? 'active' : ''} onClick={() => setOpen(v => !v)}
          title={'显示选项：受力分析 / 磁感线 / 重力 / 电荷相互作用' + (changed.length ? `（当前：${changed.join('、')}）` : '')}
          aria-expanded={open}>
          👁 显示{changed.length ? ` · ${changed.length}` : ''}
        </button>
        {open && (
          <div className="disp-menu" role="dialog" aria-label="显示选项">
            <label className="disp-row">
              <input type="checkbox" checked={!!showForces} onChange={onToggleForces} />
              <span>受力分析<small>物体的受力矢量</small></span>
            </label>
            <label className="disp-row">
              <input type="checkbox" checked={!!showB} onChange={onToggleB} />
              <span>磁感线<small>磁铁/螺线管的场线</small></span>
            </label>
            <label className="disp-row">
              <input type="checkbox" checked={!!gravity} onChange={onToggleGravity} />
              <span>重力 g<small>关掉 = 失重环境</small></span>
            </label>
            <label className="disp-row">
              <input type="checkbox" checked={!!coulomb} onChange={onToggleCoulomb} />
              <span>电荷相互作用<small>关掉后只有外加场起作用</small></span>
            </label>
          </div>
        )}
      </div>

      <button onClick={onReset} title="物体回到初始位置，并清空电流/电荷/速度等运行状态">⟲ 重置</button>
      <button onClick={onHelp} title="操作说明" aria-label="操作说明">❓</button>
      <button className="danger" onClick={onClear}>清空</button>
    </div>
  )
}
