/**
 * 关联功能的类型定义
 */

// 关联类型
export type RelationType = 
  | 'reference'
  | 'related'
  | 'child'
  | 'parent'
  | 'sequence'
  | 'parallel';

// 关联笔记（包含关联信息）
export interface RelatedNote {
  note_id: string;
  title: string;
  folder: string;
  preview: string;
  relation_id: string;
  relation_type: RelationType;
  description: string;
  is_outgoing: boolean;
  created_at: number;
}

// 可关联笔记搜索结果
export interface SearchableNote {
  id: string;
  title: string;
  folder: string;
  preview: string;
}

// 图谱节点
export interface GraphNode {
  id: string;
  title: string;
  folder: string;
  is_center: boolean;
}

// 图谱边
export interface GraphLink {
  source: string;
  target: string;
  type: RelationType;
}

// API 响应类型
export interface RelationsResponse {
  success: boolean;
  outgoing: RelatedNote[];
  incoming: RelatedNote[];
  total_outgoing: number;
  total_incoming: number;
}

export interface GraphResponse {
  success: boolean;
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface SearchNotesResponse {
  success: boolean;
  results: SearchableNote[];
}
