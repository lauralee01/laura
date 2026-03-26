/** Set `DEBUG_CALENDAR=1` in env to log calendar list tooling (noisy otherwise). */
export function debugCalendarLog(...args: unknown[]): void {
  if (process.env.DEBUG_CALENDAR === '1') {
    // eslint-disable-next-line no-console -- intentional debug when flag set
    console.log(...args);
  }
}
