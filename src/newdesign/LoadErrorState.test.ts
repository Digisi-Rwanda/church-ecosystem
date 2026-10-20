import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { LoadErrorState } from './LoadErrorState';
import { LoadState } from './LoadState';

vi.mock('./FrontDoorContext', () => ({ useFrontDoor: () => ({ signOut: () => {} }) }));

const render = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(h(I18nProvider, null, h(MemoryRouter, null, node)));
const retry = () => {};

describe('LoadErrorState', () => {
  it('offers sign in, not retry, when the session ended', () => {
    const html = render(h(LoadErrorState, { kind: 'auth', retry }));
    expect(html).toContain('Your session has ended');
    expect(html).toContain('>Sign in<');
    expect(html).not.toContain('Try again');
    expect(html).not.toContain('went wrong');
  });

  it('says access is denied, with no retry', () => {
    const html = render(h(LoadErrorState, { kind: 'forbidden', retry }));
    expect(html).toContain('You do not have access to this');
    expect(html).not.toContain('Try again');
    expect(html).not.toContain('went wrong');
  });

  it('reads the same for a missing record as for one the person may not see', () => {
    const html = render(h(LoadErrorState, { kind: 'notFound', retry }));
    expect(html).toContain('We could not find this');
    expect(html).toContain('may not be open to you');
    expect(html).toContain('Go back');
    expect(html).not.toContain('Try again');
  });

  it('offers retry for a server failure and for no connection only', () => {
    const server = render(h(LoadErrorState, { kind: 'server', retry }));
    expect(server).toContain('Something went wrong on our side');
    expect(server).toContain('Try again');
    const offline = render(h(LoadErrorState, { kind: 'offline', retry }));
    expect(offline).toContain('No connection');
    expect(offline).toContain('Try again');
    expect(render(h(LoadErrorState, { kind: 'invalid', retry }))).not.toContain('Try again');
  });

  it('is what LoadState shows, kind by kind, and never raw error text', () => {
    const html = render(h(LoadState, { loading: false, failed: 'forbidden', retry, children: h('p', null, 'content') }));
    expect(html).toContain('You do not have access to this');
    expect(html).not.toContain('content');
    expect(render(h(LoadState, { loading: false, failed: true, retry, children: h('p', null, 'x') }))).toContain('went wrong');
    expect(render(h(LoadState, { loading: false, failed: false, retry, children: h('p', null, 'content') }))).toContain('content');
  });
});
