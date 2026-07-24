import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Input,
  Select,
  Modal,
  Message,
  Tabs,
  Empty,
  Tooltip,
  Tag,
  Spin,
} from '@arco-design/web-react';
import {
  IconDelete,
  IconEdit,
  IconPlus,
  IconArrowRight,
  IconArrowLeft,
} from '@arco-design/web-react/icon';
import type { RelatedNote, SearchableNote, RelationType } from './types';
import { BASE, getAuthToken } from '../../../api';
import i18n from '../../../i18n';

const TabPane = Tabs.TabPane;
const Option = Select.Option;

// 关联类型配置
// color 供 Arco Tag 预设色使用;css/cssLight 供内联样式使用 —— 原 `var(--color-${color}-light)` 拼接
// 引用了从未定义的变量(--color-arcoblue 等),图标底色/文字色静默失效;
// 改用与 RelationGraph 一致的功能色板(图表多色无语义 token 对应,按约定保留 hex,深浅色均不刺眼)
const RELATION_CONFIG: Record<RelationType, { label: string; color: string; css: string; cssLight: string }> = {
  reference: { label: i18n.t('relationGraph.reference'), color: 'arcoblue', css: '#165DFF', cssLight: 'rgba(22, 93, 255, 0.12)' },
  related: { label: i18n.t('relationGraph.related'), color: 'green', css: '#00B42A', cssLight: 'rgba(0, 180, 42, 0.12)' },
  child: { label: i18n.t('relationGraph.child'), color: 'orange', css: '#FF7D00', cssLight: 'rgba(255, 125, 0, 0.12)' },
  parent: { label: i18n.t('relationGraph.parent'), color: 'purple', css: '#722ED1', cssLight: 'rgba(114, 46, 209, 0.12)' },
  sequence: { label: i18n.t('relationGraph.sequence'), color: 'cyan', css: '#14C9C9', cssLight: 'rgba(20, 201, 201, 0.12)' },
  parallel: { label: i18n.t('relationGraph.parallel'), color: 'magenta', css: '#F5319D', cssLight: 'rgba(245, 49, 157, 0.12)' },
};

interface RelationsPanelProps {
  noteId: string;
  onNavigateToNote?: (noteId: string) => void;
}

interface RelationsData {
  outgoing: RelatedNote[];
  incoming: RelatedNote[];
}

