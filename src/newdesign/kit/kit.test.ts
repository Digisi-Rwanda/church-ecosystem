import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n/I18nContext';
import { initialsOf } from './initials';
import { ListRow, RowList } from './ListRow';
import { PageHeader } from './PageHeader';
import { CardsSkeleton, PageSkeleton, ShellSkeleton } from './Skeletons';
import { StatusChip } from './StatusChip';

const render = (node: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(h(I18nProvider, null, h(MemoryRouter, null, node)));

describe('PageHeader', () => {
  it('shows the title with its id, the purpose line, and puts the primary button last', () => {
    const html = render(
      h(PageHeader, {
        id: 'x-title',
        title: 'Programs',
        purpose: 'What the ministry plans to do',
        primary: h('button', { className: 'btn' }, 'New program'),
        actions: h('button', { className: 'btn secondary' }, 'Export'),
      }),
    );
    expect(html).toContain('<h2 id="x-title">Programs</h2>');
    expect(html).toContain('page-purpose');
    expect(html.indexOf('Export')).toBeLessThan(html.indexOf('New program'));
  });
  it('draws no empty parts when there is only a title', () => {
    const html = render(h(PageHeader, { title: 'Only' }));
    expect(html).not.toContain('page-purpose');
    expect(html).not.toContain('page-actions');
  });
});

describe('ListRow', () => {
  it('makes the whole row a link when it has an address, and keeps the action beside it', () => {
    const html = render(
      h(RowList, {
        label: 'People',
        children: h(ListRow, { title: 'Jean Mugabo', detail: 'Youth', avatarName: 'Jean Mugabo', to: '/s/sys-youth/people/p1', action: h('button', null, 'Call') }),
      }),
    );
    expect(html).toContain('<a class="list-row-main" href="/s/sys-youth/people/p1"');
    expect(html).toContain('>JM<');
    expect(html).toContain('list-row-action');
  });
  it('is a plain row without an address', () => {
    const html = render(h(RowList, { children: h(ListRow, { title: 'Alone' }) }));
    expect(html).not.toContain('<a ');
  });
  it('makes initials from one or several names', () => {
    expect(initialsOf('Aline')).toBe('A');
    expect(initialsOf('  Aline  Uwase Mukamana ')).toBe('AM');
    expect(initialsOf('')).toBe('?');
  });
});

describe('StatusChip', () => {
  it('always carries the words, with the tone as a class', () => {
    const html = render(h(StatusChip, { tone: 'warn', children: 'Late' }));
    expect(html).toContain('chip-warn');
    expect(html).toContain('Late');
    expect(html).toContain('aria-hidden');
  });
});

describe('loading shapes', () => {
  it('announce themselves as busy and show the shape of a page, never a bare spinner', () => {
    for (const node of [h(PageSkeleton), h(CardsSkeleton), h(ShellSkeleton)]) {
      const html = render(node);
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('role="status"');
      expect(html).toContain('skeleton');
      expect(html).not.toContain('spinner');
    }
  });
  it('can leave out the header shape when the page already shows its own', () => {
    expect(render(h(PageSkeleton, { header: false }))).not.toContain('page-head');
  });
  it('page skeleton shows a header shape and rows', () => {
    const html = render(h(PageSkeleton, { rows: 3 }));
    expect(html).toContain('page-head');
    expect(html.match(/skeleton-row/g)?.length).toBe(3);
  });
});
