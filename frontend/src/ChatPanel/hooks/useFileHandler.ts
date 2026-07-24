import { useState, useRef, useCallback } from 'react';
import { Message as ArcoMessage } from '@arco-design/web-react';
import type { SelectedFile } from '../types';
import {
  validateFiles,
  formatFileSize,
  getFileIcon,
  MAX_FILES,
} from '../utils';

export interface UseFileHandlerReturn {
  selectedFiles: SelectedFile[];
  setSelectedFiles: React.Dispatch<React.SetStateAction<SelectedFile[]>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileSelect: () => void;
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  removeFile: (fileId: string) => void;
  clearAllFiles: () => void;
  getFileIcon: (type: 'image' | 'document' | 'unknown', name: string) => React.ReactElement;
  formatFileSize: (bytes: number) => string;
}

export function useFileHandler(): UseFileHandlerReturn {
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { validFiles, errors } = validateFiles(e.target.files, selectedFiles);

    if (errors.length > 0) {
      errors.slice(0, 3).forEach((err) => ArcoMessage.error(err));
      if (errors.length > 3) {
        ArcoMessage.error(`还有 ${errors.length - 3} 个文件未添加`);
      }
    }

    if (validFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...validFiles]);
    }

    e.target.value = '';
  }, [selectedFiles]);

  const removeFile = useCallback((fileId: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const clearAllFiles = useCallback(() => {
    setSelectedFiles([]);
  }, []);

  return {
    selectedFiles,
    setSelectedFiles,
    fileInputRef,
    handleFileSelect,
    handleFileInputChange,
    removeFile,
    clearAllFiles,
    getFileIcon,
    formatFileSize,
  };
}

export { MAX_FILES };
