import { describe, expect, it } from 'vitest';
import type { LoginItem, SecureNoteItem } from '@lockbox/types';
import { findLegacyLastPassSecureNoteRepairs, lastPassAdapter } from '../lastpass.js';

const options = {
  now: () => new Date('2026-08-01T12:00:00.000Z'),
  createId: (() => {
    let index = 0;
    return () => `item-${++index}`;
  })(),
};

describe('lastPassAdapter', () => {
  it('detects the standard LastPass CSV schema with or without TOTP', () => {
    expect(
      lastPassAdapter.detect(['url', 'username', 'password', 'extra', 'name', 'grouping', 'fav']),
    ).toBeGreaterThan(0.8);
    expect(
      lastPassAdapter.detect([
        'url',
        'username',
        'password',
        'totp',
        'extra',
        'name',
        'grouping',
        'fav',
      ]),
    ).toBe(1);
    expect(lastPassAdapter.detect(['name', 'url'])).toBe(0);
  });

  it('maps login data, notes, TOTP, favourite, and nested folders without exposing secrets in issues', () => {
    const csv = [
      'url,username,password,totp,extra,name,grouping,fav',
      'https://github.com,ryan@example.com,s3cr3t,JBSWY3DPEHPK3PXP,"Recovery hint, line 1",GitHub,Work\\Engineering,1',
    ].join('\n');
    const result = lastPassAdapter.parse(csv, options);
    const record = result.records[0];
    const item = record.item as LoginItem;

    expect(result.issues).toEqual([]);
    expect(record.folderPath).toEqual(['Work', 'Engineering']);
    expect(record.importable).toBe(true);
    expect(item).toMatchObject({
      type: 'login',
      name: 'GitHub',
      username: 'ryan@example.com',
      password: 's3cr3t',
      uris: ['https://github.com'],
      totp: 'JBSWY3DPEHPK3PXP',
      favorite: true,
      customFields: [{ name: 'LastPass notes', value: 'Recovery hint, line 1', type: 'text' }],
      revisionDate: '2026-08-01T12:00:00.000Z',
    });
    expect(JSON.stringify(record.issues)).not.toContain('s3cr3t');
  });

  it('maps LastPass secure-note records to Lockbox secure notes and preserves extra fields', () => {
    const csv = [
      'url,username,password,extra,name,grouping,fav',
      'http://sn,account name,secret value,"Line one\nLine two",Server recovery,Recovery/Runbooks,0',
    ].join('\n');
    const record = lastPassAdapter.parse(csv, options).records[0];
    const item = record.item as SecureNoteItem;

    expect(item.type).toBe('note');
    expect(item.content).toBe('Line one\nLine two');
    expect(item.customFields).toEqual([
      { name: 'LastPass username', value: 'account name', type: 'text' },
      { name: 'LastPass password', value: 'secret value', type: 'hidden' },
    ]);
    expect(record.folderPath).toEqual(['Recovery', 'Runbooks']);
  });

  it.each([
    'http://sn',
    'HTTP://SN/',
    'https://sn?type=server',
    'http://sn#secure-note',
  ])('recognises the LastPass secure-note sentinel variant %s', (url) => {
    const result = lastPassAdapter.parse(
      `url,username,password,extra,name,grouping,fav\n${url},,,Recovery details,Recovery note,,0`,
      options,
    );

    expect(result.records[0].item).toMatchObject({
      type: 'note',
      name: 'Recovery note',
      content: 'Recovery details',
    });
  });

  it('does not mistake a real hostname beginning with sn for a secure note', () => {
    const result = lastPassAdapter.parse(
      'url,username,password,extra,name,grouping,fav\nhttps://sneaky.example,user,password,,Example,,0',
      options,
    );

    expect(result.records[0].item.type).toBe('login');
  });

  it('finds only unambiguous legacy http://sn logins for recoverable cleanup', () => {
    const result = lastPassAdapter.parse(
      [
        'url,username,password,extra,name,grouping,fav',
        'http://sn,account,secret,Recovered body,Server recovery,,0',
        'http://sn,,,First body,Repeated name,,0',
        'http://sn,,,Second body,Repeated name,,0',
      ].join('\n'),
      options,
    );
    const baseLegacyItem: LoginItem = {
      id: 'legacy-server-recovery',
      type: 'login',
      name: 'Server recovery',
      username: 'account',
      password: 'secret',
      uris: ['http://sn'],
      tags: [],
      favorite: false,
      createdAt: '2026-07-31T00:00:00.000Z',
      updatedAt: '2026-07-31T00:00:00.000Z',
      revisionDate: '2026-07-31T00:00:00.000Z',
    };
    const repeatedLegacyItem: LoginItem = {
      ...baseLegacyItem,
      id: 'legacy-repeated',
      name: 'Repeated name',
      username: '',
      password: '',
    };

    expect(
      findLegacyLastPassSecureNoteRepairs(result.records, [
        baseLegacyItem,
        repeatedLegacyItem,
      ]),
    ).toEqual([
      {
        sourceId: result.records[0].sourceId,
        existingItemId: 'legacy-server-recovery',
      },
    ]);
  });

  it('decodes the HTML entities produced in LastPass exports', () => {
    const result = lastPassAdapter.parse(
      'url,username,password,extra,name,grouping,fav\nhttps://example.com,user,p&amp;ss,Tom &amp; Jerry,Example &quot;Main&quot;,,0',
      options,
    );
    const item = result.records[0].item as LoginItem;

    expect(item.password).toBe('p&ss');
    expect(item.name).toBe('Example "Main"');
    expect(item.customFields?.[0].value).toBe('Tom & Jerry');
  });

  it('preserves invalid authenticator values losslessly without creating a broken TOTP field', () => {
    const result = lastPassAdapter.parse(
      'url,username,password,totp,extra,name,grouping,fav\nhttps://example.com,user,password,not-base32,,Example,,0',
      options,
    );
    const record = result.records[0];
    const item = record.item as LoginItem;

    expect(record.importable).toBe(true);
    expect(record.issues).toContainEqual(
      expect.objectContaining({ code: 'lastpass_invalid_totp', severity: 'warning', column: 'totp' }),
    );
    expect(item.totp).toBeUndefined();
    expect(item.customFields).toContainEqual({
      name: 'LastPass authenticator (invalid)',
      value: 'not-base32',
      type: 'hidden',
    });
    expect(JSON.stringify(record.issues)).not.toContain('not-base32');
  });

  it('leaves out-of-range numeric HTML entities intact instead of throwing', () => {
    const result = lastPassAdapter.parse(
      'url,username,password,extra,name,grouping,fav\nhttps://example.com,user,password,,Example &#x110000;,,0',
      options,
    );

    expect(result.records[0].item.name).toBe('Example &#x110000;');
  });

  it('derives a useful name and warns for recoverable data quality problems', () => {
    const result = lastPassAdapter.parse(
      'url,username,password,extra,name,grouping,fav\nhttps://www.example.com,user,password,,,,maybe',
      options,
    );
    const record = result.records[0];

    expect(record.item.name).toBe('example.com');
    expect(record.importable).toBe(true);
    expect(record.issues.map((issue) => issue.code)).toEqual([
      'lastpass_unknown_favorite',
      'lastpass_missing_name',
    ]);
  });

  it('blocks malformed CSV and files missing required headers', () => {
    const malformed = lastPassAdapter.parse(
      'url,username,password,name\n"https://example.com,user,password,Example',
      options,
    );
    expect(malformed.records).toEqual([]);
    expect(malformed.issues.some((issue) => issue.code === 'csv_unclosed_quote')).toBe(true);

    const wrongSchema = lastPassAdapter.parse('name,url\nExample,https://example.com', options);
    expect(wrongSchema.records).toEqual([]);
    expect(wrongSchema.issues.filter((issue) => issue.code === 'lastpass_missing_header')).toHaveLength(2);
  });

  it('marks empty secure notes as non-importable and skips blank rows', () => {
    const result = lastPassAdapter.parse(
      'url,username,password,extra,name,grouping,fav\n\nhttp://sn,,,,Empty note,,0',
      options,
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0].importable).toBe(false);
    expect(result.records[0].issues[0].code).toBe('lastpass_empty_note');
  });
});
