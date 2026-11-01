import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/** Returns E.164 when valid. An unparsable number is kept raw, never dropped. */
export function normalizePhone(raw: string | null | undefined, country: string) {
  const phoneRaw = raw?.trim() || null;
  if (!phoneRaw) return { phoneE164: null, phoneRaw: null, phoneInvalid: false };
  const parsed = parsePhoneNumberFromString(phoneRaw, country as CountryCode);
  return parsed?.isValid()
    ? { phoneE164: parsed.number as string, phoneRaw, phoneInvalid: false }
    : { phoneE164: null, phoneRaw, phoneInvalid: true };
}

export function maskPhone(e164: string | null) {
  return e164 ? `${e164.slice(0, 4)}•••${e164.slice(-3)}` : "no phone";
}
