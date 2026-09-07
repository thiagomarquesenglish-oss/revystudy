import LearningSummary from '@/components/LearningSummary';
import CurriculumPanel from '@/components/CurriculumPanel';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import PageTransition from '@/components/PageTransition';

import Heatmap from '@/components/Heatmap';
import { StatSectionId } from '@/lib/pinned-stats';
import {
  OverviewSection,
  DailyChartSection,
  CardDistributionSection,
  ForecastSection,
  PerDeckSection,
  LearnedCardsSection,
} from '@/components/StatsSections';

function PinnableSection({ id, title, children }: { id: StatSectionId; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2" data-section={id}>
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export default function StatsPage() {
  return (
    <div className="min-h-screen bg-background safe-bottom">
      <PageHeader title="Seu progresso" />
      <PageTransition>
      <main className="max-w-3xl mx-auto px-3 py-4 space-y-6" style={{ paddingTop: 'calc(var(--app-header-height) + 1rem)' }}>

        <CurriculumPanel />
        <LearningSummary />
        <PinnableSection id="daily-chart" title="Revisões de cartões · últimos 30 dias">
          <DailyChartSection />
        </PinnableSection>

        <details className="space-y-5"><summary className="cursor-pointer py-3 font-semibold">Mais detalhes dos cartões</summary>
        <PinnableSection id="overview" title="Visão geral dos cartões"><OverviewSection /></PinnableSection>
        <section className="space-y-2"><h3 className="font-semibold text-sm">Dias de estudo com cartões</h3><Heatmap /></section>
        <div className="flex flex-col sm:flex-row sm:items-start gap-6">
          <PinnableSection id="card-distribution" title="Distribuição de cartões">
            <CardDistributionSection />
          </PinnableSection>

          <PinnableSection id="per-deck" title="Por baralho">
            <PerDeckSection />
          </PinnableSection>
        </div>

        <PinnableSection id="forecast" title="Previsão de revisões">
          <ForecastSection />
        </PinnableSection>

        <PinnableSection id="learned-cards" title="Cartões aprendidos">
          <LearnedCardsSection />
        </PinnableSection>
        </details>
      </main>
      </PageTransition>

      <BottomNav active="stats" />
    </div>
  );
}
