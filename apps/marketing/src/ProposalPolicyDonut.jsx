import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

const POLICY_SPLIT = [
  { name: "Policy-clear", value: 46, color: "#06332c" },
  { name: "Held for review", value: 7, color: "#b14436" },
];

export default function ProposalPolicyDonut({ reducedMotion = false }) {
  return (
    <div className="proposal-policy-donut">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart accessibilityLayer={false}>
          <Pie
            data={POLICY_SPLIT}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            innerRadius="48%"
            outerRadius="72%"
            paddingAngle={1.5}
            cornerRadius={4}
            stroke="#fbfaf6"
            strokeWidth={3}
            isAnimationActive={!reducedMotion}
            animationBegin={80}
            animationDuration={920}
            animationEasing="ease-out"
          >
            {POLICY_SPLIT.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <span className="proposal-policy-donut__label"><strong>53</strong><small>products</small></span>
    </div>
  );
}
