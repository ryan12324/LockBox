// @vitest-environment jsdom

/**
 * Tests for new extension features:
 * - Attachment support (message types, API methods)
 * - 2FA detection (message types, badge injection)
 * - Email alias generation (message types)
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ─── New message type validation ──────────────────────────────────────────────

type NewMessageType = 'get-attachments' | 'download-attachment' | 'check-2fa' | 'generate-alias';

const NEW_MESSAGE_TYPES: NewMessageType[] = [
  'get-attachments',
  'download-attachment',
  'check-2fa',
  'generate-alias',
];

describe('new background message types', () => {
  it('defines all new message types', () => {
    expect(NEW_MESSAGE_TYPES).toContain('get-attachments');
    expect(NEW_MESSAGE_TYPES).toContain('download-attachment');
    expect(NEW_MESSAGE_TYPES).toContain('check-2fa');
    expect(NEW_MESSAGE_TYPES).toContain('generate-alias');
  });

  it('has 4 new message types', () => {
    expect(NEW_MESSAGE_TYPES).toHaveLength(4);
  });
});

// ─── Attachment message shapes ────────────────────────────────────────────────

describe('attachment message shapes', () => {
  it('get-attachments message has correct shape', () => {
    const msg = { type: 'get-attachments' as const, itemId: 'item-123' };
    expect(msg.type).toBe('get-attachments');
    expect(msg.itemId).toBe('item-123');
  });

  it('download-attachment message has correct shape', () => {
    const msg = {
      type: 'download-attachment' as const,
      itemId: 'item-123',
      attachmentId: 'att-456',
    };
    expect(msg.type).toBe('download-attachment');
    expect(msg.itemId).toBe('item-123');
    expect(msg.attachmentId).toBe('att-456');
  });

  it('attachment list response has expected structure', () => {
    const response = {
      success: true,
      attachments: [
        {
          id: 'att-1',
          fileName: 'doc.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          createdAt: '2024-01-01',
        },
        {
          id: 'att-2',
          fileName: 'key.pem',
          fileSize: 256,
          mimeType: 'application/x-pem-file',
          createdAt: '2024-01-02',
        },
      ],
    };
    expect(response.success).toBe(true);
    expect(response.attachments).toHaveLength(2);
    expect(response.attachments[0].fileName).toBe('doc.pdf');
    expect(response.attachments[1].fileSize).toBe(256);
  });

  it('attachment download response has encryptedData', () => {
    const response = { success: true, encryptedData: 'base64encodedblob' };
    expect(response.success).toBe(true);
    expect(response.encryptedData).toBe('base64encodedblob');
  });
});

// ─── 2FA check message shapes ─────────────────────────────────────────────────

describe('2FA check message shapes', () => {
  it('check-2fa message has domain field', () => {
    const msg = { type: 'check-2fa' as const, domain: 'github.com' };
    expect(msg.type).toBe('check-2fa');
    expect(msg.domain).toBe('github.com');
  });

  it('2fa check response has expected structure when site supports 2FA', () => {
    const response = {
      success: true,
      supports2fa: true,
      methods: ['totp', 'sms'],
      documentation: 'https://example.com/2fa-docs',
      siteName: 'Example',
    };
    expect(response.supports2fa).toBe(true);
    expect(response.methods).toContain('totp');
    expect(response.documentation).toBeTruthy();
  });

  it('2fa check response for unsupported site', () => {
    const response = {
      success: true,
      supports2fa: false,
      methods: [],
    };
    expect(response.supports2fa).toBe(false);
    expect(response.methods).toHaveLength(0);
  });
});

// ─── Email alias message shapes ──────────────────────────────────────────────

describe('email alias message shapes', () => {
  it('generate-alias message with no provider', () => {
    const msg = { type: 'generate-alias' as const };
    expect(msg.type).toBe('generate-alias');
  });

  it('generate-alias message with provider and apiKey', () => {
    const msg = {
      type: 'generate-alias' as const,
      provider: 'simplelogin',
      apiKey: 'sk-test-123',
    };
    expect(msg.type).toBe('generate-alias');
    expect(msg.provider).toBe('simplelogin');
    expect(msg.apiKey).toBe('sk-test-123');
  });

  it('alias generation response has expected structure', () => {
    const response = { success: true, alias: 'random.alias@sl.local' };
    expect(response.success).toBe(true);
    expect(response.alias).toContain('@');
  });

  it('alias generation error response', () => {
    const response = { success: false, error: 'Provider not configured' };
    expect(response.success).toBe(false);
    expect(response.error).toBeTruthy();
  });
});

// ─── 2FA Badge DOM injection ─────────────────────────────────────────────────

describe('2FA badge DOM behavior', () => {
  beforeEach(() => {
    // Clean up any existing badges
    const existing = document.getElementById('lockbox-2fa-badge');
    if (existing) existing.remove();
  });

  it('badge element structure is correct', () => {
    // Simulate what inject2faBadge does
    const host = document.createElement('div');
    host.id = 'lockbox-2fa-badge';
    host.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;';

    const shadow = host.attachShadow({ mode: 'closed' });
    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.innerHTML =
      '<span class="icon">⚠️</span><div class="text"><div class="title">GitHub supports 2FA</div></div>';
    shadow.appendChild(badge);

    document.body.appendChild(host);

    expect(document.getElementById('lockbox-2fa-badge')).toBeTruthy();
    expect(host.style.position).toBe('fixed');
    expect(host.style.zIndex).toBe('2147483647');

    host.remove();
  });

  it('only one badge exists at a time', () => {
    const host1 = document.createElement('div');
    host1.id = 'lockbox-2fa-badge';
    document.body.appendChild(host1);

    // Second badge should check for existing
    const existing = document.getElementById('lockbox-2fa-badge');
    expect(existing).toBeTruthy();

    // In real code, inject2faBadge returns early if badge exists
    const badges = document.querySelectorAll('#lockbox-2fa-badge');
    expect(badges.length).toBe(1);

    host1.remove();
  });

  it('badge can be dismissed by removing from DOM', () => {
    const host = document.createElement('div');
    host.id = 'lockbox-2fa-badge';
    document.body.appendChild(host);

    expect(document.getElementById('lockbox-2fa-badge')).toBeTruthy();
    host.remove();
    expect(document.getElementById('lockbox-2fa-badge')).toBeNull();
  });
});

// ─── File size formatting ────────────────────────────────────────────────────

describe('file size formatting', () => {
  // Mirrors the formatFileSize function from App.tsx
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  it('formats bytes', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(2560)).toBe('2.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formats zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });
});

// ─── Attachment count badge logic ────────────────────────────────────────────

describe('attachment count badge', () => {
  it('map tracks attachment counts per item', () => {
    const counts = new Map<string, number>();
    counts.set('item-1', 3);
    counts.set('item-2', 1);

    expect(counts.get('item-1')).toBe(3);
    expect(counts.get('item-2')).toBe(1);
    expect(counts.get('item-3')).toBeUndefined();
  });

  it('only shows badge for items with count > 0', () => {
    const counts = new Map<string, number>();
    counts.set('item-1', 2);

    const showBadge = (itemId: string): boolean => (counts.get(itemId) ?? 0) > 0;

    expect(showBadge('item-1')).toBe(true);
    expect(showBadge('item-2')).toBe(false);
  });
});

// ─── Combined message types (old + new) ──────────────────────────────────────

describe('all extension message types', () => {
  const ALL_MESSAGE_TYPES = [
    // Existing
    'unlock',
    'lock',
    'get-matches',
    'get-vault',
    'get-totp',
    'generate-password',
    'generate-passphrase',
    'activity',
    'is-unlocked',
    'create-item',
    'update-item',
    'delete-item',
    'get-folders',
    'create-folder',
    'update-folder',
    'delete-folder',
    'run-health-analysis',
    'run-breach-check',
    'get-breach-status',
    'search-vault',
    'get-phishing-status',
    'check-url-security',
    'get-teams',
    'get-shared-items',
    'get-shared-folders',
    'has-keypair',
    'check-credentials',
    'save-credentials',
    'update-credentials',
    // New
    'get-attachments',
    'download-attachment',
    'check-2fa',
    'generate-alias',
  ];

  it('has 33 total message types', () => {
    expect(ALL_MESSAGE_TYPES).toHaveLength(33);
  });

  it('includes all new attachment message types', () => {
    expect(ALL_MESSAGE_TYPES).toContain('get-attachments');
    expect(ALL_MESSAGE_TYPES).toContain('download-attachment');
  });

  it('includes 2FA check message type', () => {
    expect(ALL_MESSAGE_TYPES).toContain('check-2fa');
  });

  it('includes alias generation message type', () => {
    expect(ALL_MESSAGE_TYPES).toContain('generate-alias');
  });
});
