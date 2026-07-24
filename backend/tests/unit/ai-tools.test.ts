import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

interface AIResponseParserClass {
  parseReasoning(text: string): { cleaned: string; reasoning: string | null };
  parseToolCall(text: string): { tool: string; params: Record<string, unknown> } | null;
  parseResponse(text: string, reasoningContent?: string | null): { content: string; reasoning: string | null; tool_call: { tool: string; params: Record<string, unknown> } | null };
  removeToolCallMarkers(text: string): string;
}

interface CardToolsInstance {
  executeTool(tool: string, params: Record<string, unknown>): { success: boolean; error?: string; new?: { q: string }; stats?: { total_cards: number }; results?: Array<{ question: string }>; card?: { q: string } };
  parseToolCall(text: string): { tool: string } | null;
  getToolsForOpenAI(): Array<{ type: string; function: { name: string; description: string; parameters: { type: string; required: string[]; properties: Record<string, unknown> } } }>;
  getCatalog(): Array<{ name: string; category: string; side_effect: 'read' | 'write'; description: string }>;
  getDescriptor(toolName: string): { name: string; sideEffect: 'read' | 'write' } | null;
  hasTool(toolName: string): boolean;
}

interface TestLogger {
  events: Array<{ eventType: string; data: unknown; level: string }>;
  logEvent(eventType: string, data?: unknown, level?: string): void;
}

const testDir = path.join(os.tmpdir(), `papyrus-ai-tools-test-${Date.now()}`);
let CardToolsCtor: new () => CardToolsInstance;
let AIResponseParserCtor: AIResponseParserClass;
let closeDb: () => void;

describe('AIResponseParser', () => {
  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.PAPYRUS_DATA_DIR = testDir;

    const tools = await import('../../src/ai/tools.js');
    CardToolsCtor = tools.CardTools;
    AIResponseParserCtor = tools.AIResponseParser;

    const db = await import('../../src/db/database.js');
    closeDb = db.closeDb;
  });

  afterAll(() => {
    closeDb();
  });

  it('should parse reasoning tags', () => {
    const { cleaned, reasoning } = AIResponseParserCtor.parseReasoning('Hello <think>这是推理</think> world');
    expect(cleaned).toBe('Hello  world');
    expect(reasoning).toBe('这是推理');
  });

  it('should parse tool call from json block', () => {
    const tc = AIResponseParserCtor.parseToolCall('```json\n{"tool": "search_cards", "params": {"keyword": "test"}}\n```');
    expect(tc).not.toBeNull();
    expect(tc?.tool).toBe('search_cards');
  });

  it('should parse full response', () => {
    const result = AIResponseParserCtor.parseResponse('Answer\n```json\n{"tool": "get_card_stats", "params": {}}\n```');
    expect(result.content).toBe('Answer');
    expect(result.tool_call?.tool).toBe('get_card_stats');
  });

  it('should remove tool call markers', () => {
    const cleaned = AIResponseParserCtor.removeToolCallMarkers('Text\n```json\n{"tool": "x"}\n```\nMore');
    expect(cleaned).toBe('Text\nMore');
  });
});

