const ROWS = [
  ['单指拖动空白', '平移视角（看别处的装置）'],
  ['双指捏合', '缩放视角（0.3×–4×）'],
  ['点元件', '选中并打开右侧属性面板'],
  ['拖动元件', '移动它；恒力/场区/磁场元件可拖到任意位置'],
  ['点空白 + 已选元件', '在新位置放置该元件'],
  ['右下角 ⤢ / ＋ / － / ⟲', '显示全部 / 放大 / 缩小 / 复位视角'],
  ['顶部 ▶ 运行', '开始模拟；空格键同样可以运行/暂停'],
  ['受力 按钮', '显示重力、支持力、摩擦力和合力分解'],
  ['📖 真题预设', '一键载入平抛、斜面、带电粒子、传送带、单摆等场景'],
  ['🔗 分享链接', '把当前场景编码进网址，发给别人直接打开'],
]

export default function Help({ open, onClose }) {
  if (!open) return null
  return (
    <div className="helpwrap" onClick={onClose}>
      <div className="helpbox" onClick={(e) => e.stopPropagation()}>
        <h2>操作说明</h2>
        <table>
          <tbody>
            {ROWS.map(([k, v]) => (
              <tr key={k}><th>{k}</th><td>{v}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="helptip">提示：100 px = 1 m，g = 9.8 m/s²。质量单位 kg，电荷单位 μC，磁感应强度单位 T。</p>
        <button type="button" className="primary" onPointerDown={e => { e.preventDefault(); onClose() }}>知道了</button>
      </div>
    </div>
  )
}
