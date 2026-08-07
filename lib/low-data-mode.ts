"use client";

import { useEffect, useState } from "react";

// Section 3.8: "low-data mode (minimal images, cached last-known ledger
// state)". This covers the "minimal images" half — the two places the app
// loads a network image at all: profile avatars and invite QR codes.
// Caching the last-known ledger state for offline viewing is a separate,
// larger piece of work (a real service-worker caching strategy) and isn't
// part of this.
export function useLowDataMode() {
  const [lowData, setLowData] = useState(false);

  useEffect(() => {
    setLowData(localStorage.getItem("uzuza_low_data") === "on");
  }, []);

  return lowData;
}
