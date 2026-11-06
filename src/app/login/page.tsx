'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GraduationCap, Loader2, MessageSquareText } from 'lucide-react';

export default function CandidateLoginPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [devCode, setDevCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function sendCode() {
    setError('');
    if (!/^1\d{10}$/.test(phone)) {
      setError('请输入正确的手机号');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/auth/candidate/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const json = await res.json();
      if (!res.ok || json.code !== 0) {
        setError(json.message || '发送失败，请稍后再试');
        return;
      }
      setDevCode(json.data?.dev_code ?? '');
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) clearInterval(timer);
          return c - 1;
        });
      }, 1000);
    } catch {
      setError('网络异常，请稍后再试');
    } finally {
      setSending(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('请输入姓名');
    if (!code.trim()) return setError('请输入验证码');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/candidate/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone, code: code.trim() }),
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary text-primary-foreground mb-4">
            <GraduationCap className="w-7 h-7" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-foreground">智能考试系统</h1>
          <p className="text-sm text-muted-foreground mt-2">考生登录 · 手机验证码验证身份</p>
        </div>

        <form onSubmit={handleLogin} className="bg-card border border-border rounded-xl p-6 sm:p-8 shadow-sm space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">姓名</Label>
            <Input
              id="name"
              placeholder="请输入与报名名单一致的姓名"
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
          <div className="space-y-2">
            <Label htmlFor="code">验证码</Label>
            <div className="flex gap-2">
              <Input
                id="code"
                placeholder="6 位验证码"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="flex-1"
                autoComplete="one-time-code"
              />
              <Button
                type="button"
                variant="outline"
                onClick={sendCode}
                disabled={sending || countdown > 0}
                className="shrink-0 w-28"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : countdown > 0 ? `${countdown}s` : '获取验证码'}
              </Button>
            </div>
            {devCode && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-center gap-1.5">
                <MessageSquareText className="w-3.5 h-3.5 shrink-0" />
                演示模式未接入短信通道，本次验证码：<span className="font-mono font-bold tracking-wider">{devCode}</span>
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
            登录并查看我的考试
          </Button>
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            仅限考试名单内的考生登录；姓名须与名单登记一致
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
