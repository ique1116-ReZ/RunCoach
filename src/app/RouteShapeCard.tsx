import type { CourseRouteShape } from '@/routing/cycling-route'

export const RouteShapeCard = ({ onPick, onCancel }: {
  onPick: (shape: CourseRouteShape) => void
  onCancel: () => void
}) => (
  <div className="choice-card">
    <div className="choice-head">
      <span>想生成哪种骑行路线？</span>
      <button className="choice-x" onClick={onCancel} aria-label="取消路线生成">✕</button>
    </div>
    <div className="choice-opts">
      <button className="choice-opt" onClick={() => onPick('loop')}>
        <span className="emoji">↻</span>骑行环线<small>从起点出发，绕一圈回来</small>
      </button>
      <button className="choice-opt" onClick={() => onPick('out_and_back')}>
        <span className="emoji">⇄</span>单线往返<small>沿同一条路线骑到折返点</small>
      </button>
    </div>
  </div>
)
