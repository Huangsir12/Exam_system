import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  // 考试状态
  draft: 'bg-slate-400/10 text-slate-300 border-slate-400/25',
  pending: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  published: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  ongoing: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  ended: 'bg-slate-400/10 text-slate-300 border-slate-400/25',
  archived: 'bg-slate-400/10 text-slate-400 border-slate-400/20',
  // 解析状态
  success: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  parsing: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  failed: 'bg-red-500/10 text-red-300 border-red-500/30',
  // 答题状态
  in_progress: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  submitted: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  grading: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  completed: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  generating: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
};

export function StatusBadge({ status, label, className }: { status: string; label: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn('shrink-0 font-normal shadow-[inset_0_0_12px_oklch(1_0_0/3%)]', STATUS_STYLES[status] ?? 'bg-slate-400/10 text-slate-300 border-slate-400/25', className)}>
      {label}
    </Badge>
  );
}
