/** US IANA timezones for Settings v1 (states + major territories). */
export const US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern — New York' },
  { value: 'America/Detroit', label: 'Eastern — Detroit' },
  { value: 'America/Indiana/Indianapolis', label: 'Eastern — Indianapolis' },
  { value: 'America/Kentucky/Louisville', label: 'Eastern — Louisville' },
  { value: 'America/Chicago', label: 'Central — Chicago' },
  { value: 'America/Menominee', label: 'Central — Menominee' },
  { value: 'America/North_Dakota/Center', label: 'Central — North Dakota' },
  { value: 'America/Denver', label: 'Mountain — Denver' },
  { value: 'America/Boise', label: 'Mountain — Boise' },
  { value: 'America/Phoenix', label: 'Arizona — Phoenix (no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific — Los Angeles' },
  { value: 'America/Anchorage', label: 'Alaska — Anchorage' },
  { value: 'America/Juneau', label: 'Alaska — Juneau' },
  { value: 'America/Sitka', label: 'Alaska — Sitka' },
  { value: 'America/Yakutat', label: 'Alaska — Yakutat' },
  { value: 'America/Nome', label: 'Alaska — Nome' },
  { value: 'America/Adak', label: 'Aleutian — Adak' },
  { value: 'America/Metlakatla', label: 'Alaska — Metlakatla' },
  { value: 'Pacific/Honolulu', label: 'Hawaii — Honolulu' },
  { value: 'America/Puerto_Rico', label: 'Atlantic — Puerto Rico' },
  { value: 'America/St_Thomas', label: 'Atlantic — U.S. Virgin Islands' },
  { value: 'Pacific/Guam', label: 'Chamorro — Guam' },
  { value: 'Pacific/Saipan', label: 'Chamorro — Northern Mariana Islands' },
  { value: 'Pacific/Pago_Pago', label: 'Samoa — Pago Pago' },
] as const;

export type UsTimeZone = (typeof US_TIMEZONES)[number]['value'];

const US_TIMEZONE_VALUES = new Set<string>(
  US_TIMEZONES.map((zone) => zone.value),
);

export function isUsTimeZone(value: string): value is UsTimeZone {
  return US_TIMEZONE_VALUES.has(value);
}
