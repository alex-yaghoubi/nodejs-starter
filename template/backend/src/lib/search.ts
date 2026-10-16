/** Escape PostgreSQL LIKE/ILIKE wildcards so input is a literal substring. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, character => `\\${character}`);
}
