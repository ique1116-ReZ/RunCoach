export const PinConfirm = ({ onConfirm, onCancel }: {
  onConfirm: () => void
  onCancel: () => void
}) => (
  <div className="pin-confirm">
    <span>把起点设在这里？</span>
    <button className="primary" onClick={onConfirm}>✓ 确定</button>
    <button onClick={onCancel}>✗ 取消</button>
  </div>
)
