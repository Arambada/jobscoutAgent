/**
 * Parse a database timestamp as UTC. The API serialises TIMESTAMPTZ columns
 * to ISO strings that already end in "Z"; older code appended a second "Z"
 * and produced Invalid Date. Appends "Z" only when no timezone is present.
 */
export function parseUtc(value: string): Date {
  return new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
}
