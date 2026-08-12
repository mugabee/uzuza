import { Card } from "@/components/Card";

// Save app reference: "My Save Score" gauge + "Risk Rating" bar, side by
// side. Uzuza has no credit-scoring vendor — this is a deterministic,
// locally-computed stand-in for Section 3.4's reputation badges
// ("completed 3 cycles, 0 missed payments"), not a real risk model. Treat
// it as a trust signal for matching, not a financial underwriting score.
export function TrustScoreCard({
  cyclesCompleted,
  missedCount,
}: {
  cyclesCompleted: number;
  missedCount: number;
}) {
  const totalActivity = cyclesCompleted + missedCount;
  const rawScore = 500 + cyclesCompleted * 45 - missedCount * 70;
  const score = Math.max(300, Math.min(850, rawScore));
  const scoreFraction = (score - 300) / (850 - 300);
  const angleDeg = 180 - scoreFraction * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  const cx = 100;
  const cy = 95;
  const r = 72;
  const needleX = cx + r * 0.85 * Math.cos(angleRad);
  const needleY = cy - r * 0.85 * Math.sin(angleRad);

  let riskLabel = "New member";
  let riskColor = "#94a3b8";
  let riskBars = 1;
  if (totalActivity > 0) {
    const missRatio = missedCount / totalActivity;
    if (missRatio === 0) {
      riskLabel = "Low";
      riskColor = "#22c55e";
      riskBars = 5;
    } else if (missRatio <= 0.2) {
      riskLabel = "Medium";
      riskColor = "#f59e0b";
      riskBars = 3;
    } else {
      riskLabel = "High";
      riskColor = "#ef4444";
      riskBars = 1;
    }
  }

  return (
    <Card>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col items-center">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">
            My Trust Score
          </p>
          <svg width="140" height="80" viewBox="0 0 200 110" className="mt-1">
            <path
              d="M 28 95 A 72 72 0 0 1 91 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="14"
              strokeLinecap="round"
            />
            <path
              d="M 91 24 A 72 72 0 0 1 109 24"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="14"
            />
            <path
              d="M 109 24 A 72 72 0 0 1 172 95"
              fill="none"
              stroke="#22c55e"
              strokeWidth="14"
              strokeLinecap="round"
            />
            <line
              x1={cx}
              y1={cy}
              x2={needleX}
              y2={needleY}
              stroke="currentColor"
              className="text-foreground"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r="5" className="fill-foreground" />
          </svg>
          <p className="-mt-1 font-display text-2xl font-bold text-primary">{score}</p>
        </div>

        <div className="flex flex-col justify-center gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">
            Risk Rating
          </p>
          <div className="flex items-end gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className="w-2 rounded-sm"
                style={{
                  height: `${10 + i * 5}px`,
                  backgroundColor: i < riskBars ? riskColor : "var(--border)",
                }}
              />
            ))}
          </div>
          <p className="text-sm font-semibold" style={{ color: riskColor }}>
            {riskLabel}
          </p>
          <p className="text-xs leading-snug text-foreground/50">
            {totalActivity === 0
              ? "Complete a cycle to build your score."
              : `${cyclesCompleted} completed, ${missedCount} missed.`}
          </p>
        </div>
      </div>
    </Card>
  );
}
