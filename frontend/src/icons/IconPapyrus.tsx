/**
 * 绘制无背景的 Papyrus 品牌符号，并继承父元素的文字颜色。
 * 原因：侧边栏图标需要在普通、激活和深色状态间自动切换颜色。
 * 未直接使用 assets/icon.svg：原文件包含固定白色底板和黑色描边，无法融入导航按钮状态。
 */
const IconPapyrus = () => (
  <svg
    className="sidebar-start-icon"
    width="18"
    height="18"
    viewBox="-7.5 -7.5 15 15"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M0 2a2 2 0 10-2-2v6 M0 4a4 4 0 10-4-4v6 M0 6A6 6 0 10-6 0v6"
      transform="translate(0.3 -0.38)"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
    />
  </svg>
);

export default IconPapyrus;
