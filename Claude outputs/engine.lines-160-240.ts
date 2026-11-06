      : a.date.localeCompare(b.date),
  );
}

function buildConfiguredMusicCalendar(
  startMonthKey: string,
  horizon: MusicHorizon,
  configServices: readonly Pick<SchedulingServiceView, 'code' | 'name' | 'weekday' | 'time' | 'recurrence' | 'selectedDates' | 'active' | 'musicRequired' | 'protocolRequired' | 'maxChoirs'>[],
): MusicServiceSlot[] {
  const enabled = configServices.filter((service) => service.active);
  const duplicate = enabled.find((service, index) =>
    enabled.findIndex((candidate) => candidate.code.toLowerCase() === service.code.toLowerCase()) !== index);
  if (duplicate) throw new Error(`The service code ${duplicate.code} is duplicated in this configuration.`);
  const slots: MusicServiceSlot[] = [];
  for (const periodKey of periodKeysForHorizon(startMonthKey, horizon)) {
    const [year, month] = periodKey.split('-').map(Number);
    const days = daysInMonth(year, month);
    for (const service of enabled) {
      const kind = service.code.toUpperCase();
      const dates = new Set<string>();
      if (service.recurrence === 'SELECTED_DATES' || service.recurrence === 'CUSTOM') {
        for (const date of service.selectedDates) if (date.startsWith(`${periodKey}-`)) dates.add(date);
        if (service.recurrence === 'CUSTOM' && service.selectedDates.length === 0) {
          throw new Error(`Custom recurrence for ${service.code} requires selected dates`);
        }
      } else if (service.recurrence === 'MONTHLY') {
        if (service.selectedDates.length) {
          for (const date of service.selectedDates) if (date.startsWith(`${periodKey}-`)) dates.add(date);
        } else if (kind === 'IGABURO' && service.weekday === null) {
          for (let day = days; day >= 1; day--) {
            if (weekdayUtc(year, month, day) === 6) {
              dates.add(isoDate(year, month, day));
              break;
            }
          }
        } else if (service.weekday !== null) {
          for (let day = 1; day <= days; day++) {
            if (weekdayUtc(year, month, day) === service.weekday) {
              dates.add(isoDate(year, month, day));
              break;
            }
          }
        }
      } else if (service.weekday !== null) {
        for (let day = 1; day <= days; day++) {
          if (weekdayUtc(year, month, day) === service.weekday) dates.add(isoDate(year, month, day));
        }
      } else {
        throw new Error(`Weekly recurrence for ${service.code} requires a weekday`);
      }

      for (const date of dates) {
        slots.push({
          id: stableServiceId(date, kind), periodKey, date, kind,
          label: `${service.name} · ${date}`, time: service.time,
          musicRequired: service.musicRequired, protocolRequired: service.protocolRequired,
          maxChoirs: service.maxChoirs,
        });
      }
    }
  }
  return slots.sort((a, b) => a.date === b.date
    ? kindOrder(a.kind) - kindOrder(b.kind)
    : a.date.localeCompare(b.date));
}

function kindOrder(k: MusicServiceKind): number {
  const order: Record<string, number> = { SS1: 0, SS2: 1, TUESDAY: 2, FRIDAY: 3, IGABURO: 4 };
  return order[k] ?? 10;
}

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
