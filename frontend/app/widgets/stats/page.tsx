import { UsageStatsPanel } from "@/components/usage-stats";

// Minimal embeddable widget page — no site chrome, transparent body.
// Embed via iframe:
//   <iframe src="https://shijuan.heydee.cc/widgets/stats"
//           width="360" height="440"
//           style="border:0;background:transparent" loading="lazy"></iframe>
export const dynamic = "force-static";

export default function StatsWidgetPage() {
  return (
    <div className="min-h-screen bg-transparent p-3">
      <UsageStatsPanel />
    </div>
  );
}
