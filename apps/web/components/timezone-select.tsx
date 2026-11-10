import { BUSINESS_TIMEZONE, timezoneOptions } from "@hvems/domain";
import { Select } from "@/components/ui/form";

/** Australian timezone picker; Brisbane is the platform default. */
export function TimezoneSelect({ id, value, disabled }: { id: string; value?: string | null; disabled?: boolean }) {
  return (
    <Select id={id} name="timezone" defaultValue={value ?? BUSINESS_TIMEZONE} disabled={disabled}>
      {timezoneOptions(value).map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </Select>
  );
}
