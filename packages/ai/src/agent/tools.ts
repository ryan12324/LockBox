/**
 * Agent tool definitions — JSON Schema for LLM function calling.
 *
 * Each tool defines a name, description, JSON Schema parameters, and whether
 * user confirmation is required before execution. These definitions are
 * compatible with OpenAI/Anthropic function calling format.
 */

import type { ToolDefinition } from '../providers/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single agent tool definition with confirmation metadata. */
export interface AgentTool {
  /** Unique tool name matching the dispatcher key in ToolExecutor. */
  name: string;
  /** Human-readable description for the LLM to understand when to use this tool. */
  description: string;
  /** JSON Schema object describing the tool's parameters. */
  parameters: Record<string, unknown>;
  /** Whether user confirmation is required before executing this tool. */
  confirmationRequired: boolean;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/** All agent tools available to the vault chat assistant. */
export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'search_vault',
    description:
      'Search vault items by keyword or semantic query. Returns matching items with names, usernames, and URIs — never passwords or secrets.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (keyword or natural language)' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 10)' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    confirmationRequired: false,
  },
  {
    name: 'get_item',
    description:
      'Get a specific vault item by ID. Returns sanitized item data — passwords, card numbers, CVVs, and TOTP secrets are never included.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Vault item ID' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    confirmationRequired: false,
  },
  {
    name: 'create_item',
    description: 'Create a new vault item (login, note, or card).',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['login', 'note', 'card'],
          description: 'Item type',
        },
        name: { type: 'string', description: 'Display name for the item' },
        data: {
          type: 'object',
          description: 'Item-specific data (username, password, uris, etc.)',
        },
      },
      required: ['type', 'name', 'data'],
      additionalProperties: false,
    },
    confirmationRequired: true,
  },
  {
    name: 'update_item',
    description: 'Update an existing vault item.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Vault item ID to update' },
        changes: { type: 'object', description: 'Fields to update' },
      },
      required: ['id', 'changes'],
      additionalProperties: false,
    },
    confirmationRequired: true,
  },
  {
    name: 'delete_item',
    description: 'Delete a vault item permanently.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Vault item ID to delete' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    confirmationRequired: true,
  },
  {
    name: 'generate_password',
    description: 'Generate a strong random password with configurable options.',
    parameters: {
      type: 'object',
      properties: {
        length: { type: 'number', description: 'Password length (8–128, default: 20)' },
        uppercase: { type: 'boolean', description: 'Include uppercase letters (default: true)' },
        lowercase: { type: 'boolean', description: 'Include lowercase letters (default: true)' },
        digits: { type: 'boolean', description: 'Include digits (default: true)' },
        special: { type: 'boolean', description: 'Include special characters (default: true)' },
      },
      additionalProperties: false,
    },
    confirmationRequired: false,
  },
  {
    name: 'check_breach',
    description:
      'Check if a password has been exposed in known data breaches using HIBP k-anonymity.',
    parameters: {
      type: 'object',
      properties: {
        password: { type: 'string', description: 'Password to check' },
      },
      required: ['password'],
      additionalProperties: false,
    },
    confirmationRequired: false,
  },
  {
    name: 'get_health_report',
    description: 'Get a vault health summary including weak, reused, and old password counts.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    confirmationRequired: false,
  },
  {
    name: 'list_folders',
    description: 'List all folders in the vault.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    confirmationRequired: false,
  },
  {
    name: 'organize_item',
    description: 'Move a vault item to a folder and/or add/remove tags.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Vault item ID to organize' },
        folderId: { type: 'string', description: 'Target folder ID (omit to leave unchanged)' },
        addTags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to add',
        },
        removeTags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to remove',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    confirmationRequired: true,
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Map agent tools to the LLM provider {@link ToolDefinition} format.
 *
 * Strips the `confirmationRequired` field which is only used client-side
 * for safety gating, not sent to the LLM.
 */
export function getToolDefinitions(): ToolDefinition[] {
  return AGENT_TOOLS.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));
}
