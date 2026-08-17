"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";
import { CountrySelect } from "@/components/CountrySelect";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useToast } from "../lib/toast";
import { friendlyError } from "../lib/friendly-error";
import { findCountry, getDefaultCountry } from "../lib/country-suggestion";

/**
 * Currency is always derived from the selected country (never a
 * separately-stored field) — see the country_code migration's own
 * comment for why: storing both independently risks them drifting out
 * of sync and showing a currency that doesn't match the country. This
 * is the one place a user changes their country; Wallet and any other
 * screen showing a currency figure reads the same country_code and
 * derives the same way, so they always agree.
 */
export function ProfileCountryCurrency({
  userId,
  initialCountryCode,
}: {
  userId: string;
  initialCountryCode: string | null;
}) {
  const router = useRouter();
  const [countryCode, setCountryCode] = useState(initialCountryCode ?? getDefaultCountry().code);
  const [saving, setSaving] = useState(false);
  const showToast = useToast();

  const country = findCountry(countryCode) ?? getDefaultCountry();
  const changed = countryCode !== (initialCountryCode ?? getDefaultCountry().code);

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ country_code: countryCode })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      showToast(friendlyError(error.message), "error");
      return;
    }
    showToast("Country updated");
    router.refresh();
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-primary">
        Country & currency
      </h2>
      <p className="mt-1 text-xs text-foreground/50">
        We suggested this from your approximate location — change it any time.
        Your wallet and money figures display in this currency.
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <CountrySelect
          value={countryCode}
          onChange={setCountryCode}
          label="Country"
          className="flex-1"
        />
        <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2.5 text-sm">
          <span className="text-foreground/50">Currency: </span>
          <span className="font-semibold text-foreground">{country.currency}</span>
        </div>
      </div>
      {changed && (
        <Button className="mt-3" onClick={save} disabled={saving} loading={saving}>
          Save country
        </Button>
      )}
    </Card>
  );
}
