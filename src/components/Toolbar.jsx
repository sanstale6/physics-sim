export default function Toolbar({
  running, onPlay, onPause, onReset, onClear, showForces, onToggleForces,
  onUndo, onRedo, canUndo, canRedo, onHelp, gravity, onToggleGravity,
  speed, onSpeed, tool, onToolSelect, showB, onToggleB,
}) {
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
      <button className={showForces ? 'active' : ''} onClick={onToggleForces} title="显示受力分析">受力</button>
      <button className={showB ? 'active' : ''} onClick={onToggleB} title="显示磁感线">磁感线</button>
      <button className={gravity ? '' : 'active'} onClick={onToggleGravity} title="重力开关（失重演示）">{gravity ? 'g 重力' : '失重'}</button>
      <button onClick={onReset} title="物体回到初始位置">⟲ 重置</button>
      <button onClick={onHelp} title="操作说明" aria-label="操作说明">❓</button>
      <button className="danger" onClick={onClear}>清空</button>
    </div>
  )
}
