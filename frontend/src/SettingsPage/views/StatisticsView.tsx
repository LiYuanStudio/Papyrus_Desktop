import { Button, Typography } from '@arco-design/web-react';
import { IconArrowLeft } from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import ChartsPage from '../../ChartsPage/ChartsPage';

/**
 * 描述设置内统计视图返回设置主页所需的回调。
 * 原因：统计页现由设置页托管，必须提供与其他设置详情一致的返回路径。
 * 未直接操作设置状态：父组件继续作为分类状态的唯一来源。
 */
interface StatisticsViewProps {
  onBack: () => void;
}

/**
 * 在设置详情容器中承载原有学习统计页面。
 * 原因：复用 ChartsPage 可保持统计计算、窗景和数据刷新行为完全一致。
 * 未复制统计组件：复制会产生两套数据请求与展示逻辑，后续难以同步维护。
 */
const StatisticsView = ({ onBack }: StatisticsViewProps) => {
  const { t } = useTranslation();

  return (
    <div className="settings-statistics-view">
      <div className="settings-statistics-header">
        <Button
          type="text"
          icon={<IconArrowLeft />}
          onClick={onBack}
          aria-label={t('settings.back')}
          className="settings-statistics-back"
        />
        <Typography.Text className="settings-statistics-header-title">
          {t('chartsPage.title')}
        </Typography.Text>
      </div>
      <div className="settings-statistics-content">
        <ChartsPage />
      </div>
    </div>
  );
};

export default StatisticsView;
