import { useState, useEffect, useMemo } from 'react';
import { Modal, Message, Button, Spin } from '@arco-design/web-react';
import { IconDownload } from '@arco-design/web-react/icon';
import DOMPurify from 'dompurify';
import mammoth from 'mammoth/mammoth.browser';
import { getFileUrl } from '../api';
import type { FileItemData } from '../api';
import i18n from '../i18n';

interface FilePreviewModalProps {
  file: FileItemData | null;
  onClose: () => void;
}

function getFileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function isPreviewableDocument(file: FileItemData): boolean {
  if (file.type !== 'document') return false;
  const ext = getFileExtension(file.name);
  return ['txt', 'md', 'json', 'pdf', 'docx'].includes(ext);
}

function isPreviewable(file: FileItemData): boolean {
  if (file.is_folder) return false;
  if (['image', 'video', 'audio'].includes(file.type)) return true;
  if (isPreviewableDocument(file)) return true;
  return false;
}

export default function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  const [textContent, setTextContent] = useState<string>('');
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState(false);
  const [docxHtml, setDocxHtml] = useState<string>('');
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxError, setDocxError] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [mediaErrorType, setMediaErrorType] = useState<string>('');
  const [pdfError, setPdfError] = useState(false);

  const previewUrl = useMemo(() => {
    if (!file) return '';
    return getFileUrl(file.id, 'preview');
  }, [file]);

  const downloadUrl = useMemo(() => {
    if (!file) return '';
    return getFileUrl(file.id, 'download');
  }, [file]);

  const handleClose = () => {
    onClose();
  };

  useEffect(() => {
    if (!file) {
      setTextContent('');
      setTextError(false);
      setDocxHtml('');
      setDocxError(false);
      setImageLoading(false);
      setMediaError(false);
      setMediaErrorType('');
      setPdfError(false);
      return;
    }

    let cancelled = false;
    const ext = getFileExtension(file.name);
    if (['txt', 'md', 'json'].includes(ext)) {
      setTextLoading(true);
      setTextError(false);
      fetch(previewUrl)
        .then(res => {
          if (!res.ok) throw new Error('加载失败');
          return res.text();
        })
        .then(text => {
          if (!cancelled) setTextContent(text);
        })
        .catch(() => {
          if (cancelled) return;
          setTextError(true);
          Message.error(i18n.t('filePreview.loadFailed'));
        })
        .finally(() => {
          if (!cancelled) setTextLoading(false);
        });
    } else if (ext === 'docx') {
      setDocxLoading(true);
      setDocxError(false);
      fetch(previewUrl)
        .then(res => {
          if (!res.ok) throw new Error('加载失败');
          return res.arrayBuffer();
        })
        .then(buf => mammoth.convertToHtml({ arrayBuffer: buf }))
        .then(({ value }) => {
          if (!cancelled) setDocxHtml(DOMPurify.sanitize(value));
        })
        .catch(() => {
          if (cancelled) return;
          setDocxError(true);
          Message.error(i18n.t('filePreview.docxParseFailed'));
        })
        .finally(() => {
          if (!cancelled) setDocxLoading(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [file, previewUrl]);

  const renderPreview = () => {
    if (!file) return null;
    const ext = getFileExtension(file.name);

    if (!isPreviewable(file)) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: '16px', color: 'var(--color-text-2)', marginBottom: '16px' }}>
            {i18n.t('filePreview.unsupportedPreview')}
          </div>
          <Button type="primary" icon={<IconDownload />} href={downloadUrl} target="_blank">
            {i18n.t('filePreview.downloadFile')}
          </Button>
        </div>
      );
    }

    const handleMediaError = (type: string) => {
      if (!mediaError) {
        setMediaError(true);
        setMediaErrorType(type);
        Message.error(i18n.t('filePreview.loadFailedWithType', { type }));
      }
    };

    const renderMediaError = () => (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <div style={{ fontSize: '16px', color: 'var(--color-text-2)', marginBottom: '16px' }}>
          {i18n.t('filePreview.loadFailedWithType', { type: mediaErrorType })}
        </div>
        <Button type="primary" icon={<IconDownload />} href={downloadUrl} target="_blank">
          {i18n.t('filePreview.downloadFile')}
        </Button>
      </div>
    );

    switch (file.type) {
      case 'image':
        if (mediaError) return renderMediaError();
        return (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', maxHeight: '70vh', overflow: 'auto' }}>
            {imageLoading && (
              <div style={{ position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spin size={32} />
              </div>
            )}
            <img
              src={previewUrl}
              alt={file.name}
              style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', opacity: imageLoading ? 0 : 1, transition: 'opacity 0.2s' }}
              onLoad={() => setImageLoading(false)}
              onError={(e) => {
                setImageLoading(false);
                const target = e.currentTarget as HTMLImageElement;
                let errorMsg = '图片';
                if (target.naturalWidth === 0 && target.naturalHeight === 0) {
                  errorMsg = '图片加载失败（文件可能不存在或格式不支持）';
                } else {
                  errorMsg = '图片解码失败（文件可能已损坏）';
                }
                handleMediaError(errorMsg);
              }}
            />
          </div>
        );
      case 'video':
        if (mediaError) return renderMediaError();
        return (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <video
              src={previewUrl}
              controls
              style={{ maxWidth: '100%', maxHeight: '70vh' }}
              onError={() => handleMediaError('视频')}
            >
              您的浏览器不支持视频播放
            </video>
          </div>
        );
      case 'audio':
        if (mediaError) return renderMediaError();
        return (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <audio
              src={previewUrl}
              controls
              style={{ width: '100%', maxWidth: '500px' }}
              onError={() => handleMediaError('音频')}
            >
              您的浏览器不支持音频播放
            </audio>
          </div>
        );
      case 'document':
        if (ext === 'pdf') {
          if (pdfError) {
            return (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <div style={{ fontSize: '16px', color: 'var(--color-text-2)', marginBottom: '16px' }}>
                  PDF 加载失败（文件可能不存在或格式损坏）
                </div>
                <Button type="primary" icon={<IconDownload />} href={downloadUrl} target="_blank">
                  下载文件
                </Button>
              </div>
            );
          }
          return (
            <div style={{ height: '70vh' }}>
              <iframe
                src={previewUrl}
                title={file.name}
                style={{ width: '100%', height: '100%', border: 'none' }}
                sandbox="allow-scripts allow-same-origin"
                onLoad={() => {
                  setTimeout(() => {
                    const iframe = document.querySelector(`iframe[src="${previewUrl}"]`);
                    if (iframe) {
                      try {
                        const cw = (iframe as HTMLIFrameElement).contentWindow;
                        if (!cw && !pdfError) {
                          setPdfError(true);
                        }
                      } catch {
                      }
                    }
                  }, 3000);
                }}
              />
            </div>
          );
        }
        if (['txt', 'md', 'json'].includes(ext)) {
          if (textLoading) {
            return (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-3)' }}>
                加载中...
              </div>
            );
          }
          if (textError) {
            return (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-2)' }}>
                文件内容加载失败
              </div>
            );
          }
          return (
            <pre
              style={{
                maxHeight: '70vh',
                overflow: 'auto',
                padding: '16px',
                background: 'var(--color-fill-2)',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {textContent}
            </pre>
          );
        }
        if (ext === 'docx') {
          if (docxLoading) {
            return (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-3)' }}>
                加载中...
              </div>
            );
          }
          if (docxError) {
            return (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <div style={{ fontSize: '16px', color: 'var(--color-text-2)', marginBottom: '16px' }}>
                  DOCX 加载失败（文件可能不存在或格式损坏）
                </div>
                <Button type="primary" icon={<IconDownload />} href={downloadUrl} target="_blank">
                  下载文件
                </Button>
              </div>
            );
          }
          return (
            <div
              style={{
                maxHeight: '70vh',
                overflow: 'auto',
                padding: '24px',
                background: 'var(--color-bg-2)',
                borderRadius: 'var(--radius-md)',
                fontSize: '14px',
                lineHeight: 1.7,
              }}
              dangerouslySetInnerHTML={{ __html: docxHtml }}
            />
          );
        }
        return null;
      default:
        return null;
    }
  };

  return (
    <Modal
      title={
        <span
          style={{
            display: 'inline-block',
            maxWidth: '70vw',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            verticalAlign: 'bottom',
          }}
          title={file?.name}
        >
          {file?.name}
        </span>
      }
      visible={!!file}
      onCancel={handleClose}
      footer={null}
      autoFocus={false}
      focusLock
      style={{ width: 'auto', maxWidth: '90vw' }}
    >
      {file && renderPreview()}
    </Modal>
  );
}
