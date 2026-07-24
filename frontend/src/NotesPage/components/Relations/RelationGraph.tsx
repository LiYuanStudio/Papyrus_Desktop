import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button, Spin, Message, Slider } from '@arco-design/web-react';
import { IconZoomIn, IconZoomOut, IconRefresh } from '@arco-design/web-react/icon';
import type { GraphNode, GraphLink, RelationType } from './types';
import { BASE, getAuthToken } from '../../../api';
import i18n from '../../../i18n';

interface RelationGraphProps {
  noteId: string;
  depth?: number;
  onNodeClick?: (nodeId: string) => void;
  width?: number;
  height?: number;
}

// 关联类型颜色
const RELATION_COLORS: Record<RelationType, string> = {
  reference: '#165DFF',
  related: '#00B42A',
  child: '#FF7D00',
  parent: '#722ED1',
  sequence: '#14C9C9',
  parallel: '#F53F3F',
};

export const RelationGraph: React.FC<RelationGraphProps> = ({
  noteId,
  depth = 1,
  onNodeClick,
  width = 600,
  height = 400,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [currentDepth, setCurrentDepth] = useState(depth);

  // Canvas 无法直接写 CSS var(): 从 computed style 解析语义 token 并缓存,仅主题切换时重取,
  // 避免每帧 getComputedStyle;修复写死的浅色节点(#FFFFFF 底/#1D2129 字)在深色模式下刺眼的问题
  const themeColorsRef = useRef<{ theme: string | null; nodeBg: string; nodeText: string; primary: string } | null>(null);
  const getThemeColors = () => {
    const theme = document.body.getAttribute('arco-theme');
    const cached = themeColorsRef.current;
    if (cached && cached.theme === theme) return cached;
    const styles = getComputedStyle(document.body);
    const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
    const next = {
      theme,
      nodeBg: read('--color-bg-1', '#FFFFFF'),
      nodeText: read('--color-text-1', '#1D2129'),
      primary: read('--color-primary', '#165DFF'),
    };
    themeColorsRef.current = next;
    return next;
  };

  // 物理模拟数据
  const simulationRef = useRef<{
    nodes: Array<GraphNode & { x: number; y: number; vx: number; vy: number }>;
    links: GraphLink[];
    animationId: number | null;
  }>({ nodes: [], links: [], animationId: null });

  // 加载图谱数据
  const loadGraphData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const response = await fetch(`${BASE}/notes/${noteId}/graph?depth=${currentDepth}`, {
        headers: {
          ...(token ? { 'X-Papyrus-Token': token } : {}),
        },
      });
      const result = await response.json();
      if (result.success) {
        const nodes = result.nodes.map((n: GraphNode, i: number) => {
          const angle = (i / Math.max(result.nodes.length, 1)) * Math.PI * 2;
          const radius = n.is_center ? 0 : 150;
          return {
            ...n,
            x: width / 2 + Math.cos(angle) * radius,
            y: height / 2 + Math.sin(angle) * radius,
            vx: 0,
            vy: 0,
          };
        });
        
        simulationRef.current = { nodes, links: result.links, animationId: null };
        startSimulation();
      } else {
        Message.error(result.error || i18n.t('relationGraph.loadFailed'));
      }
    } catch {
      Message.error(i18n.t('relationGraph.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [noteId, currentDepth, width, height]);

  useEffect(() => {
    loadGraphData();
    return () => {
      if (simulationRef.current.animationId) {
        cancelAnimationFrame(simulationRef.current.animationId);
      }
    };
  }, [loadGraphData]);

  // 监听无障碍设置变化，禁用动画时停止物理模拟
  useEffect(() => {
    const handleAccessibilityChange = (e: CustomEvent) => {
      if (e.detail?.noAnimation) {
        if (simulationRef.current.animationId) {
          cancelAnimationFrame(simulationRef.current.animationId);
          simulationRef.current.animationId = null;
        }
      } else if (!simulationRef.current.animationId && simulationRef.current.nodes.length > 0) {
        startSimulation();
      }
    };
    window.addEventListener('papyrus_accessibility_changed', handleAccessibilityChange as EventListener);
    return () => window.removeEventListener('papyrus_accessibility_changed', handleAccessibilityChange as EventListener);
  }, []);

  // 力导向图模拟
  const startSimulation = () => {
    const sim = simulationRef.current;
    const centerX = width / 2;
    const centerY = height / 2;

    const step = () => {
      const { nodes, links } = sim;
      
      // 排斥力
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 5000 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          
          if (!a.is_center) { a.vx -= fx; a.vy -= fy; }
          if (!b.is_center) { b.vx += fx; b.vy += fy; }
        }
      }

      // 弹簧力
      for (const link of links) {
        const source = nodes.find(n => n.id === link.source);
        const target = nodes.find(n => n.id === link.target);
        if (!source || !target) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 120) * 0.05;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (!source.is_center) { source.vx += fx; source.vy += fy; }
        if (!target.is_center) { target.vx -= fx; target.vy -= fy; }
      }

      // 中心吸引力 + 阻尼
      for (const node of nodes) {
        if (node.is_center) {
          node.x = centerX;
          node.y = centerY;
          node.vx = 0;
          node.vy = 0;
          continue;
        }

        node.vx += (centerX - node.x) * 0.01;
        node.vy += (centerY - node.y) * 0.01;
        node.vx *= 0.9;
        node.vy *= 0.9;
        node.x += node.vx;
        node.y += node.vy;

        // 边界约束
        const margin = 40;
        node.x = Math.max(margin, Math.min(width - margin, node.x));
        node.y = Math.max(margin, Math.min(height - margin, node.y));
      }

      draw();
      sim.animationId = requestAnimationFrame(step);
    };

    step();
  };

  // 绘制图谱
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { nodes, links } = simulationRef.current;
    const themeColors = getThemeColors();

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // 绘制连线
    for (const link of links) {
      const source = nodes.find(n => n.id === link.source);
      const target = nodes.find(n => n.id === link.target);
      if (!source || !target) continue;

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = RELATION_COLORS[link.type as RelationType] || '#86909C';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 箭头
      const angle = Math.atan2(target.y - source.y, target.x - source.x);
      const arrowLength = 10;
      const arrowAngle = Math.PI / 6;
      const nodeRadius = target.is_center ? 25 : 18;
      const arrowX = target.x - Math.cos(angle) * nodeRadius;
      const arrowY = target.y - Math.sin(angle) * nodeRadius;

      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(
        arrowX - arrowLength * Math.cos(angle - arrowAngle),
        arrowY - arrowLength * Math.sin(angle - arrowAngle)
      );
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(
        arrowX - arrowLength * Math.cos(angle + arrowAngle),
        arrowY - arrowLength * Math.sin(angle + arrowAngle)
      );
      ctx.stroke();
    }

    // 绘制节点
    for (const node of nodes) {
      const isHovered = hoveredNode === node.id;
      const radius = node.is_center ? 25 : 18;
      
      if (isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(22, 93, 255, 0.2)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      // 节点底/描边/文字改走主题 token(见 getThemeColors),中心节点用主色
      ctx.fillStyle = node.is_center ? themeColors.primary : themeColors.nodeBg;
      ctx.fill();
      ctx.strokeStyle = node.is_center ? themeColors.primary : '#86909C';
      ctx.lineWidth = node.is_center ? 0 : 2;
      ctx.stroke();

      ctx.fillStyle = node.is_center ? '#FFFFFF' : themeColors.nodeText;
      ctx.font = `${node.is_center ? 'bold ' : ''}12px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const displayTitle = node.title.length > 6 ? node.title.slice(0, 6) + '...' : node.title;
      ctx.fillText(displayTitle, node.x, node.y);
    }

    ctx.restore();
  };

  // 鼠标事件
  const getMousePos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - offset.x) / scale,
      y: (e.clientY - rect.top - offset.y) / scale,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getMousePos(e);

    if (isDragging && draggedNode) {
      const node = simulationRef.current.nodes.find(n => n.id === draggedNode);
      if (node) {
        node.x = pos.x;
        node.y = pos.y;
        node.vx = 0;
        node.vy = 0;
      }
    } else {
      const hovered = simulationRef.current.nodes.find(node => {
        const dx = pos.x - node.x;
        const dy = pos.y - node.y;
        const radius = node.is_center ? 25 : 18;
        return dx * dx + dy * dy <= radius * radius;
      });
      setHoveredNode(hovered?.id || null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getMousePos(e);
    const clicked = simulationRef.current.nodes.find(node => {
      const dx = pos.x - node.x;
      const dy = pos.y - node.y;
      const radius = node.is_center ? 25 : 18;
      return dx * dx + dy * dy <= radius * radius;
    });

    if (clicked) {
      setIsDragging(true);
      setDraggedNode(clicked.id);
    }
  };

  const handleMouseUp = () => {
    if (!isDragging && draggedNode) {
      onNodeClick?.(draggedNode);
    }
    setIsDragging(false);
    setDraggedNode(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(0.5, Math.min(3, prev * delta)));
  };

  // 工具栏
  const handleZoomIn = () => setScale(prev => Math.min(3, prev * 1.2));
  const handleZoomOut = () => setScale(prev => Math.max(0.5, prev / 1.2));
  const handleReset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    loadGraphData();
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: 'var(--color-bg-2)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      {/* 工具栏 */}
      <div style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 10, display: 'flex', gap: '8px', background: 'var(--color-bg-1)', padding: '4px', border: '1px solid var(--color-border-hairline)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-1)' }}>
        <Button type="text" size="small" icon={<IconZoomIn />} onClick={handleZoomIn} />
        <Button type="text" size="small" icon={<IconZoomOut />} onClick={handleZoomOut} />
        <Button type="text" size="small" icon={<IconRefresh />} onClick={handleReset} />
      </div>

      {/* 深度控制 */}
      <div style={{ position: 'absolute', bottom: '12px', left: '12px', right: '12px', zIndex: 10, background: 'var(--color-bg-1)', padding: '8px 12px', border: '1px solid var(--color-border-hairline)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-1)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>{i18n.t('relationGraph.depth')}</span>
        <Slider value={currentDepth} min={1} max={2} step={1} style={{ flex: 1 }} onChange={(val) => setCurrentDepth(val as number)} />
        <span style={{ fontSize: '13px', minWidth: '20px' }}>{currentDepth}</span>
      </div>

      {/* 画布 */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Spin size={24} />
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{ width: '100%', height: '100%', cursor: isDragging ? 'grabbing' : hoveredNode ? 'pointer' : 'default' }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
      )}

      {/* 图例 */}
      <div style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 10, background: 'var(--color-bg-1)', padding: '12px', border: '1px solid var(--color-border-hairline)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-1)' }}>
        <div style={{ fontSize: '12px', fontWeight: 500, marginBottom: '8px' }}>{i18n.t('relationGraph.relationTypes')}</div>
        {(Object.keys(RELATION_COLORS) as RelationType[]).map(type => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <div style={{ width: '12px', height: '2px', background: RELATION_COLORS[type] }} />
            <span style={{ fontSize: '11px', color: 'var(--color-text-2)' }}>
              {i18n.t(`relationGraph.${type}`)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RelationGraph;
