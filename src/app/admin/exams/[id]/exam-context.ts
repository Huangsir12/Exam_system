'use client';

import { createContext, useContext } from 'react';
import type { Exam } from '@/lib/types';

export interface ExamContextValue {
  exam: Exam;
  reload: () => Promise<void>;
}

export const ExamContext = createContext<ExamContextValue | null>(null);

export function useExam(): ExamContextValue {
  const ctx = useContext(ExamContext);
  if (!ctx) throw new Error('useExam must be used within exam layout');
  return ctx;
}
