export const TerrainCard = ({ onPick, onCancel }: {
  onPick: (t: 'trail' | 'road') => void
  onCancel: () => void
}) => (
  <div className="choice-card">
    <div className="choice-head">
      <span>想跑哪种？</span>
      <button className="choice-x" onClick={onCancel}>✕</button>
    </div>
    <div className="choice-opts">
      <button className="choice-opt" onClick={() => onPick('trail')}><span className="emoji">🏔</span>越野跑<small>偏好山路步道</small></button>
      <button className="choice-opt" onClick={() => onPick('road')}><span className="emoji">🛣</span>路跑<small>走道路人行道</small></button>
    </div>
  </div>
)
