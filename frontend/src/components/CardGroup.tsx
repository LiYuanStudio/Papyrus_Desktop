import { Spin, Typography, Empty } from '@arco-design/web-react';
import { type ReactNode } from 'react';

interface CardGroupProps {
  /** 卡片列表 */
  children?: ReactNode;
  /** 容器高度 */
  height: number;
  /** 是否正在加载 */
  loading?: boolean;
  /** 空状态文本 */
  emptyText?: string;
  /** 卡片间距 */
  gap?: number;
  /** 是否显示空状态图标 */
  showEmptyIcon?: boolean;
}

export const CardGroup = ({
  children,
  height,
  loading = false,
  emptyText,
  gap = 16,
  showEmptyIcon = false,
}: CardGroupProps) => {
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: `${gap}px`,
        height: `${height}px`,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Spin size={24} />
      </div>
    );
  }

  const hasChildren = children && (
    Array.isArray(children) ? children.length > 0 : true
  );

  if (!hasChildren) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: showEmptyIcon ? 'column' : 'row',
        gap: showEmptyIcon ? '8px' : `${gap}px`,
        height: `${height}px`,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {showEmptyIcon && emptyText ? (
          <Empty description={emptyText} />
        ) : (
          emptyText && <Typography.Text type="secondary">{emptyText}</Typography.Text>
        )}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      gap: `${gap}px`,
      height: `${height}px`,
      overflowX: 'auto',
      overflowY: 'hidden',
      paddingBottom: '20px',
    }}>
      {children}
    </div>
  );
};
