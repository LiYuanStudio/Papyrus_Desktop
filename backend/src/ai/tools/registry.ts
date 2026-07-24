import { CARD_TOOLS, CARDS_PROMPT_HINT } from './cards.js';
import { NOTE_TOOLS, NOTES_PROMPT_HINT } from './notes.js';
import { RELATION_TOOLS, RELATIONS_PROMPT_HINT } from './relations.js';
import { FILE_TOOLS, FILES_PROMPT_HINT } from './files.js';
import { DATA_TOOLS, DATA_PROMPT_HINT } from './data.js';
import { EXTENSION_TOOLS, EXTENSIONS_PROMPT_HINT } from './extensions.js';
import { SETTINGS_TOOLS, SETTINGS_PROMPT_HINT } from './settings.js';
import type { ToolDescriptor, ToolRegistry } from './types.js';

const ALL_TOOL_LIST: ToolDescriptor[] = [
  ...CARD_TOOLS,
  ...NOTE_TOOLS,
  ...RELATION_TOOLS,
  ...FILE_TOOLS,
  ...DATA_TOOLS,
  ...EXTENSION_TOOLS,
  ...SETTINGS_TOOLS,
];

export const TOOL_REGISTRY: ToolRegistry = Object.fromEntries(
  ALL_TOOL_LIST.map(d => [d.name, d]),
);

export const TOOL_LIST: ReadonlyArray<ToolDescriptor> = ALL_TOOL_LIST;

export const PROMPT_HINTS: Record<string, string> = {
  cards: CARDS_PROMPT_HINT,
  notes: NOTES_PROMPT_HINT,
  relations: RELATIONS_PROMPT_HINT,
  files: FILES_PROMPT_HINT,
  data: DATA_PROMPT_HINT,
  extensions: EXTENSIONS_PROMPT_HINT,
  settings: SETTINGS_PROMPT_HINT,
};
