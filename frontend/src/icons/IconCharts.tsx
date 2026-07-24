/**
 * 描述统计图标允许设置页分类卡片传入的展示属性。
 * 原因：同一图标需要在不同容器中继承尺寸、颜色与类名。
 * 未接受任意 SVG 属性：限制公开接口可避免无意覆盖图标的固定视图框。
 */
interface IconChartsProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 绘制用于学习统计入口的柱状图图标。
 * 原因：复用项目原有图形可保持从主侧边栏迁移到设置页后的视觉连续性。
 * 未改用第三方图标：现有 Papyrus 图标已经形成稳定的产品识别。
 */
const IconCharts = ({ className, style }: IconChartsProps) => (
  <svg className={className} style={style} width="1em" height="1em" viewBox="0 0 48 48" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M44 44H4a1 1 0 01-1-1v-2a1 1 0 011-1h1V23.09C5 21.937 5.96 21 7.143 21H16V6.105C16 4.943 17.023 4 18.286 4h11.428C30.977 4 32 4.943 32 6.105V16h8.857c1.184 0 2.143.895 2.143 2v22h1a1 1 0 011 1v2a1 1 0 01-1 1zM16 25H9v15h7V25zm12-17h-8v32h8V8zm11 12h-7v20h7V20z" fill="currentColor" />
  </svg>
);

export default IconCharts;
