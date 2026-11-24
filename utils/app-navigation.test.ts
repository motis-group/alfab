import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { APP_ACCOUNT_SECTION_ITEMS, AppSectionItem } from './app-navigation';

const hrefs = (items: AppSectionItem[]): string[] => items.flatMap((item) => (item.items ? hrefs(item.items) : item.href ? [item.href] : []));

test('every settings page can be reached from the account navigation', () => {
  const root = join(__dirname, '..', 'app', 'settings');
  const pages = ['/settings', ...readdirSync(root).filter((name) => existsSync(join(root, name, 'page.tsx'))).map((name) => `/settings/${name}`)];

  assert.deepEqual(pages.filter((page) => !hrefs(APP_ACCOUNT_SECTION_ITEMS).includes(page)), []);
});

test('the rate lists and the drift check sit together in one group', () => {
  const groups = APP_ACCOUNT_SECTION_ITEMS.filter((item) => item.items);

  assert.equal(groups.length, 1);
  assert.deepEqual(hrefs(groups[0].items ?? []), ['/settings', '/settings/windows', '/settings/awnings', '/settings/drift']);
  assert.ok(!hrefs(groups[0].items ?? []).includes('/settings/billing'));
});
