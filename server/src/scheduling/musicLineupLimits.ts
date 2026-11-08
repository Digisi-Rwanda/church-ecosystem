import { z } from 'zod';

export const MUSIC_LINEUP_LIMITS_KEY = 'scheduling.sys-music.lineupLimits';
export const musicLineupLimitsSchema = z.object({
  primaryPerDay: z.number().int().positive().nullable(),
  consecutivePerService: z.number().int().positive().nullable(),
});
export type MusicLineupLimits = z.infer<typeof musicLineupLimitsSchema>;
export const defaultMusicLineupLimits: MusicLineupLimits = { primaryPerDay: 1, consecutivePerService: 2 };

