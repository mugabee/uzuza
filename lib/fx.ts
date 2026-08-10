import "server-only";

// Free, keyless exchange-rate feed used only to show senders a live
// estimate of what a given RWF amount costs in their currency - it's a
// convenience number, not an authoritative rate, so a failed/slow lookup
// degrades gracefully (the sender can still submit proof and type in what
// they actually paid) rather than blocking anything.
const FX_ENDPOINT = "https://open.er-api.com/v6/latest/RWF";

/** Returns how many RWF one unit of `currency` is worth, or null if unavailable. */
export async function getRwfPerUnit(currency: string): Promise<number | null> {
  try {
    const res = await fetch(FX_ENDPOINT, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json();
    const unitsOfCurrencyPerRwf = data?.rates?.[currency.toUpperCase()];
    if (typeof unitsOfCurrencyPerRwf !== "number" || unitsOfCurrencyPerRwf <= 0) {
      return null;
    }
    return 1 / unitsOfCurrencyPerRwf;
  } catch {
    return null;
  }
}
