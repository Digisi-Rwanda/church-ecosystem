import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { ProtocolMinePage } from './ProtocolMinePage';
const state = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock('./useLoad', () => ({ useLoad: () => ({ data: state.data, loading: false, failed: false, reload: vi.fn() }) }));
afterEach(() => vi.useRealTimers());
describe('published personal Protocol workflow', () => {
  it('distinguishes voluntary duty and exposes only the recipient offer, without team-head controls', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T12:00:00Z'));
    state.data = { duties: [{ serviceId: 'service-1', date: '2030-01-06', kind: 'SS1', label: 'Sunday', role: 'MEMBER', slotKind: 'FILL_IN', absence: null, attendance: null, swapOffers: [] }], leading: [], fillInOffers: [{ id: 'offer', serviceId: 'service-1', excused: 'Alice' }], absencesToDecide: [], others: [], pool: [] };
    const html = renderToStaticMarkup(h(I18nProvider, null, h(ProtocolMinePage)));
    expect(html).toContain('Fill-in');
    expect(html).toContain('You are asked to fill in for Alice.');
    expect(html).toContain('Ask to be excused');
    expect(html).not.toContain('Offer the place');
    expect(html).not.toContain('Services I lead');
  });
});
