import { describe, expect, it } from 'vitest';

/**
 * The gate for phase 1: pages are built from the kit's parts, not their own. These checks fail
 * the moment a page goes back to drawing its own title, spinner or confirm box.
 */
const sources = import.meta.glob('./*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const pages = Object.entries(sources).map(([path, text]) => ({ name: path.replace('./', ''), text }));

/** Parts that are not pages, or whose own headings are not page titles. */
const NOT_A_PAGE_TITLE = new Set(['Dashboard.tsx', 'LetterPage.tsx', 'SystemCards.tsx', 'Shell.tsx', 'NewSignInPage.tsx']);
/** Where a drawn width or colour is real data (a bar's length), not styling. */
const MAY_USE_INLINE_STYLE = new Set(['ContributionList.tsx', 'ContributionsPage.tsx', 'Dashboard.tsx', 'DonationsPanel.tsx', 'MoneyBlockParts.tsx', 'MoneyBudgetPage.tsx', 'NewSignInPage.tsx']);

describe('kit gate', () => {
  it('actually sees the pages', () => {
    expect(pages.length).toBeGreaterThan(50);
  });

  it('every page title comes from PageHeader', () => {
    const own = pages.filter((p) => !NOT_A_PAGE_TITLE.has(p.name) && /<h[12][\s>]/.test(p.text)).map((p) => p.name);
    expect(own).toEqual([]);
  });

  it('loading is the kit’s page shape, never a lone spinner (only the sign-in button may spin)', () => {
    const spin = pages.filter((p) => p.name !== 'NewSignInPage.tsx' && /components\/ui\/Spinner/.test(p.text)).map((p) => p.name);
    expect(spin).toEqual([]);
  });

  it('no page draws its own colours or sizes inline, except where a bar’s length is the data', () => {
    const inline = pages.filter((p) => !MAY_USE_INLINE_STYLE.has(p.name) && /style=\{\{/.test(p.text)).map((p) => p.name);
    expect(inline).toEqual([]);
  });

  it('risky actions ask through the kit, not the browser box', () => {
    const native = pages.filter((p) => /window\.confirm|[^.\w]confirm\(|[^.\w]alert\(/.test(p.text)).map((p) => p.name);
    expect(native).toEqual([]);
  });

  it('every page in the routes is loaded on first visit, so the first screen stays small', () => {
    const routes = sources['./NewDesignRoutes.tsx']!;
    const eager = [...routes.matchAll(/import \{[^}]*\} from '\.\/(\w+)';/g)].map((m) => m[1]);
    const layouts = new Set(['GovernanceLayout', 'NewDesignGuards', 'NewSignInPage', 'PeopleLayout', 'PortalLayout', 'SystemFrame', 'pages']);
    expect(eager.filter((m) => !layouts.has(m!))).toEqual([]);
  });

  it('the new app never imports the old one', () => {
    const bad = pages.filter((p) => /from '\.\.\/(services|data|domain|auth|pages|navigation|ministry)(\/|')/.test(p.text)).map((p) => p.name);
    expect(bad).toEqual([]);
  });
});
