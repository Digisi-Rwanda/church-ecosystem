-- Administrator hierarchy compatibility marker: intentionally no schema/data changes.
-- Position.office is nullable TEXT, not a database enum or role table.
-- ADMINISTRATOR remains the persisted Chief Administrator code; legacy systemAdmin
-- appointments continue to resolve through officeOf. SYSTEM_ADMINISTRATOR is a new
-- application-validated code and must NOT set the legacy church-wide systemAdmin flag.
-- No identity, title, appointment, password or historical record is rewritten here.
-- The first holder is selected explicitly using the separate opt-in seed.
SELECT 1;
