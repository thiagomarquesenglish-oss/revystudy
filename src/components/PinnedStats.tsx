import { getPinnedStats, StatSectionId, STAT_SECTION_LABELS } from '@/lib/pinned-stats';
import {
  OverviewSection,
  DailyChartSection,
  CardDistributionSection,
  ForecastSection,
  PerDeckSection,
  LearnedCardsSection,
} from './StatsSections';

const SECTION_COMPONENTS: Record<StatSectionId, React.FC> = {
  'overview': OverviewSection,
  'daily-chart': DailyChartSection,
  'card-distribution': CardDistributionSection,
  'forecast': ForecastSection,
  'per-deck': PerDeckSection,
  'learned-cards': LearnedCardsSection,
};

export default function PinnedStats() {
  const pinned = getPinnedStats();

  if (pinned.length === 0) return null;

  return (
    <>
      {pinned.map(id => {
        const Component = SECTION_COMPONENTS[id];
        if (!Component) return null;
        return (
          <section key={id} className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
              {STAT_SECTION_LABELS[id]}
            </h3>
            <Component />
          </section>
        );
      })}
    </>
  );
}
