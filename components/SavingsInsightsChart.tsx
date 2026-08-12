import { Card } from "@/components/Card";

// Save app reference: Savings > Insights tab, a 6-month line chart of the
// member's own contributions.
export function SavingsInsightsChart({
  data,
}: {
  data: { month_label: string; total: number }[];
}) {
  const max = Math.max(...data.map((d) => Number(d.total)), 1);
  const width = 320;
  const height = 120;
  const paddingX = 10;
  const step = data.length > 1 ? (width - paddingX * 2) / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = paddingX + i * step;
    const y = height - 8 - (Number(d.total) / max) * (height - 28);
    return { x, y, total: Number(d.total), label: d.month_label };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const hasAnyData = points.some((p) => p.total > 0);

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-primary">
        Savings insights
      </h2>
      <p className="mt-0.5 text-sm text-foreground/60">
        Confirmed contributions over the last 6 months.
      </p>

      {!hasAnyData ? (
        <p className="mt-6 py-6 text-center text-sm text-foreground/40">
          Nothing to show yet — your confirmed contributions will appear here.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="mt-3 h-[120px] w-full"
          preserveAspectRatio="none"
        >
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={0}
              x2={width}
              y1={height - 8 - f * (height - 28)}
              y2={height - 8 - f * (height - 28)}
              className="stroke-border"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          ))}
          <path d={linePath} fill="none" className="stroke-primary" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3" className="fill-primary" />
          ))}
        </svg>
      )}

      <div className="mt-1 flex justify-between text-[11px] text-foreground/40">
        {points.map((p, i) => (
          <span key={i}>{p.label}</span>
        ))}
      </div>
    </Card>
  );
}
