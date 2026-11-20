import { describe, expect, it } from 'vitest';
import {
  generateConfiguredMusicSchedule,
  validateConfiguredMusicSchedule,
  type ConfiguredMusicRules,
} from '../src/music/configuredEngine';
import type { MusicScheduleUnit, MusicServiceSlot } from '../src/music/types';
import type {
  CategoryServicePolicyView,
  ChoirCategoryLinkView,
  ChoirCategoryView,
  SchedulingServiceView,
} from '../src/scheduling/types';

const serviceDefinition: SchedulingServiceView = {
  id: 'ss1-v1', systemId: 'sys-music', code: 'ss1', name: 'Sunday service',
  kind: 'SERVICE', weekday: 0, time: null, recurrence: 'WEEKLY', selectedDates: [],
  active: true, effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: null,
  musicRequired: true, protocolRequired: true, maxChoirs: 3, targetTeamSize: 10,
  configVersionId: 'music-v1', displayOrder: 0, supersedesId: null,
  createdByPersonId: 'leader', createdAt: '2026-01-01T00:00:00.000Z',
};
const primary: ChoirCategoryView = {
  id: 'primary-v1', systemId: 'sys-music', code: 'PRIMARY', name: 'Primary choir',
  description: '', active: true, effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: null, configVersionId: 'music-v1', supersedesId: null,
  createdByPersonId: 'leader', createdAt: '2026-01-01T00:00:00.000Z',
};
const secondary: ChoirCategoryView = { ...primary, id: 'secondary-v1', code: 'SECONDARY', name: 'Secondary choir' };
const policy = (updates: Partial<CategoryServicePolicyView> = {}): CategoryServicePolicyView => ({
  id: 'policy-v1', systemId: 'sys-music', categoryId: primary.id, serviceId: serviceDefinition.id,
  eligible: true, active: true, frequencyTarget: null, frequencyCounting: 'ASSIGNMENTS',
  frequencyKind: 'TARGET', frequencyPeriod: null, planningMode: 'ROTATION',
  minCount: 1, maxCount: 2, requireAll: false, configVersionId: 'music-v1',
  effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: null, supersedesId: null,
  createdByPersonId: 'leader', createdAt: '2026-01-01T00:00:00.000Z', ...updates,
});
const link = (choirId: string, updates: Partial<ChoirCategoryLinkView> = {}): ChoirCategoryLinkView => ({
  id: `link-${choirId}`, systemId: 'sys-music', choirId, categoryId: primary.id,
  eligibleOverride: {}, frequencyOverride: {}, active: true,
  effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: null,
  configVersionId: 'music-v1', supersedesId: null, createdByPersonId: 'leader',
  createdAt: '2026-01-01T00:00:00.000Z', ...updates,
});
const rules = (updates: Partial<ConfiguredMusicRules> = {}): ConfiguredMusicRules => ({
  services: [serviceDefinition], categories: [primary], policies: [policy()],
  links: [link('choir-a'), link('choir-b')], fixedAssignments: [], unavailability: [], ...updates,
});
const slot = (periodKey = '2026-01', date = `${periodKey}-04`, id = `ss1-${date}`): MusicServiceSlot => ({
  id, periodKey, date, kind: 'SS1', label: `Sunday ${date}`, musicRequired: true,
  maxChoirs: 3,
});
const units: MusicScheduleUnit[] = [
  { id: 'choir-a', kind: 'SECONDARY', name: 'Choir A', active: true },
  { id: 'choir-b', kind: 'PRIMARY', name: 'Choir B', active: true },
  { id: 'choir-inactive', kind: 'PRIMARY', name: 'Inactive choir', active: false },
];

