import { IconFolder, IconImage, IconFileVideo, IconMusic, IconFile } from '@arco-design/web-react/icon';
import ZipIcon from './ZipIcon';
import { PRIMARY_COLOR } from '../theme-constants';

type FileItemType = 'folder' | 'image' | 'video' | 'audio' | 'document' | 'archive' | 'unknown';

interface FileIconProps {
  type: FileItemType;
  size?: number;
}

const FileIcon = ({ type, size = 40 }: FileIconProps) => {
  const iconStyle = { fontSize: size * 0.5, color: '#fff' };

  switch (type) {
    case 'folder':
      return (
        <div style={{
          width: size,
          height: size,
          borderRadius: '10px',
          background: PRIMARY_COLOR,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <IconFolder style={{ ...iconStyle, color: '#fff' }} />
        </div>
      );
    case 'image':
      return (
        <div style={{
          width: size,
          height: size,
          borderRadius: '10px',
          background: '#722ED1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <IconImage style={iconStyle} />
        </div>
      );
    case 'video':
      return (
        <div style={{
          width: size,
          height: size,
          borderRadius: '10px',
          background: 'var(--color-danger)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <IconFileVideo style={iconStyle} />
        </div>
      );
    case 'audio':
      return (
        <div style={{
          width: size,
          height: size,
          borderRadius: '10px',
          background: '#14C9C9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <IconMusic style={iconStyle} />
        </div>
      );
    case 'archive':
      return <ZipIcon size={size} />;
    default:
      return (
        <div style={{
          width: size,
          height: size,
          borderRadius: '10px',
          background: 'var(--color-fill-3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <IconFile style={{ ...iconStyle, color: 'var(--color-text-2)' }} />
        </div>
      );
  }
};

export default FileIcon;
