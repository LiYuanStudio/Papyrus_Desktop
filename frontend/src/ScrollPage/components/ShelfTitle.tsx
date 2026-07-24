import { Typography } from '@arco-design/web-react';
import type { ShelfTitleProps } from '../types';

const ShelfTitle = ({ children }: ShelfTitleProps) => (
  <Typography.Title
    heading={2}
    style={{ fontWeight: 400, lineHeight: 1, margin: '0 0 24px', fontSize: '20px', color: 'var(--color-text-3)' }}
  >
    {children}
  </Typography.Title>
);

export default ShelfTitle;