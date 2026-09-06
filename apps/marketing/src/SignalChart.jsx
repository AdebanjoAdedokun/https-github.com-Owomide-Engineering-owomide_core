import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceDot,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";

const INITIAL_DIMENSION = { width: 320, height: 108 };

function FxChart({ signal, revealed, focused, cycle, reducedMotion }) {
  const values = revealed || reducedMotion ? signal.data : signal.data.map(() => signal.data[0]);
  const labels = ["12 Jul", "16 Jul", "20 Jul", "23 Jul", "26 Jul", "30 Jul", "3 Aug", "6 Aug", "9 Aug", "11 Aug", "13 Aug", "14 Aug"];
  const data = values.map((value, index) => ({ index, label: labels[index], value }));
  const spread = Math.max(...signal.data) - Math.min(...signal.data);
  const domain = [Math.min(...signal.data) - spread * 0.24, Math.max(...signal.data) + spread * 0.18];
  const gradientId = `fx-area-${cycle % 2}`;
  const showFocus = focused || reducedMotion;

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={INITIAL_DIMENSION}>
      <AreaChart accessibilityLayer={false} data={data} margin={{ top: 10, right: 12, bottom: 18, left: 5 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#8fc9ae" stopOpacity=".5" />
            <stop offset="100%" stopColor="#8fc9ae" stopOpacity=".075" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="rgba(6,51,44,.075)" />
        <XAxis
          axisLine={{ stroke: "rgba(6,51,44,.28)", strokeWidth: 1 }}
          dataKey="index"
          domain={[0, 11]}
          tick={{ fill: "#74807b", fontSize: 8 }}
          tickFormatter={(index) => labels[index]}
          tickLine={false}
          ticks={[0, 4, 11]}
          type="number"
        />
        <YAxis hide domain={domain} />
        <ReferenceArea x1={8.2} x2={9.8} fill="#8fc9ae" fillOpacity={showFocus ? 0.16 : 0} strokeOpacity={0} />
        <ReferenceLine x={9} stroke="#315f57" strokeOpacity={showFocus ? 0.55 : 0} strokeDasharray="3 4" />
        <ReferenceDot
          x={9}
          y={signal.data[9]}
          r={5}
          fill="#1f7a61"
          stroke="#fffdf8"
          strokeWidth={2.4}
          fillOpacity={showFocus ? 1 : 0}
          strokeOpacity={showFocus ? 1 : 0}
        />
        <ReferenceDot
          x={11}
          y={signal.data[11]}
          r={2.8}
          fill="#1f7a61"
          stroke="#fffdf8"
          strokeWidth={1.4}
          fillOpacity={revealed || reducedMotion ? 1 : 0}
          strokeOpacity={revealed || reducedMotion ? 1 : 0}
        />
        <Area
          key={`${signal.key}-${cycle}-${revealed}`}
          type="linear"
          dataKey="value"
          stroke="#1f7a61"
          strokeWidth={2.2}
          fill={`url(#${gradientId})`}
          fillOpacity={1}
          isAnimationActive={!reducedMotion && revealed}
          animationDuration={1400}
          animationEasing="ease-out"
          dot={false}
          activeDot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function InflationChart({ signal, revealed, focused, cycle, reducedMotion }) {
  const baseline = 109.7;
  const values = revealed || reducedMotion ? signal.data : signal.data.map(() => baseline);
  const data = values.map((value, index) => ({ index, value }));

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={INITIAL_DIMENSION}>
      <BarChart accessibilityLayer={false} data={data} margin={{ top: 12, right: 8, bottom: 2, left: 8 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke="rgba(6,51,44,.08)" strokeDasharray="2 5" />
        <XAxis dataKey="index" hide />
        <YAxis hide domain={[107.6, 114]} />
        <ReferenceArea y1={109.35} y2={110.05} fill="#d8b352" fillOpacity={focused || reducedMotion ? 0.11 : 0.035} strokeOpacity={0} />
        <ReferenceLine y={baseline} stroke="#9a6a08" strokeOpacity={focused || reducedMotion ? 0.5 : 0.22} />
        <Bar
          key={`${signal.key}-${cycle}-${revealed}`}
          dataKey="value"
          radius={[3, 3, 0, 0]}
          isAnimationActive={!reducedMotion && revealed}
          animationDuration={1200}
          animationEasing="ease-out"
        >
          {data.map((entry, index) => (
            <Cell key={`${entry.index}-${cycle}`} fill={index >= 5 && revealed ? "#d8b352" : "#315f57"} fillOpacity={index >= 5 ? 0.92 : 0.38} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function CompetitorChart({ signal, revealed, focused, cycle, reducedMotion }) {
  const points = signal.data.map((value, index) => ({
    value: revealed || reducedMotion ? value : 0,
    lane: 1 + ((index * 7) % 5) * 0.17,
  }));
  const median = [{ value: revealed || reducedMotion ? -3.8 : 0, lane: 1.36 }];

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={INITIAL_DIMENSION}>
      <ScatterChart accessibilityLayer={false} margin={{ top: 12, right: 10, bottom: 8, left: 10 }}>
        <CartesianGrid horizontal={false} stroke="rgba(6,51,44,.08)" strokeDasharray="2 5" />
        <XAxis type="number" dataKey="value" domain={[-8, 4]} hide />
        <YAxis type="number" dataKey="lane" domain={[0.8, 1.9]} hide />
        <ReferenceArea x1={-6.6} x2={-1.7} fill="#d8b352" fillOpacity={focused || reducedMotion ? 0.12 : 0.035} strokeOpacity={0} />
        <ReferenceLine x={0} stroke="#0c4a40" strokeOpacity=".42" strokeDasharray="3 3" />
        <ReferenceLine x={-3.8} stroke="#9a6a08" strokeOpacity={focused || reducedMotion ? 0.5 : 0} />
        <Scatter
          key={`${signal.key}-dots-${cycle}-${revealed}`}
          data={points}
          fill="#315f57"
          fillOpacity={0.55}
          isAnimationActive={!reducedMotion && revealed}
          animationDuration={1200}
          animationEasing="ease-out"
        />
        <Scatter
          key={`${signal.key}-median-${cycle}-${revealed}`}
          data={median}
          fill="#d8b352"
          shape="diamond"
          isAnimationActive={!reducedMotion && revealed}
          animationBegin={360}
          animationDuration={620}
          animationEasing="ease-out"
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export default function SignalChart({ signal, revealed, focused, cycle, reducedMotion }) {
  const Chart = signal.kind === "inflation" ? InflationChart : signal.kind === "competitor" ? CompetitorChart : FxChart;
  const annotation = signal.kind === "fx"
    ? ["₦1,512.90", "11 Aug"]
    : signal.kind === "inflation"
      ? ["113.18 index", "3 months above baseline"]
      : ["12 of 14 below parity", "Median −3.8%"];

  return (
    <div className={`signal-spark signal-spark--${signal.kind} ${focused ? "is-focused" : ""}`} aria-hidden="true">
      <div className="signal-spark__plot">
        <Chart signal={signal} revealed={revealed} focused={focused} cycle={cycle} reducedMotion={reducedMotion} />
      </div>
      <span className={`signal-spark__annotation signal-spark__annotation--${signal.kind}`}>
        <strong>{annotation[0]}</strong>
        <small>{annotation[1]}</small>
      </span>
    </div>
  );
}
