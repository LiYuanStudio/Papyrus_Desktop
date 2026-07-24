/**
 * Tailwind CSS 使用示例组件
 * 
 * 展示如何在项目中使用带前缀的 Tailwind 类名
 * 所有 Tailwind 类名都带有 'tw-' 前缀
 */

import { Button, Card, Space, Typography } from '@arco-design/web-react';

const { Title, Text } = Typography;

/**
 * Tailwind CSS 使用示例
 * 
 * 使用规则：
 * 1. 所有 Tailwind 类名必须带 'tw-' 前缀
 * 2. 可以使用 Arco Design 组件和 Tailwind 类名混合
 * 3. 主题颜色已映射到 Arco Design 的 CSS 变量
 */
export function TailwindExample() {
  return (
    <Card
      title="Tailwind CSS 使用示例"
      style={{ maxWidth: 600, margin: '20px auto' }}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {/* 基础布局示例 */}
        <Title heading={6}>1. 基础布局 (Flexbox)</Title>
        <div className="tw-flex tw-gap-4 tw-p-4 tw-bg-arco-bg-2 tw-rounded-arco-lg">
          <div className="tw-w-16 tw-h-16 tw-bg-primary tw-rounded-arco tw-flex tw-items-center tw-justify-center tw-text-white">
            Box 1
          </div>
          <div className="tw-w-16 tw-h-16 tw-bg-success tw-rounded-arco tw-flex tw-items-center tw-justify-center tw-text-white">
            Box 2
          </div>
          <div className="tw-w-16 tw-h-16 tw-bg-danger tw-rounded-arco tw-flex tw-items-center tw-justify-center tw-text-white">
            Box 3
          </div>
        </div>

        {/* 文字颜色示例 */}
        <Title heading={6}>2. 文字颜色 (与 Arco 主题同步)</Title>
        <div className="tw-space-y-2">
          <p className="tw-text-arco-text-1">主文字色 (text-1)</p>
          <p className="tw-text-arco-text-2">次要文字色 (text-2)</p>
          <p className="tw-text-arco-text-3">辅助文字色 (text-3)</p>
          <p className="tw-text-primary">主色调文字</p>
        </div>

        {/* 响应式示例 */}
        <Title heading={6}>3. 响应式设计</Title>
        <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-3 tw-gap-4">
          <div className="tw-p-4 tw-bg-arco-fill-2 tw-rounded-arco tw-text-center">
            移动端全宽
          </div>
          <div className="tw-p-4 tw-bg-arco-fill-2 tw-rounded-arco tw-text-center">
            平板端 1/3 宽
          </div>
          <div className="tw-p-4 tw-bg-arco-fill-2 tw-rounded-arco tw-text-center">
            桌面端 1/3 宽
          </div>
        </div>

        {/* 与 Arco 组件混用 */}
        <Title heading={6}>4. 与 Arco 组件混用</Title>
        <div className="tw-flex tw-gap-4 tw-items-center">
          <Button type="primary">Arco 按钮</Button>
          <span className="tw-px-3 tw-py-1 tw-bg-warning tw-text-white tw-rounded-arco">
            Tailwind 标签
          </span>
          <span className="tw-px-3 tw-py-1 tw-border tw-border-arco-border-2 tw-rounded-arco tw-text-arco-text-2">
            带边框标签
          </span>
        </div>

        {/* 深色模式自适应 */}
        <Title heading={6}>5. 深色模式自适应</Title>
        <Text type="secondary">
          所有颜色都使用 CSS 变量，自动适配深色/浅色模式
        </Text>
        <div className="tw-p-4 tw-bg-arco-bg-1 tw-border tw-border-arco-border-2 tw-rounded-arco-lg">
          <p className="tw-text-arco-text-1">这个框的背景和文字色会自动适应主题</p>
        </div>
      </Space>
    </Card>
  );
}

/**
 * 迁移指南组件
 * 展示如何将现有代码从 style 属性迁移到 Tailwind
 */
export function MigrationGuide() {
  return (
    <Card
      title="迁移指南：从 style 到 Tailwind"
      style={{ maxWidth: 600, margin: '20px auto' }}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title heading={6}>Before (使用 style):</Title>
        <pre style={{ 
          background: 'var(--color-fill-2)', 
          padding: 12, 
          borderRadius: 4,
          fontSize: 12 
        }}>
{`<div style={{ 
  display: 'flex', 
  flex: 1, 
  padding: '16px',
  backgroundColor: 'var(--color-bg-2)'
}} />`}
        </pre>

        <Title heading={6}>After (使用 Tailwind):</Title>
        <pre style={{ 
          background: 'var(--color-fill-2)', 
          padding: 12, 
          borderRadius: 4,
          fontSize: 12 
        }}>
{`<div className="tw-flex tw-flex-1 tw-p-arco-md tw-bg-arco-bg-2" />`}
        </pre>

        <Text type="secondary">
          所有类名都带 <code>tw-</code> 前缀，避免与 Arco Design 冲突
        </Text>
      </Space>
    </Card>
  );
}

export default TailwindExample;
