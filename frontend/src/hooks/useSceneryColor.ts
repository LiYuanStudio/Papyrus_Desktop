/**
 * 窗景颜色分析 Hook
 * 分析窗景图片的平均亮度，返回适合的文字颜色
 */
import { useState, useEffect, useCallback, useRef } from 'react';

export interface SceneryColorConfig {
  /** 是否使用亮色文字（白色） */
  useLightText: boolean;
  /** 推荐的主要文字颜色 */
  primaryTextColor: string;
  /** 推荐的次要文字颜色 */
  secondaryTextColor: string;
  /** 图片平均亮度 (0-255) */
  averageBrightness: number;
  /** 是否正在分析中 */
  analyzing: boolean;
}

// 亮度阈值：低于此值使用亮色文字，高于此值使用暗色文字
const BRIGHTNESS_THRESHOLD = 128;

// 缓存图片分析结果，避免重复分析
const colorCache = new Map<string, number>();

/**
 * 计算图片平均亮度
 * @param imageUrl 图片URL
 * @returns 平均亮度值 (0-255)
 */
const analyzeImageBrightness = (imageUrl: string): Promise<number> => {
  return new Promise((resolve) => {
    // 检查缓存
    if (colorCache.has(imageUrl)) {
      resolve(colorCache.get(imageUrl)!);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        // 采样较小的尺寸以提高性能
        const sampleSize = 100;
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(255); // 默认返回亮色
          return;
        }
        
        // 绘制图片到canvas
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
        
        // 获取像素数据
        const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
        const data = imageData.data;
        
        let totalBrightness = 0;
        let pixelCount = 0;
        
        // 采样像素（每4个像素采样一次，提高性能）
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          // 使用相对亮度公式计算亮度
          // 参考: https://www.w3.org/TR/WCAG20/#relativeluminancedef
          const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          totalBrightness += brightness;
          pixelCount++;
        }
        
        const averageBrightness = pixelCount > 0 ? totalBrightness / pixelCount : 255;
        
        // 缓存结果
        colorCache.set(imageUrl, averageBrightness);
        resolve(averageBrightness);
      } catch (error) {
        console.warn('分析图片颜色失败:', error);
        resolve(255); // 默认返回亮色
      }
    };
    
    img.onerror = () => {
      console.warn('加载图片失败:', imageUrl);
      resolve(255); // 默认返回亮色
    };
    
    // 设置超时
    setTimeout(() => {
      if (!colorCache.has(imageUrl)) {
        resolve(255);
      }
    }, 5000);
    
    img.src = imageUrl;
  });
};

/**
 * Hook: 分析窗景图片颜色并提供自适应文本颜色配置
 * @param imageUrl 窗景图片URL
 * @param enabled 窗景是否启用
 * @returns 颜色配置
 */
export const useSceneryColor = (
  imageUrl: string | undefined,
  enabled: boolean
): SceneryColorConfig => {
  const [config, setConfig] = useState<SceneryColorConfig>({
    useLightText: false,
    primaryTextColor: 'var(--color-text-1)',
    secondaryTextColor: 'var(--color-text-2)',
    averageBrightness: 255,
    analyzing: false,
  });
  
  const analyzedUrlRef = useRef<string | null>(null);

  const analyzeColor = useCallback(async () => {
    if (!enabled || !imageUrl) {
      setConfig(prev => ({
        ...prev,
        useLightText: false,
        primaryTextColor: 'var(--color-text-1)',
        secondaryTextColor: 'var(--color-text-2)',
        analyzing: false,
      }));
      analyzedUrlRef.current = null;
      return;
    }

    // 避免重复分析同一张图片
    if (analyzedUrlRef.current === imageUrl) {
      return;
    }

    setConfig(prev => ({ ...prev, analyzing: true }));
    analyzedUrlRef.current = imageUrl;

    const brightness = await analyzeImageBrightness(imageUrl);
    const useLightText = brightness < BRIGHTNESS_THRESHOLD;

    setConfig({
      useLightText,
      primaryTextColor: useLightText ? '#ffffff' : 'var(--color-text-1)',
      secondaryTextColor: useLightText ? 'rgba(255, 255, 255, 0.7)' : 'var(--color-text-2)',
      averageBrightness: brightness,
      analyzing: false,
    });
  }, [imageUrl, enabled]);

  useEffect(() => {
    analyzeColor();
  }, [analyzeColor]);

  return config;
};

/**
 * 工具函数：根据亮度获取推荐的主色调颜色
 * @param brightness 亮度值 (0-255)
 * @param primaryColor 原主色调
 * @returns 调整后的颜色
 */
export const getAdaptivePrimaryColor = (
  brightness: number,
  primaryColor: string = '#206CCF'
): string => {
  // 如果背景较暗，可能需要调整主色调以确保可见性
  if (brightness < 80) {
    // 非常暗的背景，使用更亮的颜色
    return '#4A9EFF';
  }
  return primaryColor;
};

export default useSceneryColor;