export const RelationsPanel: React.FC<RelationsPanelProps> = ({
  noteId,
  onNavigateToNote,
}) => {
  const [relations, setRelations] = useState<RelationsData>({ outgoing: [], incoming: [] });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('outgoing');
  
  // 添加关联的弹窗状态
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchableNote[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [selectedNote, setSelectedNote] = useState<SearchableNote | null>(null);
  const [newRelationType, setNewRelationType] = useState<RelationType>('reference');
  const [newRelationDesc, setNewRelationDesc] = useState('');
  
  // 编辑关联的弹窗状态
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRelation, setEditingRelation] = useState<RelatedNote | null>(null);
  const [editRelationType, setEditRelationType] = useState<RelationType>('reference');
  const [editRelationDesc, setEditRelationDesc] = useState('');

  // 加载关联数据
  const loadRelations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${BASE}/notes/${noteId}/relations`);
      const data = await response.json();
      if (data.success) {
        setRelations({
          outgoing: data.outgoing,
          incoming: data.incoming,
        });
      }
    } catch {
      Message.error(i18n.t('noteRelations.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    loadRelations();
  }, [loadRelations]);

  // 搜索可关联的笔记
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    setSearchError(false);
    try {
      const response = await fetch(
        `${BASE}/notes/search-for-relation?query=${encodeURIComponent(searchQuery)}&exclude_note_id=${noteId}&limit=10`
      );
      const data = await response.json();
      if (data.success) {
        setSearchResults(data.results);
      } else {
        setSearchError(true);
      }
    } catch {
      setSearchError(true);
    } finally {
      setSearching(false);
    }
  };

  // 防抖自动搜索
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchError(false);
      return;
    }
    const timer = setTimeout(() => {
      handleSearch();
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, noteId]);

  // 创建关联
  const handleCreateRelation = async () => {
    if (!selectedNote) {
      Message.warning(i18n.t('noteRelations.selectTarget'));
      return;
    }

    try {
      const token = await getAuthToken();
      const response = await fetch(`${BASE}/notes/${noteId}/relations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Papyrus-Token': token } : {}),
        },
        body: JSON.stringify({
          target_id: selectedNote.id,
          relation_type: newRelationType,
          description: newRelationDesc,
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        Message.success(i18n.t('noteRelations.createSuccess'));
        setAddModalVisible(false);
        setSelectedNote(null);
        setSearchQuery('');
        setSearchResults([]);
        setNewRelationDesc('');
        loadRelations();
      } else {
        Message.error(data.error || i18n.t('noteRelations.createExistsOrFailed'));
      }
    } catch {
      Message.error(i18n.t('noteRelations.createFailed'));
    }
  };

  // 更新关联
  const handleUpdateRelation = async () => {
    if (!editingRelation) return;

    try {
      const token = await getAuthToken();
      const response = await fetch(`${BASE}/relations/${editingRelation.relation_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Papyrus-Token': token } : {}),
        },
        body: JSON.stringify({
          relation_type: editRelationType,
          description: editRelationDesc,
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        Message.success(i18n.t('noteRelations.updateSuccess'));
        setEditModalVisible(false);
        setEditingRelation(null);
        loadRelations();
      } else {
        Message.error(data.error || i18n.t('noteRelations.updateFailed'));
      }
    } catch {
      Message.error(i18n.t('noteRelations.updateFailed'));
    }
  };

  // 删除关联
  const handleDeleteRelation = async (relationId: string) => {
    Modal.confirm({
      title: i18n.t('noteRelations.confirmDeleteTitle'),
      content: i18n.t('noteRelations.confirmDeleteContent'),
      onOk: async () => {
        try {
          const token = await getAuthToken();
          const response = await fetch(`${BASE}/relations/${relationId}`, {
            method: 'DELETE',
            headers: {
              ...(token ? { 'X-Papyrus-Token': token } : {}),
            },
          });
          
          const data = await response.json();
          if (data.success) {
            Message.success(i18n.t('noteRelations.deleteSuccess'));
            loadRelations();
          } else {
            Message.error(data.error || i18n.t('noteRelations.deleteFailed'));
          }
        } catch {
          Message.error(i18n.t('noteRelations.deleteFailed'));
        }
      },
    });
  };

  // 打开编辑弹窗
  const openEditModal = (relation: RelatedNote) => {
    setEditingRelation(relation);
    setEditRelationType(relation.relation_type);
    setEditRelationDesc(relation.description);
    setEditModalVisible(true);
  };

  // 渲染关联列表项
  const renderRelationItem = (relation: RelatedNote) => {
    const config = RELATION_CONFIG[relation.relation_type] || RELATION_CONFIG.reference;
    
    return (
      <div
        key={relation.relation_id}
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border-2)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            // 图标底色/文字色改走 RELATION_CONFIG 的 css/cssLight(原 var() 拼接引用了未定义变量)
            background: config.cssLight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: config.css,
            flexShrink: 0,
          }}
        >
          {relation.is_outgoing ? <IconArrowRight /> : <IconArrowLeft />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--color-text-1)',
                cursor: onNavigateToNote ? 'pointer' : 'default',
              }}
              onClick={() => onNavigateToNote?.(relation.note_id)}
            >
              {relation.title}
            </span>
            <Tag size="small" color={config.color}>
              {config.label}
            </Tag>
          </div>
          
          {relation.description && (
            <div style={{ fontSize: '12px', color: 'var(--color-text-3)', marginTop: '4px' }}>
              {relation.description}
            </div>
          )}
          
          <div style={{ fontSize: '12px', color: 'var(--color-text-3)', marginTop: '4px' }}>
            {relation.folder}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <Tooltip content={i18n.t('common.edit')}>
            <Button
              type="text"
              size="small"
              icon={<IconEdit />}
              onClick={() => openEditModal(relation)}
            />
          </Tooltip>
          <Tooltip content={i18n.t('common.delete')}>
            <Button
              type="text"
              size="small"
              status="danger"
              icon={<IconDelete />}
              onClick={() => handleDeleteRelation(relation.relation_id)}
            />
          </Tooltip>
        </div>
      </div>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 头部 */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border-2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: '16px', fontWeight: 500 }}>{i18n.t('noteRelations.relationsTitle')}</div>
        <Button
          type="primary"
          size="small"
          icon={<IconPlus />}
          onClick={() => setAddModalVisible(true)}
        >
          {i18n.t('noteRelations.addRelation')}
        </Button>
      </div>

      {/* 标签页 */}
      <Tabs
        activeTab={activeTab}
        onChange={setActiveTab}
        style={{ flex: 1, overflow: 'hidden' }}
      >
        <TabPane key="outgoing" title={`${i18n.t('noteRelations.outgoing')} (${relations.outgoing.length})`}>
          <div style={{ overflow: 'auto', height: 'calc(100% - 40px)' }}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <Spin />
              </div>
            ) : relations.outgoing.length > 0 ? (
              relations.outgoing.map(r => renderRelationItem(r))
            ) : (
              <Empty description={i18n.t('noteRelations.noOutgoing')} style={{ marginTop: '40px' }} />
            )}
          </div>
        </TabPane>
        
        <TabPane key="incoming" title={`${i18n.t('noteRelations.incoming')} (${relations.incoming.length})`}>
          <div style={{ overflow: 'auto', height: 'calc(100% - 40px)' }}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <Spin />
              </div>
            ) : relations.incoming.length > 0 ? (
              relations.incoming.map(r => renderRelationItem(r))
            ) : (
              <Empty description={i18n.t('noteRelations.noIncoming')} style={{ marginTop: '40px' }} />
            )}
          </div>
        </TabPane>
      </Tabs>

      {/* 添加关联弹窗 */}
      <Modal
        title={i18n.t('noteRelations.addRelationTitle')}
        visible={addModalVisible}
        onOk={handleCreateRelation}
        onCancel={() => {
          setAddModalVisible(false);
          setSelectedNote(null);
          setSearchQuery('');
          setSearchResults([]);
          setSearchError(false);
        }}
        okText={i18n.t('common.create')}
        cancelText={i18n.t('common.cancel')}
      >
        <div style={{ marginBottom: '16px' }}>
          <div style={{ marginBottom: '8px', fontSize: '14px' }}>{i18n.t('noteRelations.searchNote')}</div>
          <Input.Search
            placeholder={i18n.t('noteRelations.searchPlaceholder')}
            value={searchQuery}
            onChange={setSearchQuery}
            onSearch={handleSearch}
            onPressEnter={handleSearch}
            loading={searching}
            style={{ marginBottom: '12px' }}
          />
          
          {searchError && (
            <div style={{ color: 'var(--color-danger)', fontSize: '13px', marginBottom: '12px' }}>
              {i18n.t('noteRelations.searchFailed')}
            </div>
          )}

          {searchResults.length > 0 && (
            <div
              style={{
                maxHeight: '200px',
                overflow: 'auto',
                border: '1px solid var(--color-border-2)',
                borderRadius: '4px',
              }}
            >
              {searchResults.map(note => (
                <div
                  key={note.id}
                  onClick={() => setSelectedNote(note)}
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    background: selectedNote?.id === note.id 
                      ? 'var(--color-primary-light)' 
                      : 'transparent',
                    borderBottom: '1px solid var(--color-border-2)',
                  }}
                >
                  <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                    {note.title}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-3)' }}>
                    {note.folder} · {note.preview?.slice(0, 50)}...
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedNote && (
          <>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ marginBottom: '8px', fontSize: '14px' }}>{i18n.t('noteRelations.selected')}</div>
              <Tag color="arcoblue" closable onClose={() => setSelectedNote(null)}>
                {selectedNote.title}
              </Tag>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ marginBottom: '8px', fontSize: '14px' }}>{i18n.t('noteRelations.relationType')}</div>
              <Select value={newRelationType} onChange={setNewRelationType} style={{ width: '100%' }}>
                {Object.entries(RELATION_CONFIG).map(([key, config]) => (
                  <Option key={key} value={key}>{config.label}</Option>
                ))}
              </Select>
            </div>

            <div>
              <div style={{ marginBottom: '8px', fontSize: '14px' }}>{i18n.t('noteRelations.descriptionOptional')}</div>
              <Input.TextArea
                placeholder={i18n.t('noteRelations.descPlaceholder')}
                value={newRelationDesc}
                onChange={setNewRelationDesc}
                rows={3}
              />
            </div>
          </>
        )}
      </Modal>

      {/* 编辑关联弹窗 */}
      <Modal
        title={i18n.t('noteRelations.editRelationTitle')}
        visible={editModalVisible}
        onOk={handleUpdateRelation}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingRelation(null);
        }}
        okText={i18n.t('common.save')}
        cancelText={i18n.t('common.cancel')}
      >
        {editingRelation && (
          <>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ marginBottom: '8px', fontSize: '14px' }}>{i18n.t('noteRelations.targetNote')}</div>
              <div style={{ padding: '8px 12px', background: 'var(--color-fill-2)', borderRadius: '4px' }}>
                {editingRelation.title}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ marginBottom: '8px', fontSize: '14px' }}>{i18n.t('noteRelations.relationType')}</div>
              <Select value={editRelationType} onChange={setEditRelationType} style={{ width: '100%' }}>
                {Object.entries(RELATION_CONFIG).map(([key, config]) => (
                  <Option key={key} value={key}>{config.label}</Option>
                ))}
              </Select>
            </div>

            <div>
              <div style={{ marginBottom: '8px', fontSize: '14px' }}>{i18n.t('noteRelations.description')}</div>
              <Input.TextArea
                placeholder={i18n.t('noteRelations.descPlaceholder')}
                value={editRelationDesc}
                onChange={setEditRelationDesc}
                rows={3}
              />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};

export default RelationsPanel;
