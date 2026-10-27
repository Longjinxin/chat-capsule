/**
 * CapsuleTooltip：收起态胶囊悬停时显示的提示浮层（独立窗口）。
 */
export default function CapsuleTooltip() {
  return (
    <div className="capsule-tooltip-window">
      <span className="capsule-tooltip-arrow" aria-hidden="true" />
      <span className="capsule-tooltip-text">打开聊天胶囊</span>
    </div>
  );
}
