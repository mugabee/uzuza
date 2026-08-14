import { NextResponse, type NextRequest } from "next/server";
import { getRwfPerUnit } from "../../../lib/fx";
import { SUPPORTED_CURRENCIES } from "../../../lib/currencies";

export async function GET(request: NextRequest) {
  const currency = request.nextUrl.searchParams.get("currency")?.toUpperCase() ?? "";
  const rwfAmount = Number(request.nextUrl.searchParams.get("rwfAmount") ?? "0");

  if (!SUPPORTED_CURRENCIES.some((c) => c.code === currency)) {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  }

  const rwfPerUnit = await getRwfPerUnit(currency);
  if (rwfPerUnit === null) {
    return NextResponse.json({ error: "Rate unavailable" }, { status: 503 });
  }

  return NextResponse.json({
    currency,
    rwfPerUnit,
    converted: rwfAmount > 0 ? Number((rwfAmount / rwfPerUnit).toFixed(2)) : null,
  });
}
