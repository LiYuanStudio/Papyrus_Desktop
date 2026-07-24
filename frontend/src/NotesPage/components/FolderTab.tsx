import { IconFolder } from '@arco-design/web-react/icon';
import { PRIMARY_COLOR } from '../constants';
import { useTranslation } from 'react-i18next';

interface FolderTabProps {
  folder: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}

export const FolderTab = ({ folder, count, isActive, onClick }: FolderTabProps) => {
  const { t } = useTranslation();
  // '__all_notes__' 是前端内部键，显示时需翻译为对应语言标签
  const displayName = folder === '__all_notes__' ? t('notesPage.allNotes') : folder;

  return (
  <div
    onClick={onClick}
    style={{
      padding: '10px 16px',
      borderRadius: 'var(--radius-md)',
      cursor: 'pointer',
      // 修复: `${PRIMARY_COLOR}15` 会拼出 "var(--color-primary)15" 无效 CSS,选中底色静默失效;
      // 改用 --color-primary-light token(深色模式同步正确)
      background: isActive ? 'var(--color-primary-light)' : 'transparent',
      border: `1px solid ${isActive ? PRIMARY_COLOR : 'transparent'}`,
      transition: 'all var(--duration-normal) var(--ease-standard)',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      minWidth: '100px',
      maxWidth: '140px',
      justifyContent: 'flex-start',
      height: '52px',
      boxSizing: 'border-box' as const,
      flexShrink: 0,
    }}
  >
    <IconFolder style={{ 
      fontSize: '16px', 
      color: isActive ? PRIMARY_COLOR : 'var(--color-text-3)',
      flexShrink: 0,
    }} />
    <div style={{ 
      textAlign: 'left', 
      overflow: 'hidden',
      minWidth: 0,
    }}>
      <div style={{ 
        fontSize: '14px', 
        fontWeight: isActive ? 500 : 400,
        color: isActive ? PRIMARY_COLOR : 'var(--color-text-1)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {displayName}
      </div>
      <div style={{ 
        fontSize: '11px', 
        color: 'var(--color-text-3)', 
        marginTop: '4px',
        whiteSpace: 'nowrap',
      }}>
        {count} {t('common.notesUnit')}
      </div>
    </div>
  </div>
  );
};
