import { BookOpen, Mic2, PenLine, Volume2 } from 'lucide-react';
import type { LearningSkill } from '@/lib/adaptive-study';

const skills = {
  listening: { label: 'Listening', icon: Volume2 },
  production: { label: 'Speaking', icon: Mic2 },
  comprehension: { label: 'Reading', icon: BookOpen },
  writing: { label: 'Writing', icon: PenLine },
} satisfies Record<LearningSkill, { label: string; icon: typeof Volume2 }>;

export default function SkillBadge({ skill }: { skill: LearningSkill }) {
  const { label, icon: Icon } = skills[skill];
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    {label}
  </span>;
}
