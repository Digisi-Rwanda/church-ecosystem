/**
 * The one error every scheduling-config refusal is thrown as. Lives in its own module so `ruleModel.ts`
 * (the Rule expansion layer) and `saveConfigChange.ts` can both use it without importing each other at runtime.
 * `saveConfigChange.ts` re-exports these, so existing imports keep working.
 */

/** Thrown for every refusal. The router turns it into the HTTP response unchanged. */
export class ConfigError extends Error {
  constructor(public readonly status: number, public readonly body: Record<string, unknown>) {
    super(String(body.error ?? body.message ?? (Array.isArray(body.errors) ? body.errors[0] : undefined) ?? 'Configuration change refused'));
  }
}

export const refuse = (status: number, code: string, error: string) => new ConfigError(status, { error, code });

/** A refusal in the validator's own shape: 422 { errors: string[] }. The Rule API uses it for every rule-level problem. */
export const invalid = (...errors: string[]) => new ConfigError(422, { errors });
