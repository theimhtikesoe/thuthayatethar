const ADMIN_SLUG_PATTERN = /^[a-z0-9\u1000-\u109f][a-z0-9\u1000-\u109f-]{0,119}$/i;

export function isValidAdminSlug(value: unknown): value is string {
  return typeof value === "string" && ADMIN_SLUG_PATTERN.test(value);
}
