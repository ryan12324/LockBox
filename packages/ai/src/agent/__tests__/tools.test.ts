import { describe, it, expect } from 'vitest';
import { AGENT_TOOLS, getToolDefinitions } from '../tools.js';
import type { AgentTool } from '../tools.js';

const EXPECTED_TOOL_NAMES = [
  'search_vault',
  'get_item',
  'create_item',
  'update_item',
  'delete_item',
  'generate_password',
  'check_breach',
  'get_health_report',
  'list_folders',
  'organize_item',
];

const DESTRUCTIVE_TOOLS = ['create_item', 'update_item', 'delete_item', 'organize_item'];

describe('AGENT_TOOLS', () => {
  it('defines exactly 10 tools', () => {
    expect(AGENT_TOOLS).toHaveLength(10);
  });

  it('contains all expected tool names', () => {
    const names = AGENT_TOOLS.map((t) => t.name);
    expect(names).toEqual(EXPECTED_TOOL_NAMES);
  });

  it('has no duplicate tool names', () => {
    const names = AGENT_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  describe('JSON Schema validation', () => {
    it.each(AGENT_TOOLS.map((t) => [t.name, t]))(
      '%s has valid JSON Schema parameters',
      (_name: string, tool: AgentTool) => {
        const params = tool.parameters;
        expect(params).toHaveProperty('type', 'object');
        expect(params).toHaveProperty('properties');
        expect(params).toHaveProperty('additionalProperties', false);
      }
    );

    it('search_vault requires "query" parameter', () => {
      const tool = AGENT_TOOLS.find((t) => t.name === 'search_vault');
      const schema = tool?.parameters as { required?: string[] };
      expect(schema.required).toContain('query');
    });

    it('get_item requires "id" parameter', () => {
      const tool = AGENT_TOOLS.find((t) => t.name === 'get_item');
      const schema = tool?.parameters as { required?: string[] };
      expect(schema.required).toContain('id');
    });

    it('create_item requires "type", "name", and "data" parameters', () => {
      const tool = AGENT_TOOLS.find((t) => t.name === 'create_item');
      const schema = tool?.parameters as { required?: string[] };
      expect(schema.required).toEqual(expect.arrayContaining(['type', 'name', 'data']));
    });

    it('update_item requires "id" and "changes" parameters', () => {
      const tool = AGENT_TOOLS.find((t) => t.name === 'update_item');
      const schema = tool?.parameters as { required?: string[] };
      expect(schema.required).toEqual(expect.arrayContaining(['id', 'changes']));
    });

    it('delete_item requires "id" parameter', () => {
      const tool = AGENT_TOOLS.find((t) => t.name === 'delete_item');
      const schema = tool?.parameters as { required?: string[] };
      expect(schema.required).toContain('id');
    });

    it('generate_password has optional parameters only', () => {
      const tool = AGENT_TOOLS.find((t) => t.name === 'generate_password');
      const schema = tool?.parameters as { required?: string[] };
      expect(schema.required).toBeUndefined();
    });

    it('check_breach requires "password" parameter', () => {
      const tool = AGENT_TOOLS.find((t) => t.name === 'check_breach');
      const schema = tool?.parameters as { required?: string[] };
      expect(schema.required).toContain('password');
    });

    it('get_health_report has no parameters', () => {
      const tool = AGENT_TOOLS.find((t) => t.name === 'get_health_report');
      const schema = tool?.parameters as { properties?: Record<string, unknown> };
      expect(Object.keys(schema.properties ?? {})).toHaveLength(0);
    });

    it('list_folders has no parameters', () => {
      const tool = AGENT_TOOLS.find((t) => t.name === 'list_folders');
      const schema = tool?.parameters as { properties?: Record<string, unknown> };
      expect(Object.keys(schema.properties ?? {})).toHaveLength(0);
    });

    it('organize_item requires "id" parameter', () => {
      const tool = AGENT_TOOLS.find((t) => t.name === 'organize_item');
      const schema = tool?.parameters as { required?: string[] };
      expect(schema.required).toContain('id');
    });
  });

  describe('confirmationRequired', () => {
    it.each(DESTRUCTIVE_TOOLS)('%s requires confirmation', (toolName: string) => {
      const tool = AGENT_TOOLS.find((t) => t.name === toolName);
      expect(tool?.confirmationRequired).toBe(true);
    });

    it.each(EXPECTED_TOOL_NAMES.filter((n) => !DESTRUCTIVE_TOOLS.includes(n)))(
      '%s does NOT require confirmation',
      (toolName: string) => {
        const tool = AGENT_TOOLS.find((t) => t.name === toolName);
        expect(tool?.confirmationRequired).toBe(false);
      }
    );
  });

  describe('tool descriptions', () => {
    it.each(AGENT_TOOLS.map((t) => [t.name, t]))(
      '%s has a non-empty description',
      (_name: string, tool: AgentTool) => {
        expect(tool.description.length).toBeGreaterThan(10);
      }
    );
  });
});

describe('getToolDefinitions', () => {
  it('returns an array of ToolDefinition objects', () => {
    const defs = getToolDefinitions();
    expect(defs).toHaveLength(10);
  });

  it('each definition has name, description, and parameters', () => {
    const defs = getToolDefinitions();
    for (const def of defs) {
      expect(def).toHaveProperty('name');
      expect(def).toHaveProperty('description');
      expect(def).toHaveProperty('parameters');
      expect(typeof def.name).toBe('string');
      expect(typeof def.description).toBe('string');
      expect(typeof def.parameters).toBe('object');
    }
  });

  it('does not include confirmationRequired field', () => {
    const defs = getToolDefinitions();
    for (const def of defs) {
      expect(def).not.toHaveProperty('confirmationRequired');
    }
  });

  it('maps tool names correctly', () => {
    const defs = getToolDefinitions();
    const names = defs.map((d) => d.name);
    expect(names).toEqual(EXPECTED_TOOL_NAMES);
  });
});