describe('CardTools', () => {
  let tools: CardToolsInstance;

  beforeEach(() => {
    closeDb();
    const dbPath = path.join(testDir, 'papyrus.db');
    if (fs.existsSync(dbPath)) {
      fs.rmSync(dbPath);
    }
    tools = new CardToolsCtor();
  });

  afterAll(() => {
    closeDb();
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.PAPYRUS_DATA_DIR;
  });

  it('should create card', () => {
    const result = tools.executeTool('create_card', { question: 'What is 2+2?', answer: '4' });
    expect(result.success).toBe(true);
    expect(result.card?.q).toBe('What is 2+2?');
  });

  it('should reject empty card', () => {
    const result = tools.executeTool('create_card', { question: '', answer: '' });
    expect(result.success).toBe(false);
  });

  it('should search cards', () => {
    tools.executeTool('create_card', { question: 'Math question xyz', answer: '42', tags: ['math'] });
    tools.executeTool('create_card', { question: 'History question', answer: '1066', tags: ['history'] });
    const result = tools.executeTool('search_cards', { keyword: 'xyz' });
    expect(result.success).toBe(true);
    expect(result.results?.some(r => r.question === 'Math question xyz')).toBe(true);
  });

  it('should get card stats', () => {
    const result = tools.executeTool('get_card_stats', {});
    expect(result.success).toBe(true);
    expect(result.stats).toBeDefined();
    expect(typeof result.stats?.total_cards).toBe('number');
  });

  it('should execute known tools', () => {
    tools.executeTool('create_card', { question: 'Q1', answer: 'A1' });
    const result = tools.executeTool('get_card_stats', {});
    expect(result.success).toBe(true);
  });

  it('should reject unknown tools', () => {
    const result = tools.executeTool('unknown_tool', {});
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('should log unknown tool attempts with warning level', () => {
    const logger: TestLogger = {
      events: [],
      logEvent(eventType: string, data: unknown = null, level = 'INFO') {
        this.events.push({ eventType, data, level });
      },
    };
    const loggedTools = new CardToolsCtor(logger as never);

    const result = loggedTools.executeTool('unknown_tool', {});

    expect(result.success).toBe(false);
    expect(logger.events).toContainEqual({
      eventType: 'tool.unknown',
      data: { tool: 'unknown_tool' },
      level: 'WARNING',
    });
  });

  it('should update a card', () => {
    const createResult = tools.executeTool('create_card', { question: 'Old Q', answer: 'Old A' });
    const cardId = (createResult as Record<string, unknown>).card as Record<string, string>;
    const result = tools.executeTool('update_card', { card_id: cardId.id, question: 'New Q', answer: 'New A' });
    expect(result.success).toBe(true);
    expect(result.new?.q).toBe('New Q');
  });

  it('should reject update with non-existent card_id', () => {
    const result = tools.executeTool('update_card', { card_id: 'nonexistent', question: 'Q' });
    expect(result.success).toBe(false);
  });

  it('should delete a card', () => {
    const createResult = tools.executeTool('create_card', { question: 'Del', answer: 'A' });
    const cardId = (createResult as Record<string, unknown>).card as Record<string, string>;
    const result = tools.executeTool('delete_card', { card_id: cardId.id });
    expect(result.success).toBe(true);
  });

  it('should reject delete with non-existent card_id', () => {
    const result = tools.executeTool('delete_card', { card_id: 'nonexistent' });
    expect(result.success).toBe(false);
  });

  it('should execute create_card via executeTool', () => {
    const result = tools.executeTool('create_card', { question: 'Q', answer: 'A' });
    expect(result.success).toBe(true);
  });

  it('should reject create_card with non-string params', () => {
    const result = tools.executeTool('create_card', { question: 123, answer: 'A' });
    expect(result.success).toBe(false);
  });

  it('should execute update_card via executeTool', () => {
    const createResult = tools.executeTool('create_card', { question: 'Q', answer: 'A' });
    const cardId = (createResult as Record<string, unknown>).card as Record<string, string>;
    const result = tools.executeTool('update_card', { card_id: cardId.id, question: 'New' });
    expect(result.success).toBe(true);
  });

  it('should reject update_card with invalid card_id type', () => {
    const result = tools.executeTool('update_card', { card_id: 123 });
    expect(result.success).toBe(false);
  });

  it('should execute delete_card via executeTool', () => {
    const createResult = tools.executeTool('create_card', { question: 'Q', answer: 'A' });
    const cardId = (createResult as Record<string, unknown>).card as Record<string, string>;
    const result = tools.executeTool('delete_card', { card_id: cardId.id });
    expect(result.success).toBe(true);
  });

  it('should reject delete_card with invalid card_id type', () => {
    const result = tools.executeTool('delete_card', { card_id: 123 });
    expect(result.success).toBe(false);
  });

  it('should execute search_cards via executeTool', () => {
    tools.executeTool('create_card', { question: 'Math', answer: '42' });
    const result = tools.executeTool('search_cards', { keyword: 'math' });
    expect(result.success).toBe(true);
  });

  it('should reject search_cards with non-string keyword', () => {
    const result = tools.executeTool('search_cards', { keyword: 123 });
    expect(result.success).toBe(false);
  });

  it('should log validation failures returned by a tool runner', () => {
    const logger: TestLogger = {
      events: [],
      logEvent(eventType: string, data: unknown = null, level = 'INFO') {
        this.events.push({ eventType, data, level });
      },
    };
    const loggedTools = new CardToolsCtor(logger as never);

    const result = loggedTools.executeTool('create_card', { question: '', answer: '' });

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain('question');
    expect(logger.events.find((event) => event.eventType === 'tool.execute_start')?.data).toEqual({
      tool: 'create_card',
      params: { question: '', answer: '' },
    });
    const okEvent = logger.events.find((event) => event.eventType === 'tool.execute_ok');
    expect(okEvent?.level).toBe('INFO');
    expect(okEvent?.data).toMatchObject({
      tool: 'create_card',
      result_type: 'error',
    });
  });

  it('should expose descriptor and catalog side effects used by approval flow', () => {
    expect(tools.hasTool('get_settings')).toBe(true);
    expect(tools.hasTool('missing_tool')).toBe(false);
    expect(tools.getDescriptor('get_settings')?.sideEffect).toBe('read');
    expect(tools.getDescriptor('update_settings')?.sideEffect).toBe('write');
    expect(tools.getDescriptor('missing_tool')).toBeNull();

    const catalog = tools.getCatalog();
    const updateSettings = catalog.find((entry) => entry.name === 'update_settings');
    expect(updateSettings).toMatchObject({
      category: 'settings',
      side_effect: 'write',
    });
  });

  it('should parse tool call from AI response', () => {
    const tc = tools.parseToolCall('```json\n{"tool": "create_card", "params": {"question": "Q", "answer": "A"}}\n```');
    expect(tc).not.toBeNull();
    expect(tc?.tool).toBe('create_card');
  });

  it('should return null for invalid tool call json', () => {
    const tc = tools.parseToolCall('```json\nnot-json\n```');
    expect(tc).toBeNull();
  });

  it('should return null when params is not object', () => {
    const tc = tools.parseToolCall('```json\n{"tool": "x", "params": "string"}\n```');
    expect(tc).toBeNull();
  });

  it('should return null when tool is not string', () => {
    const tc = tools.parseToolCall('```json\n{"tool": 123, "params": {}}\n```');
    expect(tc).toBeNull();
  });
});

describe('AIResponseParser extended', () => {
  it('should parse multiple reasoning tags', () => {
    const { reasoning } = AIResponseParserCtor.parseReasoning('<think>A</think><think>B</think>');
    expect(reasoning).toBe('A\n\nB');
  });

  it('should fallback to reasoningContent param', () => {
    const result = AIResponseParserCtor.parseResponse('content', 'reasoning text');
    expect(result.reasoning).toBe('reasoning text');
  });

  it('should parse tool call with second pattern', () => {
    const tc = AIResponseParserCtor.parseToolCall('```\n{"tool":"x","params":null}\n```');
    expect(tc).not.toBeNull();
    expect(tc?.tool).toBe('x');
  });

  it('should return null when no tool call found', () => {
    expect(AIResponseParserCtor.parseToolCall('no tool here')).toBeNull();
  });

  it('should fallback to response for tool call when cleaned has none', () => {
    const result = AIResponseParserCtor.parseResponse('```json\n{"tool": "search_cards", "params": {}}\n```');
    expect(result.tool_call).not.toBeNull();
    expect(result.tool_call?.tool).toBe('search_cards');
  });

  it('should parse reasoning with reason tag', () => {
    const { cleaned, reasoning } = AIResponseParserCtor.parseReasoning('<reasoning>test</reasoning>');
    expect(reasoning).toBe('test');
    expect(cleaned).toBe('');
  });

  it('should parse reasoning with thought tag', () => {
    const { cleaned, reasoning } = AIResponseParserCtor.parseReasoning('<thought>test</thought>');
    expect(reasoning).toBe('test');
    expect(cleaned).toBe('');
  });

  it('should handle empty reasoning tags', () => {
    const { reasoning } = AIResponseParserCtor.parseReasoning('<think></think>');
    expect(reasoning).toBeNull();
  });

  it('should return null reasoning when no tags', () => {
    const { reasoning } = AIResponseParserCtor.parseReasoning('no tags');
    expect(reasoning).toBeNull();
  });

  it('should handle parseResponse without reasoning_content and no reasoning', () => {
    const result = AIResponseParserCtor.parseResponse('plain text');
    expect(result.reasoning).toBeNull();
    expect(result.content).toBe('plain text');
    expect(result.tool_call).toBeNull();
  });
});

describe('getToolsForOpenAI', () => {
  let tools: CardToolsInstance;

  beforeAll(async () => {
    const toolsModule = await import('../../src/ai/tools.js');
    tools = new toolsModule.CardTools();
  });

  it('should return 20 tool definitions (6 original + 14 new)', () => {
    const schema = tools.getToolsForOpenAI();
    expect(schema.length).toBe(20);
  });

  it('should have correct structure for each tool', () => {
    const schema = tools.getToolsForOpenAI();
    for (const def of schema) {
      expect(def.type).toBe('function');
      expect(typeof def.function.name).toBe('string');
      expect(typeof def.function.description).toBe('string');
      expect(def.function.parameters.type).toBe('object');
    }
  });

  it('should cover all original 5 card tools', () => {
    const schema = tools.getToolsForOpenAI();
    const names = schema.map((d) => d.function.name);
    expect(names).toContain('create_card');
    expect(names).toContain('update_card');
    expect(names).toContain('delete_card');
    expect(names).toContain('search_cards');
    expect(names).toContain('get_card_stats');
  });

  it('should include new tools', () => {
    const schema = tools.getToolsForOpenAI();
    const names = schema.map((d) => d.function.name);
    expect(names).toContain('create_note');
    expect(names).toContain('search_notes');
    expect(names).toContain('create_relation');
    expect(names).toContain('list_relations');
    expect(names).toContain('list_files');
    expect(names).toContain('read_file');
    expect(names).toContain('read_data_stats');
    expect(names).toContain('list_extensions');
    expect(names).toContain('get_settings');
    expect(names).toContain('update_settings');
  });

  it('should have required fields matching dispatcher', () => {
    const schema = tools.getToolsForOpenAI();
    const create = schema.find((d) => d.function.name === 'create_card');
    expect(create?.function.parameters.required).toContain('question');
    expect(create?.function.parameters.required).toContain('answer');

    const update = schema.find((d) => d.function.name === 'update_card');
    expect(update?.function.parameters.required).toContain('card_id');

    const stats = schema.find((d) => d.function.name === 'get_card_stats');
    expect(stats?.function.parameters.required).toEqual([]);
  });

  it('should roundtrip through executeTool for every original card tool', () => {
    const schema = tools.getToolsForOpenAI();
    const cardNames = new Set(['create_card', 'update_card', 'delete_card', 'search_cards', 'get_card_stats']);
    for (const def of schema) {
      if (!cardNames.has(def.function.name)) continue;
      const result = tools.executeTool(def.function.name, {});
      if (result.error) {
        expect(result.error).not.toMatch(/未知工具/);
      }
    }
  });
});
