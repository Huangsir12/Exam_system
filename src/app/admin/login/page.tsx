'use client';

import { apiFetch, saveClientToken } from '@/lib/client-fetch';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ShieldCheck } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    <div className="min-h-screen flex items-center justify-center px-4 page-enter">
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

        <form onSubmit={handleLogin} className="card-tech rounded-xl p-6 sm:p-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="username" className="text-foreground/80">账号</Label>
            <div className="input-tech rounded-md transition-shadow">
              <Input id="username" placeholder="管理员账号" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" className="bg-secondary/60 border-input" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground/80">密码</Label>
            <div className="input-tech rounded-md transition-shadow">
              <Input id="password" type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="bg-secondary/60 border-input" />
            </div>
          </div>
          {error && <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">{error}</p>}
          <Button type="submit" className="w-full btn-glow font-semibold" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
            进入驾驶舱
          </Button>
        </form>
        <p className="text-center mt-8">
          <a href="/login" className="text-xs text-muted-foreground hover:text-primary transition-colors">← 返回考生入口</a>
        </p>
      </div>
    </div>
  );
}
