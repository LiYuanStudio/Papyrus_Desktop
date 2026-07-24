import { PRIMARY_COLOR } from '../theme-constants';

export { PRIMARY_COLOR };

// 统一按钮样式(胶囊圆角改走 --radius-xl token,值同为 20px,与设计阶梯对齐)
export const UNIFIED_BTN_STYLE = {
  height: '40px',
  borderRadius: 'var(--radius-xl)',
  padding: '0 20px',
  fontSize: '14px',
};

// 卡片高度
export const CARD_HEIGHT = 200;

// 默认大纲模板
export const DEFAULT_OUTLINE = [
  { id: '1', title: '核心概念', level: 2 },
  { id: '2', title: '详细说明', level: 2 },
  { id: '3', title: '实例分析', level: 2 },
  { id: '4', title: '参考资料', level: 2 },
];

// 默认笔记内容模板
export const getDefaultContent = (title: string) => `## 核心概念

这里是关于 ${title} 的核心概念说明。

### 要点一
详细阐述第一个要点...

### 要点二
详细阐述第二个要点...

## 详细说明

展开详细的内容描述，可以包含：
- 理论推导
- 实际应用
- 注意事项

## 实例分析

通过具体例子加深理解：

**例1**：简单示例说明...

**例2**：进阶示例说明...

## 参考资料

- [相关笔记链接]
- [外部参考资料]
`;
