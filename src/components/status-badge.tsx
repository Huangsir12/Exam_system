import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  // 考试状态
  draft: 'bg-stone-100 text-stone-600 border-stone-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  published: 'bg-sky-50 text-sky-700 border-sky-200',
  ongoing: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ended: 'bg-stone-200 text-stone-700 border-stone-300',
  archived: 'bg-stone-100 text-stone-500 border-stone-200',
  // 解析状态
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  parsing: 'bg-sky-50 text-sky-700 border-sky-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  // 答题状态
  in_progress: 'bg-sky-50 text-sky-700 border-sky-200',
  submitted: 'bg-amber-50 text-amber-700 border-amber-200',
  grading: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  generating: 'bg-sky-50 text-sky-700 border-sky-200',
};

export function StatusBadge({ status, label, className }: { status: string; label: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-normal', STATUS_STYLES[status] ?? 'bg-stone-100 text-stone-600', className)}>
      {label}
    </Badge>
  );
}