describe('configured Music candidate engine', () => {
  it('uses the configured consecutive limit across saved months', () => {
    const previous = [slot('2026-01', '2026-01-18'), slot('2026-01', '2026-01-25')];
    const current = slot('2026-02', '2026-02-01');
    const assigned = (service: MusicServiceSlot) => ({
      id: service.id, serviceId: service.id, unitId: 'choir-a', source: 'MANUAL' as const,
    });
    for (const maximum of [3, null]) {
      const input = {
        services: [current], units,
        rules: rules({ lineupLimits: { primaryPerDay: 1, consecutivePerService: maximum } }),
        history: [{ services: previous, assignments: previous.map(assigned) }],
        assignments: [assigned(current)],
      };
      expect(validateConfiguredMusicSchedule(input).ok).toBe(true);
    }
  });
  it('allows editing a valid service when a different service has an inactive assignment', () => {
    const edited = slot();
    const unrelated = slot('2026-01', '2026-01-11');
    const input = {
      services: [edited, unrelated], units, rules: rules(),
      assignments: [
        { id: 'edited', serviceId: edited.id, unitId: 'choir-b', source: 'MANUAL' as const },
        { id: 'unrelated', serviceId: unrelated.id, unitId: 'choir-inactive', source: 'ENGINE' as const },
      ],
    };
    expect(validateConfiguredMusicSchedule(input).reason).toMatch(/inactive/);
    expect(validateConfiguredMusicSchedule({
      ...input, lineupChange: { serviceId: edited.id, unitId: 'choir-b', removedUnitId: 'choir-a' },
    }).ok).toBe(true);
  });

  it('chooses different primary choirs for SS1 and SS2 on the same day and refuses an invalid edit', () => {
    const first = slot();
    const second: MusicServiceSlot = { ...first, id: 'ss2', kind: 'SS2', label: 'Sunday Service 2' };
    const secondDefinition = { ...serviceDefinition, id: 'ss2-v1', code: 'ss2' };
    const config = rules({ services: [serviceDefinition, secondDefinition], policies: [policy(), policy({ id: 'p2', serviceId: secondDefinition.id })] });
    const input = { services: [first, second], units, rules: config };
    const generated = generateConfiguredMusicSchedule(input);
    expect(generated.ok, generated.reason).toBe(true);
    expect(new Set(generated.assignments.map((row) => row.unitId)).size).toBe(2);
    const firstChoir = generated.assignments[0]!.unitId;
    const edited = generated.assignments.map((row) => ({ ...row, unitId: firstChoir }));
    expect(validateConfiguredMusicSchedule({ ...input, assignments: edited, lineupChange: { serviceId: second.id, unitId: firstChoir } }).reason).toMatch(/only once per day/);
    const relaxed = { ...input, rules: { ...config, lineupLimits: { primaryPerDay: 2, consecutivePerService: 2 } } };
    expect(validateConfiguredMusicSchedule({ ...relaxed, assignments: edited }).ok).toBe(true);
  });

  it('uses adjacent saved occurrences across months and counts an unassigned service as a break', () => {
    const previous = [slot('2026-01', '2026-01-18'), slot('2026-01', '2026-01-25')];
    const current = slot('2026-02', '2026-02-01');
    const assigned = (service: MusicServiceSlot, unitId = 'choir-a') => ({
      id: `assignment-${service.id}`, serviceId: service.id, unitId, source: 'MANUAL' as const,
    });
    const history = [{ services: previous, assignments: previous.map((service) => assigned(service)) }];
    const input = { services: [current], units, rules: rules(), history };
    expect(generateConfiguredMusicSchedule(input).assignments[0]?.unitId).toBe('choir-b');
    expect(validateConfiguredMusicSchedule({ ...input, assignments: [assigned(current)] }).reason).toMatch(/at most twice in a row/);
    expect(validateConfiguredMusicSchedule({ ...input, assignments: [assigned(current)], history: [{ services: previous, assignments: [assigned(previous[0]!)] }] }).ok).toBe(true);
  });

  it('refuses filling the middle of a three-occurrence run even if the last service is already published', () => {
    const first = slot('2026-01', '2026-01-25');
    const middle = slot('2026-02', '2026-02-01');
    const last = slot('2026-03', '2026-03-01');
    const assignment = (service: MusicServiceSlot) => ({ id: service.id, serviceId: service.id, unitId: 'choir-a', source: 'MANUAL' as const });
    const result = validateConfiguredMusicSchedule({ services: [middle], units, rules: rules(), assignments: [assignment(middle)],
      history: [{ services: [first, last], assignments: [assignment(first), assignment(last)] }],
      lineupChange: { serviceId: middle.id, unitId: 'choir-a' },
    });
    expect(result.reason).toMatch(/at most twice in a row/);
  });
  const designation = (extra: object = {}) => ({id:'fixed-slot',systemId:'sys-music',configVersionId:'music-v1',categoryServicePolicyId:'policy-primary',choirId:'choir-a',displayOrder:0,createdByPersonId:'leader',createdAt:'2026-01-01T00:00:00.000Z',...extra});
  it('keeps unavailable fixed slots vacant with warnings and allows an eligible manual replacement', () => {
    const p = policy({planningMode:'FIXED'});
    const config=rules({policies:[p],fixedAssignments:[designation({categoryServicePolicyId:p.id})],unavailability:[{id:'away',systemId:'sys-music',choirId:'choir-a',serviceDate:'2026-01-01',endDate:'2026-01-10',serviceCode:null,reason:null,active:true,recordedByPersonId:'leader',recordedAt:'',updatedAt:''}]});
    const generated=generateConfiguredMusicSchedule({services:[slot()],units,rules:config});
    expect(generated.ok,generated.reason).toBe(true);
    expect(generated.assignments).toEqual([]);
    expect(generated.warnings.join(' ')).toMatch(/slot.*empty|unfilled/);
    const vacant=validateConfiguredMusicSchedule({services:[slot()],units,rules:config,assignments:[]});
    expect(vacant.ok).toBe(true); expect(vacant.vacantFixedServiceIds).toEqual([slot().id]);
    expect(validateConfiguredMusicSchedule({services:[slot()],units,rules:config,assignments:[{id:'replacement',serviceId:slot().id,unitId:'choir-b',source:'MANUAL'}]}).ok).toBe(true);
    expect(generateConfiguredMusicSchedule({services:[slot('2026-01','2026-01-10')],units,rules:config}).assignments).toEqual([]);
    expect(generateConfiguredMusicSchedule({services:[slot('2026-01','2026-01-11')],units,rules:config}).assignments[0]?.unitId).toBe('choir-a');
  });
  it.each(['inactive','ineligible'])('warns instead of failing for an %s fixed choir', state => {
    const p=policy({planningMode:'FIXED'});
    const config=rules({policies:[p],fixedAssignments:[designation({categoryServicePolicyId:p.id})],links:[link('choir-a',{eligibleOverride:state === 'ineligible' ? {ss1:false} : {}}),link('choir-b')]});
    const result=generateConfiguredMusicSchedule({services:[slot()],units:units.map(u=>u.id === 'choir-a' && state === 'inactive' ? {...u,active:false} : u),rules:config});
    expect(result.ok,result.reason).toBe(true);expect(result.assignments).toEqual([]);expect(result.warnings.length).toBeGreaterThan(0);
  });
  it('applies a date/time designation only to the matching occurrence and keeps other occurrences rotating', () => {
    const p=policy();
    const config=rules({policies:[p],fixedAssignments:[designation({categoryServicePolicyId:p.id,serviceDate:'2026-01-04',serviceTime:'09:00'})]});
    const first={...slot(),time:'09:00'},second={...slot('2026-01','2026-01-11'),time:'09:00'};
    const result=generateConfiguredMusicSchedule({services:[first,second],units,rules:config});
    expect(result.ok,result.reason).toBe(true);
    expect(result.assignments.find(a=>a.serviceId === first.id)?.unitId).toBe('choir-a');
    expect(result.assignments.filter(a=>a.serviceId === second.id)).toHaveLength(1);
  });
  it('keeps a missing date-scoped FIXED occurrence vacant and permits an optional replacement', () => {
    const p=policy({planningMode:'FIXED',minCount:null});
    const config=rules({policies:[p],fixedAssignments:[designation({categoryServicePolicyId:p.id,serviceDate:'2026-01-11'})]});
    const result=generateConfiguredMusicSchedule({services:[slot()],units,rules:config});
    expect(result.ok,result.reason).toBe(true);expect(result.assignments).toEqual([]);
    expect(validateConfiguredMusicSchedule({services:[slot()],units,rules:config,assignments:[]}).vacantFixedServiceIds).toEqual([slot().id]);
    expect(validateConfiguredMusicSchedule({services:[slot()],units,rules:config,assignments:[{id:'r',serviceId:slot().id,unitId:'choir-b',source:'MANUAL'}]}).ok).toBe(true);
  });
  it('uses explicit category links, excludes inactive choirs, and is deterministic with a seed', () => {
    const config = rules({ links: [...rules().links, link('choir-inactive')] });
    const service = slot();
    const first = generateConfiguredMusicSchedule({ services: [service], units, rules: config, seed: 19 });
    const second = generateConfiguredMusicSchedule({ services: [service], units, rules: config, seed: 19 });
    expect(first.ok).toBe(true);
    expect(first.assignments).toEqual(second.assignments);
    expect(first.assignments.every((assignment) => assignment.unitId !== 'choir-inactive')).toBe(true);
  });

  it('rejects multiple category memberships instead of falling back to the legacy role', () => {
    const result = generateConfiguredMusicSchedule({
      services: [slot()], units,
      rules: rules({
        categories: [primary, secondary],
        links: [link('choir-a'), link('choir-a', { id: 'second-link', categoryId: secondary.id }), link('choir-b')],
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/exactly one explicit choir-category link/);
  });

  it('allows the same choir in independent service occurrences, but not twice in one occurrence', () => {
    const first = slot('2026-01', '2026-01-04', 'one');
    const second = slot('2026-01', '2026-01-11', 'two');
    const acrossDates = validateConfiguredMusicSchedule({
      services: [first, second],
      assignments: [
        { id: 'a1', serviceId: first.id, unitId: 'choir-a', source: 'MANUAL' },
        { id: 'a2', serviceId: second.id, unitId: 'choir-a', source: 'MANUAL' },
      ],
      units, rules: rules({ policies: [policy({ minCount: 0 })] }),
    });
    expect(acrossDates.ok).toBe(true);
    const duplicate = validateConfiguredMusicSchedule({
      services: [first],
      assignments: [
        { id: 'a1', serviceId: first.id, unitId: 'choir-a', source: 'MANUAL' },
        { id: 'a2', serviceId: first.id, unitId: 'choir-a', source: 'MANUAL' },
      ],
      units, rules: rules({ policies: [policy({ minCount: 0 })] }),
    });
    expect(duplicate.reason).toMatch(/only once/);
  });

  it('enforces requireAll, category maximum, and service capacity together', () => {
    const service = { ...slot(), maxChoirs: 1 };
    const requireAll = generateConfiguredMusicSchedule({
      services: [service], units,
      rules: rules({ policies: [policy({ requireAll: true, maxCount: 1 })] }),
    });
    expect(requireAll.ok).toBe(false);
    expect(requireAll.reason).toMatch(/category limit|capacity/);

    const categoryMax = validateConfiguredMusicSchedule({
      services: [slot()], assignments: [
        { id: 'a1', serviceId: slot().id, unitId: 'choir-a', source: 'MANUAL' },
        { id: 'a2', serviceId: slot().id, unitId: 'choir-b', source: 'MANUAL' },
      ],
      units, rules: rules({ policies: [policy({ maxCount: 1 })] }),
    });
    expect(categoryMax.reason).toMatch(/exceeds its maximum/);
  });

  it('applies date/service unavailability and eligibility overrides', () => {
    const service = slot();
    const config = rules({
      links: [
        link('choir-a', { eligibleOverride: { SS1: false } }),
        link('choir-b'),
      ],
      unavailability: [{
        id: 'unavailable', systemId: 'sys-music', choirId: 'choir-b',
        serviceDate: service.date, serviceCode: 'SS1', reason: 'Travel',
        active: true, recordedByPersonId: 'leader', recordedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
      policies: [policy({ minCount: 0 })],
    });
    const result = generateConfiguredMusicSchedule({ services: [service], units, rules: config });
    expect(result.ok).toBe(true);
    expect(result.assignments).toEqual([]);
  });

  it('runs FIXED designations and leaves MANUAL mode unassigned until a person edits it', () => {
    const fixedPolicy = policy({ planningMode: 'FIXED' });
    const fixed = generateConfiguredMusicSchedule({
      services: [slot()], units,
      rules: rules({
        policies: [fixedPolicy],
        fixedAssignments: [{
          id: 'fixed-a', systemId: 'sys-music', configVersionId: 'music-v1',
          categoryServicePolicyId: fixedPolicy.id, choirId: 'choir-b', displayOrder: 0,
          createdByPersonId: 'leader', createdAt: '2026-01-01T00:00:00.000Z',
        }],
      }),
    });
    expect(fixed.ok).toBe(true);
    expect(fixed.assignments.map((assignment) => assignment.unitId)).toEqual(['choir-b']);

    const manual = generateConfiguredMusicSchedule({
      services: [slot()], units, rules: rules({ policies: [policy({ planningMode: 'MANUAL' })] }),
    });
    expect(manual.ok).toBe(true);
    expect(manual.assignments).toEqual([]);
    expect(manual.warnings.join(' ')).toMatch(/manually/);
  });

  it('validates full quarter frequency scopes and soft targets', () => {
    const quarterly = policy({
      minCount: 0, frequencyTarget: 2, frequencyKind: 'MINIMUM', frequencyPeriod: 'QUARTER',
    });
    const quarterServices = [
      slot('2026-01', '2026-01-04', 'jan'),
      slot('2026-02', '2026-02-01', 'feb'),
      slot('2026-03', '2026-03-01', 'mar'),
    ];
    const incomplete = validateConfiguredMusicSchedule({
      services: quarterServices.slice(0, 1),
      assignments: [{ id: 'a1', serviceId: 'jan', unitId: 'choir-a', source: 'MANUAL' }],
      units, rules: rules({ policies: [quarterly] }),
    });
    expect(incomplete.reason).toMatch(/complete quarter period/);

    const minimumMiss = validateConfiguredMusicSchedule({
      services: quarterServices,
      assignments: [{ id: 'a1', serviceId: 'jan', unitId: 'choir-a', source: 'MANUAL' }],
      units, rules: rules({ policies: [quarterly] }),
    });
    expect(minimumMiss.reason).toMatch(/Frequency minimum/);

    const target = validateConfiguredMusicSchedule({
      services: quarterServices,
      assignments: [{ id: 'a1', serviceId: 'jan', unitId: 'choir-a', source: 'MANUAL' }],
      units, rules: rules({ policies: [policy({
        minCount: 0, frequencyTarget: 2, frequencyKind: 'TARGET', frequencyPeriod: 'QUARTER',
      })] }),
    });
    expect(target.ok).toBe(true);
    expect(target.warnings.join(' ')).toMatch(/Frequency target/);
  });

  it('applies an individual frequency override even when the category has no default target', () => {
    const service = slot();
    const overrideLink = link('choir-a', {
      frequencyOverride: { ss1: { frequencyTarget: 1, frequencyKind: 'MAXIMUM', frequencyPeriod: 'MONTH' } },
    });
    const result = validateConfiguredMusicSchedule({
      services: [service, slot('2026-01', '2026-01-11', 'second')],
      assignments: [
        { id: 'a1', serviceId: service.id, unitId: 'choir-a', source: 'MANUAL' },
        { id: 'a2', serviceId: 'second', unitId: 'choir-a', source: 'MANUAL' },
      ],
      units, rules: rules({ links: [overrideLink, link('choir-b')], policies: [policy({ minCount: 0 })] }),
    });
    expect(result.reason).toMatch(/Frequency maximum/);
  });
});


describe('configured generation hard requirements', () => {
  it('selects frequency MINIMUM duties even with no per-service minimum', () => {
    const result = generateConfiguredMusicSchedule({
      services: [slot()], units,
      rules: rules({ policies: [policy({ minCount: 0, frequencyKind: 'MINIMUM', frequencyTarget: 1, frequencyPeriod: 'MONTH' })] }),
    });
    expect(result.ok, result.reason).toBe(true);
    expect(result.assignments.map(row => row.unitId).sort()).toEqual(['choir-a', 'choir-b']);
  });
  it('leaves MANUAL requireAll duties for editing and rejects incomplete confirmation', () => {
    const config = rules({ policies: [policy({ planningMode: 'MANUAL', requireAll: true })] });
    const result = generateConfiguredMusicSchedule({ services: [slot()], units, rules: config });
    expect(result.ok, result.reason).toBe(true);
    expect(result.assignments).toEqual([]);
    expect(validateConfiguredMusicSchedule({ services: [slot()], units, rules: config, assignments: [] }).ok).toBe(false);
  });
  it('rejects Music assignments on a Protocol-only service', () => {
    const result = validateConfiguredMusicSchedule({
      services: [slot()], units, rules: rules({ services: [{ ...serviceDefinition, musicRequired: false }] }),
      assignments: [{ id: 'bad', serviceId: slot().id, unitId: 'choir-a', source: 'MANUAL' }],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/does not accept Music/);
  });
});


describe('selector feasibility with scarce capacity', () => {
  it('reserves a later category minimum ahead of optional frequency targets', () => {
    const config = rules({ services: [{ ...serviceDefinition, maxChoirs: 2 }], categories: [primary, secondary],
      links: [link('choir-a'), link('choir-b'), link('choir-c', { categoryId: secondary.id })],
      policies: [policy({ minCount: 1, maxCount: 2, frequencyTarget: 1, frequencyPeriod: 'MONTH' }), policy({ id: 'secondary-policy', categoryId: secondary.id, minCount: 1, maxCount: 1 })],
    });
    const allUnits = [...units, { id: 'choir-c', name: 'Choir C', kind: 'SECONDARY' as const, active: true }];
    const result = generateConfiguredMusicSchedule({ services: [slot()], units: allUnits, rules: config });
    expect(result.ok, result.reason).toBe(true);
    expect(result.assignments).toHaveLength(2);
    expect(result.assignments.some(a => a.unitId === 'choir-c')).toBe(true);
  });
  it('serves a minimum-frequency choir before its later unavailable date', () => {
    const first = slot(), second = slot('2026-01', '2026-01-11', 'second');
    const base = rules({ services: [{ ...serviceDefinition, maxChoirs: 1 }], policies: [policy({ maxCount: 1 })] });
    const initial = generateConfiguredMusicSchedule({ services: [first], units, rules: base, seed: 5 });
    const chosen = initial.assignments[0]!.unitId;
    const scarce = chosen === 'choir-a' ? 'choir-b' : 'choir-a';
    const config = { ...base, policies: [policy({ maxCount: 1, frequencyKind: 'MINIMUM', frequencyTarget: 1, frequencyPeriod: 'MONTH' })],
      unavailability: [{ id: 'later', systemId: 'sys-music', choirId: scarce, serviceDate: second.date, serviceCode: 'ss1', reason: null, active: true, recordedByPersonId: 'leader', recordedAt: '2026-01-01', updatedAt: '2026-01-01' }],
    };
    const feasible = [{ id: 'one', serviceId: first.id, unitId: scarce, source: 'MANUAL' as const }, { id: 'two', serviceId: second.id, unitId: chosen, source: 'MANUAL' as const }];
    expect(validateConfiguredMusicSchedule({ services: [first, second], assignments: feasible, units, rules: config }).ok).toBe(true);
    const result = generateConfiguredMusicSchedule({ services: [first, second], units, rules: config, seed: 5 });
    expect(result.ok, result.reason).toBe(true);
    expect(result.assignments.find(a => a.serviceId === first.id)?.unitId).toBe(scarce);
    expect(generateConfiguredMusicSchedule({ services: [first, second], units, rules: config, seed: 5 })).toEqual(result);
  });
});
