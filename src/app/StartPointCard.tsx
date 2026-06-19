export const StartPointCard = ({ onCurrent, onManual, onCancel, message }: {
  onCurrent: () => void
  onManual: () => void
  onCancel: () => void
  message?: string
}) => (
  <div className="choice-card">
    <div className="choice-head">
      <span>从哪出发？</span>
      <button className="choice-x" onClick={onCancel}>✕</button>
    </div>
    <div className="choice-opts">
      <button className="choice-opt" onClick={onCurrent}><span className="emoji">📍</span>当前位置<small>用浏览器定位</small></button>
      <button className="choice-opt" onClick={onManual}><span className="emoji">🗺</span>手动选点<small>在地图上点一下</small></button>
    </div>
    {message && <div className="choice-msg">{message}</div>}
  </div>
)
