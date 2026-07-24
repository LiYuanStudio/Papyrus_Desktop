/**
 * 窗景内容数据。
 * 每条记录关联一张照片和一句诗文。
 * 接入设置中的窗景选择。
 */

import { loadStartPageScenery, getSceneryOpacity } from '../hooks/useScenery';

export type SceneryContent = {
  id: string;
  image: string;       // 图片路径，相对 /public
  poem: string;        // 诗句正文
  source?: string;     // 出处（可选）
};

// 本地静态数据（默认窗景）
const defaultContent: SceneryContent = {
  id: 'default',
  image: './scenery/image.png',
  poem: '春未老，风细柳斜斜。试上超然台上望，半壕春水一城花，烟雨暗千家。寒食后，酒醒却咨嗟。休对故人思故国，且将新火试新茶，诗酒趁年华。',
  source: '[宋] 苏轼《望江南·超然台作》',
};

/**
 * 获取当前窗景内容。
 * 从设置中读取用户选择的窗景，如果设置未启用则返回 null（DoneCard 会显示纯背景）
 * 有后端时替换为真实请求。
 */
export async function fetchSceneryContent(): Promise<SceneryContent | null> {
  // TODO: 替换为后端接口
  // const res = await fetch('/api/scenery/today');
  // if (res.ok) return res.json();

  const settings = loadStartPageScenery();
  if (settings.enabled && settings.image) {
    return {
      ...defaultContent,
      image: settings.image,
      poem: settings.poem || defaultContent.poem,
      source: settings.source || defaultContent.source,
    };
  }

  // 窗景未启用，返回 null
  return null;
}

// 导出获取透明度的函数
export { getSceneryOpacity };