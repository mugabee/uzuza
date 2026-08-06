"use client";

import { Button } from "@/components/Button";

export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      Print / Save as PDF
    </Button>
  );
}
