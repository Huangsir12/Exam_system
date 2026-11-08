'use client';

import { apiFetch, clearClientToken } from '@/lib/client-fetch';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { BookOpenText, ClipboardList, LayoutDashboard, LogOut, Radio, ScrollText, UserCog } from 'lucide-react';

const NAV = [
  { href: '/admin', label: '数据总览', icon: LayoutDashboard, exact: true },
  { href: '/admin/documents', label: '知识文档', icon: BookOpenText },
  { href: '/admin/exams', label: '考试管理', icon: ClipboardList },
  { href: '/admin/logs', label: '操作日志', icon: ScrollText },
  { href: '/admin/admins', label: '管理员', icon: UserCog, superOnly: true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [name, setName] = useState('');
  const [role, setRole] = useState('normal');

  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (isLoginPage) return;
    apiFetch('/api/auth/me')
      .then((r) => r.json())
      .then((json) => {
        if (json.code !== 0 || !json.data?.admin) {
          router.replace('/admin/login');
          return;
        }
        setName(json.data.admin.user_name ?? '');
        setRole(json.data.admin.role === 'super' ? 'super' : 'normal');
      })
      .catch(() => router.replace('/admin/login'));
  }, [pathname, isLoginPage, router]);

  const visibleNav = NAV.filter((item) => !item.superOnly || role === 'super');

  if (isLoginPage) return <>{children}</>;

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    clearClientToken('admin');
    router.replace('/admin/login');
  }

  return (
    <div className="min-h-dvh bg-background flex">
      {/* 侧边栏 */}
      <aside className="w-56 shrink-0 bg-sidebar/95 backdrop-blur-xl text-sidebar-foreground flex-col hidden md:flex fixed inset-y-0 z-20 border-r border-sidebar-border shadow-[18px_0_50px_-32px_oklch(0.8_0.13_195/28%)]">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-sidebar-border relative overflow-hidden">
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          <div className="relative w-8 h-8 rounded-lg border border-sidebar-primary/50 bg-sidebar-primary/15 text-sidebar-primary flex items-center justify-center font-display font-bold text-sm shadow-[0_0_16px_-2px_oklch(0.8_0.13_195/50%)]">考</div>
          <div>
            <p className="font-display font-bold text-sm leading-tight tracking-wide">智能考试系统</p>
            <p className="text-[10px] text-sidebar-foreground/50 tracking-widest">EXAM CONSOLE</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          <div className="px-3 pb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/35">
            <Radio className="size-3 text-primary/70" aria-hidden="true" />
            Console nodes
          </div>
          {visibleNav.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-200',
                  active
                    ? 'bg-sidebar-accent text-sidebar-primary font-medium shadow-[inset_0_0_0_1px_oklch(0.8_0.13_195/30%),0_0_18px_-6px_oklch(0.8_0.13_195/40%)]'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                )}
              >
                {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-sidebar-primary shadow-[0_0_8px_oklch(0.8_0.13_195/80%)]" />}
                <item.icon className="w-4 h-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-2 mb-2 min-w-0">
            <p className="text-xs text-sidebar-foreground/60 truncate">{name}</p>
            {role === 'super' && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-sidebar-primary/40 bg-sidebar-primary/15 text-sidebar-primary">超管</span>
            )}
          </div>
          <button
            onClick={logout}
            className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            退出登录
          </button>
        </div>
      </aside>

      {/* 移动端顶栏 */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-sidebar/90 backdrop-blur-xl text-sidebar-foreground border-b border-sidebar-border">
        <div className="h-16 flex items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg border border-primary/35 bg-primary/10 text-primary flex items-center justify-center font-display font-bold">考</div>
            <div>
              <span className="block font-display font-bold text-sm tracking-wide">智能考试系统</span>
              <span className="block text-[9px] tracking-[0.16em] text-sidebar-foreground/40">EXAM CONSOLE</span>
            </div>
          </div>
          <button onClick={logout} aria-label="退出登录" className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <LogOut className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <nav aria-label="管理端主导航" className="md:hidden fixed bottom-0 inset-x-0 z-30 flex justify-around gap-1 border-t border-sidebar-border bg-sidebar/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
          {visibleNav.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex min-h-12 min-w-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] transition-colors',
                  active ? 'bg-sidebar-accent text-primary' : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                )}
                aria-current={active ? 'page' : undefined}
              >
                {active && <span className="absolute top-0 h-0.5 w-7 rounded-full bg-primary shadow-[0_0_8px_oklch(0.8_0.13_195/80%)]" />}
                <item.icon className="w-4 h-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
      </nav>

      <main id="main-content" tabIndex={-1} className="flex-1 md:ml-56 pt-16 pb-20 md:pt-0 md:pb-0 min-w-0 outline-none">
        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
