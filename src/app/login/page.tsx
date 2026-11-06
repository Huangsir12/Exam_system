'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GraduationCap, Loader2 } from 'lucide-react';

export default function CandidateLoginPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('请输入姓名');
    if (!/^1\d{10}$/.test(phone)) return setError('请输入正确的手机号');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/candidate/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone }),
      });
      const json = await res.json();
      if (!res.ok || json.code !== 0) {
        setError(json.message || '登录失败');
        return;
      }
      router.push('/exams');
    } catch {
      setError('网络异常，请稍后再试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 page-enter">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl border border-primary/40 bg-primary/10 mb-5 shadow-[0_0_36px_-6px_oklch(0.8_0.13_195/45%)]">
            <GraduationCap className="w-8 h-8 text-primary" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-primary pulse-dot" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-wide">
            <span className="text-gradient">智能考试系统</span>
          </h1>
          <div className="divider-glow w-40 mx-auto mt-3" />
          <p className="text-sm text-muted-foreground mt-3">考生登录 · 姓名 + 手机号</p>
        </div>

        <form onSubmit={handleLogin} className="card-tech rounded-xl p-6 sm:p-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">姓名</Label>
            <Input
              id="name"
              placeholder="请输入姓名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">手机号</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="请输入 11 位手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              autoComplete="tel"
            />
          </div>

          {error && <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">{error}</p>}

          <Button type="submit" className="w-full btn-glow font-semibold" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
            登录并查看我的考试
          </Button>
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            登录后可查看与你相关的考试
          </p>
        </form>

        <p className="text-center mt-6">
          <a href="/admin/login" className="text-xs text-muted-foreground hover:text-primary transition-colors">
            管理员入口 →
          </a>
        </p>
      </div>
    </div>
  );
}
