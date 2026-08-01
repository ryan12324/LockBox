import { describe, expect, it } from 'vitest';
import type { LoginItem, SecureNoteItem } from '@lockbox/types';
import { androidLastPassImportProvider, parseLastPassOnAndroid } from '../import';

describe('Android LastPass import compatibility', () => {
  it('uses the shared client-side adapter packaged into the Android WebView', () => {
    expect(androidLastPassImportProvider.id).toBe('lastpass');
    const result = parseLastPassOnAndroid(
      [
        'url,username,password,extra,name,grouping,fav',
        'https://example.com,android-user,android-secret,"Line one\nLine two",Example,Mobile/Foldable,1',
      ].join('\n'),
      {
        now: () => new Date('2026-08-01T00:00:00.000Z'),
        createId: () => 'android-import-item',
      },
    );
    const record = result.records[0];
    const item = record.item as LoginItem;

    expect(result.issues).toEqual([]);
    expect(record.folderPath).toEqual(['Mobile', 'Foldable']);
    expect(item.password).toBe('android-secret');
    expect(item.customFields?.[0].value).toBe('Line one\nLine two');
    expect(item.favorite).toBe(true);
  });

  it('imports LastPass http://sn rows as secure notes on Android', () => {
    const result = parseLastPassOnAndroid(
      'url,username,password,extra,name,grouping,fav\nhttp://sn,,,Private note,Recovery note,Mobile,0',
      {
        now: () => new Date('2026-08-01T00:00:00.000Z'),
        createId: () => 'android-secure-note',
      },
    );
    const item = result.records[0].item as SecureNoteItem;

    expect(item.type).toBe('note');
    expect(item.content).toBe('Private note');
    expect(item.name).toBe('Recovery note');
  });
});
