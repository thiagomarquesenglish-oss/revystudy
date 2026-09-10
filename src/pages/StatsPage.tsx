import CurriculumPanel from '@/components/CurriculumPanel';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import PageTransition from '@/components/PageTransition';

export default function StatsPage(){
 return <div className="min-h-screen bg-background safe-bottom"><PageHeader title="Progresso"/><PageTransition><main className="max-w-3xl mx-auto px-4 pb-8" style={{paddingTop:'calc(var(--app-header-height) + 1.25rem)'}}><CurriculumPanel/></main></PageTransition><BottomNav active="stats"/></div>;
}
