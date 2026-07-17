import { IconCheckCircle, IconCloseCircle, IconMinusCircle } from '@arco-design/web-react/icon';
import type { Card } from '../../api';
import { PRIMARY_COLOR, SUCCESS_COLOR, WARNING_COLOR, DANGER_COLOR } from '../../theme-constants';

export { PRIMARY_COLOR, SUCCESS_COLOR, WARNING_COLOR, DANGER_COLOR };

export type RatingGrade = 1 | 2 | 3;

export const RATING_CONFIG = {
  1: {
    label: '忘记',
    key: '1',
    color: DANGER_COLOR,
    bgColor: '#FFF2F0',
    desc: '短期内高频重现',
    icon: IconCloseCircle,
  },
  2: {
    label: '模糊',
    key: '2',
    color: WARNING_COLOR,
    bgColor: '#FFF7E8',
    desc: '稍后再次复习',
    icon: IconMinusCircle,
  },
  3: {
    label: '掌握',
    key: '3',
    color: SUCCESS_COLOR,
    bgColor: '#E8FFEA',
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
