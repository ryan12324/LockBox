import { describe, expect, it } from 'vitest';
import {
  LOCKBOX_PRODUCT,
  LOCKBOX_PROTOCOL_VERSION,
  type LockboxHealthResponse,
} from '@lockbox/types/discovery';
import { app } from '../index.js';

describe('Lockbox instance identity', () => {
  it('identifies the API and its supported discovery protocol', async () => {
    const response = await app.request('/health');
    const body = (await response.json()) as LockboxHealthResponse;

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(body).toMatchObject({
      product: LOCKBOX_PRODUCT,
      protocolVersion: LOCKBOX_PROTOCOL_VERSION,
      status: 'ok',
    });
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });
});
