import { IconCheckCircle, IconCloseCircle, IconMinusCircle } from '@arco-design/web-react/icon';
import type { Card } from '../../api';
import { PRIMARY_COLOR, SUCCESS_COLOR, WARNING_COLOR, DANGER_COLOR } from '../../theme-constants';

export { PRIMARY_COLOR, SUCCESS_COLOR, WARNING_COLOR, DANGER_COLOR };

export type RatingGrade = 1 | 2 | 3;

// 评分色彩语义: 1=忘记(danger红) / 2=模糊(warning橙) / 3=掌握(success绿)。
// bgColor 由硬编码浅色(#FFF2F0 等)换成功能色 light token:
// 深色模式下 light 变体为半透明底,不再出现刺眼浅底(ResultToast 共用此配置,一并适配)。
export const RATING_CONFIG = {
  1: {
    label: '忘记',
    key: '1',
    color: DANGER_COLOR,
    bgColor: 'var(--color-danger-light)',
    desc: '短期内高频重现',
    icon: IconCloseCircle,
  },
  2: {
    label: '模糊',
    key: '2',
    color: WARNING_COLOR,
    bgColor: 'var(--color-warning-light)',
    desc: '稍后再次复习',
    icon: IconMinusCircle,
  },
  3: {
    label: '掌握',
    key: '3',
    color: SUCCESS_COLOR,
    bgColor: 'var(--color-success-light)',
    desc: '复习间隔翻倍',
    icon: IconCheckCircle,
  },
} as const;

export type StudyState = 'loading' | 'empty' | 'question' | 'answer' | 'submitting';

export interface StudyStats {
  studied: number;
  mastered: number;
  forgotten: number;
}

export interface LastResult {
  grade: RatingGrade;
  card: Card;
}
