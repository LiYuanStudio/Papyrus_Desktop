import { Typography } from '@arco-design/web-react';
import { SUCCESS_COLOR, WARNING_COLOR, DANGER_COLOR } from './constants';
import type { LastResult } from './constants';

const kbdStyle: React.CSSProperties = {
  padding: '2px 8px',
  background: 'var(--color-fill-2)',
  border: '1px solid var(--color-border-2)',
  borderRadius: '4px',
  fontFamily: 'monospace',
  fontSize: '11px',
  marginRight: '4px',
};

interface KeyboardShortcutsProps {
  lastResult: LastResult | null;
}

export function KeyboardShortcuts({ lastResult }: KeyboardShortcutsProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '20px',
        padding: '16px',
        flexWrap: 'wrap',
      }}
    >
      <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
        <kbd style={kbdStyle}>Space/Enter</kbd> 揭晓
      </Typography.Text>
      <Typography.Text style={{ fontSize: '12px', color: DANGER_COLOR }}>
        <kbd style={kbdStyle}>1</kbd> 忘记
      </Typography.Text>
      <Typography.Text style={{ fontSize: '12px', color: WARNING_COLOR }}>
        <kbd style={kbdStyle}>2</kbd> 模糊
      </Typography.Text>
      <Typography.Text style={{ fontSize: '12px', color: SUCCESS_COLOR }}>
        <kbd style={kbdStyle}>3</kbd> 掌握
      </Typography.Text>
      {lastResult && (
        <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
          <kbd style={kbdStyle}>U</kbd> 撤销
        </Typography.Text>
      )}
      <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
        <kbd style={kbdStyle}>Esc</kbd> 退出
      </Typography.Text>
    </div>
  );
}
