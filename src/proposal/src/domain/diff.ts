export interface PriceDiff {
  diffPct: number;
  diffAbsoluteMinor: bigint;
  diffAbsoluteCurrency: string;
}

export function computeDiff(
  currentMinor: bigint,
  proposedMinor: bigint,
  currency: string,
): PriceDiff {
  const diffAbsoluteMinor = proposedMinor - currentMinor;
  const diffPct =
    currentMinor === 0n
      ? 0
      : Number((proposedMinor - currentMinor) * 10000n / currentMinor) / 100;
  return { diffPct, diffAbsoluteMinor, diffAbsoluteCurrency: currency };
}
