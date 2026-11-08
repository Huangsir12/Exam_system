'use client';

import { apiFetch, saveClientToken } from '@/lib/client-fetch';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('请输入账号和密码');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const json = await res.json();
      if (!res.ok || json.code !== 0) {
        setError(json.message || '登录失败');
        return;
      }
      if (json.data?.token) saveClientToken('admin', json.data.token as string);
      router.push('/admin');
    } catch {
      setError('网络异常，请稍后再试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="min-h-dvh flex items-center justify-center px-4 py-10 page-enter outline-none">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl border border-primary/40 bg-primary/10 mb-5 shadow-[0_0_36px_-6px_oklch(0.8_0.13_195/45%)]">
            <ShieldCheck className="w-8 h-8 text-primary" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-primary pulse-dot" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-wide">
            <span className="text-gradient">EXAM CONTROL</span>
          </h1>
          <div className="divider-glow w-40 mx-auto mt-3" />
          <p className="text-sm text-muted-foreground mt-3">智能考试系统 · 管理驾驶舱</p>
        </div>

        <form onSubmit={handleLogin} className="card-tech holo-panel rounded-xl p-6 sm:p-8 space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="username" className="text-foreground/80">账号</Label>
            <div className="input-tech rounded-md transition-shadow">
              <Input id="username" placeholder="管理员账号" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" aria-invalid={error.includes('账号') || undefined} className="bg-secondary/60 border-input" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground/80">密码</Label>
            <div className="input-tech relative rounded-md transition-shadow">
              <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" aria-invalid={error.includes('密码') || undefined} className="bg-secondary/60 border-input pr-11" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-0 top-0 flex size-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={showPassword ? '隐藏密码' : '显示密码'} aria-pressed={showPassword}>
                {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
              </button>
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">{error}</p>}
          <Button type="submit" className="w-full btn-glow font-semibold" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
            进入驾驶舱
          </Button>
        </form>
        <p className="text-center mt-8">
          <Link href="/login" className="inline-flex min-h-11 items-center text-xs text-muted-foreground hover:text-primary transition-colors">← 返回考生入口</Link>
        </p>
      </div>
    </main>
  );
}
