const IconScroll = () => (
  <svg width="1em" height="1em" viewBox="0 0 40 48" fill="currentColor">
    {/* 左侧矩形，右边开口，高度加大 */}
    <path d="M20 9 L4 9 Q2 9 2 11 L2 37 Q2 39 4 39 L20 39" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />

    {/* 圆柱左侧竖线 */}
    <line x1="26" y1="9" x2="26" y2="39" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    {/* 圆柱右侧竖线 */}
    <line x1="38" y1="9" x2="38" y2="39" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    {/* 圆柱顶部弧 */}
    <path d="M26 9 Q32 5 38 9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    {/* 圆柱底部弧 */}
    <path d="M26 39 Q32 43 38 39" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />

    {/* 顶部小啾啾套筒 */}
    <path d="M28 9 Q32 6 36 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M28 7 Q32 4.5 36 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export default IconScroll;
