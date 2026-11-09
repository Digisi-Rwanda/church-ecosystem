-- Monthly services: which week(s) of the month, chosen by the user (1st-4th, last) instead of a
-- built-in rule. Additive. Existing monthly services that have a weekday keep their current
-- behaviour (the first one of that weekday), so nothing changes until someone edits them.
ALTER TABLE "SchedulingService" ADD COLUMN "monthlyOccurrencesJson" TEXT NOT NULL DEFAULT '[]';

UPDATE "SchedulingService"
SET "monthlyOccurrencesJson" = '[1]'
WHERE "recurrence" = 'MONTHLY' AND "weekday" IS NOT NULL AND "selectedDatesJson" = '[]';
