import { Typography, Modal, Input } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { CreateCardModalProps } from '../types';

const CreateCardModal = ({
  visible,
  question,
  answer,
  tags,
  isSubmitting,
  onVisibleChange,
  onQuestionChange,
  onAnswerChange,
  onTagsChange,
  onSubmit,
}: CreateCardModalProps) => {
  const { t } = useTranslation();

  const handleCancel = () => {
    onVisibleChange(false);
    onQuestionChange('');
    onAnswerChange('');
    onTagsChange('');
  };

  return (
    <Modal
      title={t('scrollPage.createCard')}
      visible={visible}
      onOk={onSubmit}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <Typography.Text style={{ display: 'block', marginBottom: 8 }}>{t('scrollPage.questionLabel')}</Typography.Text>
          <Input.TextArea
            value={question}
            onChange={onQuestionChange}
            placeholder={t('scrollPage.questionPlaceholder')}
            rows={3}
          />
        </div>
        <div>
          <Typography.Text style={{ display: 'block', marginBottom: 8 }}>{t('scrollPage.answerLabel')}</Typography.Text>
          <Input.TextArea
            value={answer}
            onChange={onAnswerChange}
            placeholder={t('scrollPage.answerPlaceholder')}
            rows={3}
          />
        </div>
        <div>
          <Typography.Text style={{ display: 'block', marginBottom: 8 }}>{t('scrollPage.tagsLabel')}</Typography.Text>
          <Input
            value={tags}
            onChange={onTagsChange}
            placeholder={t('scrollPage.tagsPlaceholder')}
          />
        </div>
      </div>
    </Modal>
  );
};

export default CreateCardModal;