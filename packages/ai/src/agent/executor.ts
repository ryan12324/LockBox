/**
 * Agent tool executor — dispatches LLM tool calls to local vault operations.
 *
 * **PRIVACY-CRITICAL:** All results returned to the LLM are sanitized.
 * Passwords, card numbers, CVVs, and TOTP secrets are NEVER exposed in
 * tool results. The LLM only sees non-sensitive metadata.
 */

import type {
  AgentToolCall,
  AgentToolResult,
  VaultItem,
  LoginItem,
  CardItem,
  SecureNoteItem,
  Folder,
} from '@lockbox/types';
import { SemanticSearch } from '../search/semantic.js';
import { KeywordEmbeddingProvider } from '../search/embeddings.js';
import { analyzeVaultHealth } from '../health/analyzer.js';
import { generatePassword } from '@lockbox/generator';
import { checkPassword } from '@lockbox/crypto';
import { AGENT_TOOLS } from './tools.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Context provided by the UI to the tool executor. */
export interface AgentContext {
  /** Decrypted vault items. */
  vault: VaultItem[];
  /** All folders. */
  folders: Folder[];
  /** Callback to create a new vault item. */
  onCreateItem: (item: Partial<VaultItem>) => Promise<VaultItem>;
  /** Callback to update an existing vault item. */
  onUpdateItem: (id: string, changes: Partial<VaultItem>) => Promise<VaultItem>;
  /** Callback to delete a vault item. */
  onDeleteItem: (id: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Sanitization (PRIVACY-CRITICAL)
// ---------------------------------------------------------------------------

/**
 * Sanitize a vault item for LLM consumption — strips all secrets.
 *
 * - LoginItem: strips password and totp
 * - CardItem: strips full number (returns last4) and cvv
 * - SecureNoteItem: returns content (not secret data)
 */
function sanitizeItem(item: VaultItem): Record<string, unknown> {
  const base = {
    id: item.id,
    type: item.type,
    name: item.name,
    folderId: item.folderId,
    tags: item.tags,
    favorite: item.favorite,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    revisionDate: item.revisionDate,
  };

  switch (item.type) {
    case 'login': {
      const login = item as LoginItem;
      return {
        ...base,
        username: login.username,
        uris: login.uris,
      };
    }
    case 'card': {
      const card = item as CardItem;
      return {
        ...base,
        cardholderName: card.cardholderName,
        brand: card.brand,
        last4: card.number.slice(-4),
        expMonth: card.expMonth,
        expYear: card.expYear,
      };
    }
    case 'note': {
      const note = item as SecureNoteItem;
      return {
        ...base,
        content: note.content,
      };
    }
    default:
      return base;
  }
}

// ---------------------------------------------------------------------------
// ToolExecutor
// ---------------------------------------------------------------------------

/**
 * Executes agent tool calls locally against the vault.
 *
 * All results are sanitized before being returned to the LLM.
 * Passwords, full card numbers, CVVs, and TOTP secrets are never included.
 */
export class ToolExecutor {
  private context: AgentContext;
  private semanticSearch: SemanticSearch | null = null;

  constructor(context: AgentContext) {
    this.context = context;
  }

  /** Execute a tool call and return a sanitized result. */
  async execute(call: AgentToolCall): Promise<AgentToolResult> {
    try {
      const tool = AGENT_TOOLS.find((t) => t.name === call.name);
      if (!tool) {
        return { name: call.name, result: null, error: `Unknown tool: ${call.name}` };
      }

      const result = await this.dispatch(call);
      return { name: call.name, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { name: call.name, result: null, error: message };
    }
  }

  // -------------------------------------------------------------------------
  // Dispatch
  // -------------------------------------------------------------------------

  private async dispatch(call: AgentToolCall): Promise<unknown> {
    const args = call.arguments;

    switch (call.name) {
      case 'search_vault':
        return this.searchVault(args);
      case 'get_item':
        return this.getItem(args);
      case 'create_item':
        return this.createItem(args);
      case 'update_item':
        return this.updateItem(args);
      case 'delete_item':
        return this.deleteItem(args);
      case 'generate_password':
        return this.handleGeneratePassword(args);
      case 'check_breach':
        return this.handleCheckBreach(args);
      case 'get_health_report':
        return this.getHealthReport();
      case 'list_folders':
        return this.listFolders();
      case 'organize_item':
        return this.organizeItem(args);
      default:
        throw new Error(`Unhandled tool: ${call.name}`);
    }
  }

  // -------------------------------------------------------------------------
  // Tool handlers
  // -------------------------------------------------------------------------

  /** Lazily initialize the semantic search engine and index the vault. */
  private async getSemanticSearch(): Promise<SemanticSearch> {
    if (!this.semanticSearch) {
      const provider = new KeywordEmbeddingProvider();
      await provider.initialize();
      this.semanticSearch = new SemanticSearch(provider);
      await this.semanticSearch.index(this.context.vault);
    }
    return this.semanticSearch;
  }

  private async searchVault(args: Record<string, unknown>): Promise<unknown> {
    const query = args.query;
    if (!query || typeof query !== 'string') {
      throw new Error('search_vault requires a "query" string parameter');
    }

    const limit = typeof args.limit === 'number' ? args.limit : 10;
    const search = await this.getSemanticSearch();
    const results = await search.search(query, { limit });

    return results.map((r) => ({
      ...sanitizeItem(r.item),
      score: r.score,
      matchType: r.matchType,
    }));
  }

  private getItem(args: Record<string, unknown>): unknown {
    const id = args.id;
    if (!id || typeof id !== 'string') {
      throw new Error('get_item requires an "id" string parameter');
    }

    const item = this.context.vault.find((v) => v.id === id);
    if (!item) {
      throw new Error(`Item not found: ${id}`);
    }

    return sanitizeItem(item);
  }

  private async createItem(args: Record<string, unknown>): Promise<unknown> {
    const type = args.type;
    const name = args.name;
    const data = args.data;

    if (!type || typeof type !== 'string') {
      throw new Error('create_item requires a "type" string parameter');
    }
    if (!name || typeof name !== 'string') {
      throw new Error('create_item requires a "name" string parameter');
    }
    if (!data || typeof data !== 'object') {
      throw new Error('create_item requires a "data" object parameter');
    }

    const itemData = data as Record<string, unknown>;
    const newItem = await this.context.onCreateItem({
      type: type as VaultItem['type'],
      name,
      ...itemData,
    } as Partial<VaultItem>);

    return sanitizeItem(newItem);
  }

  private async updateItem(args: Record<string, unknown>): Promise<unknown> {
    const id = args.id;
    const changes = args.changes;

    if (!id || typeof id !== 'string') {
      throw new Error('update_item requires an "id" string parameter');
    }
    if (!changes || typeof changes !== 'object') {
      throw new Error('update_item requires a "changes" object parameter');
    }

    const updated = await this.context.onUpdateItem(id, changes as Partial<VaultItem>);
    return sanitizeItem(updated);
  }

  private async deleteItem(args: Record<string, unknown>): Promise<unknown> {
    const id = args.id;
    if (!id || typeof id !== 'string') {
      throw new Error('delete_item requires an "id" string parameter');
    }

    await this.context.onDeleteItem(id);
    return { deleted: true, id };
  }

  private handleGeneratePassword(args: Record<string, unknown>): unknown {
    const length = typeof args.length === 'number' ? args.length : undefined;
    const uppercase = typeof args.uppercase === 'boolean' ? args.uppercase : undefined;
    const lowercase = typeof args.lowercase === 'boolean' ? args.lowercase : undefined;
    const digits = typeof args.digits === 'boolean' ? args.digits : undefined;
    const special = typeof args.special === 'boolean' ? args.special : undefined;

    const password = generatePassword({
      ...(length !== undefined && { length }),
      ...(uppercase !== undefined && { uppercase }),
      ...(lowercase !== undefined && { lowercase }),
      ...(digits !== undefined && { digits }),
      // Map 'special' to 'symbols' for the generator API
      ...(special !== undefined && { symbols: special }),
    });

    return { password };
  }

  private async handleCheckBreach(args: Record<string, unknown>): Promise<unknown> {
    const password = args.password;
    if (!password || typeof password !== 'string') {
      throw new Error('check_breach requires a "password" string parameter');
    }

    const result = await checkPassword(password);
    // Return breach status — never echo back the password itself
    return { found: result.found, count: result.count, checkedAt: result.checkedAt };
  }

  private async getHealthReport(): Promise<unknown> {
    const loginItems = this.context.vault.filter(
      (item): item is LoginItem => item.type === 'login'
    );
    return analyzeVaultHealth(loginItems);
  }

  private listFolders(): unknown {
    return this.context.folders;
  }

  private async organizeItem(args: Record<string, unknown>): Promise<unknown> {
    const id = args.id;
    if (!id || typeof id !== 'string') {
      throw new Error('organize_item requires an "id" string parameter');
    }

    const item = this.context.vault.find((v) => v.id === id);
    if (!item) {
      throw new Error(`Item not found: ${id}`);
    }

    const changes: Partial<VaultItem> = {};

    // Apply folder change
    if (args.folderId !== undefined) {
      changes.folderId = args.folderId as string;
    }

    // Apply tag changes
    const addTags = args.addTags as string[] | undefined;
    const removeTags = args.removeTags as string[] | undefined;

    if (addTags || removeTags) {
      let tags = [...item.tags];
      if (addTags) {
        tags = [...new Set([...tags, ...addTags])];
      }
      if (removeTags) {
        tags = tags.filter((t) => !removeTags.includes(t));
      }
      changes.tags = tags;
    }

    const updated = await this.context.onUpdateItem(id, changes);
    return sanitizeItem(updated);
  }
}
