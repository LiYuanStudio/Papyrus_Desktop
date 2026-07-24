// 压缩包图标 —— 默认色走警告色 token(同 #FF7D00 值, 便于深浅主题统一调整)
const ZipIcon = ({ size = 24, color = 'var(--color-warning)' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="currentColor" style={{ color }}>
    <path fillRule="evenodd" clipRule="evenodd" d="M17.342 5c.647 0 1.261.312 1.676.85L21.44 9h22.115C44.906 9 46 10.015 46 11.267v29.466C46 41.985 44.906 43 43.556 43H4.444C3.094 43 2 41.985 2 40.733V7.363C2 6.059 2.977 5 4.182 5h13.16zM6 13v26h23v-3h2v-2h-1a1 1 0 01-1-1v-2a1 1 0 011-1h1v-2h-1a1 1 0 01-1-1v-2a1 1 0 011-1h1v-2h-1a1 1 0 01-1-1v-2a1 1 0 011-1h1v-2h-1a1 1 0 01-1-1v-2H6zm27 3h1a1 1 0 011 1v2a1 1 0 01-1 1h-1v2h1a1 1 0 011 1v2a1 1 0 01-1 1h-1v2h1a1 1 0 011 1v2a1 1 0 01-1 1h-1v2h1a1 1 0 011 1v2a1 1 0 01-1 1h-1.007v1H42V13h-9v3z" fill="currentColor"/>
  </svg>
);

export default ZipIcon;
