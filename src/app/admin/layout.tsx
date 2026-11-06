'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { BookOpenText, ClipboardList, LayoutDashboard, LogOut, ScrollText } from 'lucide-react';

const NAV = [
  { href: '/admin', label: '数据总览', icon: LayoutDashboard, exact: true },
  { href: '/admin/documents', label: '知识文档', icon: BookOpenText },
  { href: '/admin/exams', label: '考试管理', icon: ClipboardList },
  { href: '/admin/logs', label: '操作日志', icon: ScrollText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [name, setName] = useState('');

  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (isLoginPage) return;
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((json) => {
        if (json.code !== 0 || json.data?.user_type !== 'admin') {
          router.replace('/admin/login');
          return;
        }
        setName(json.data.user_name ?? '');
      })
      .catch(() => router.replace('/admin/login'));
  }, [pathname, isLoginPage, router]);

  if (isLoginPage) return <>{children}</>;

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/admin/login');
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* 侧边栏 */}
      <aside className="w-56 shrink-0 bg-sidebar text-sidebar-foreground flex-col hidden md:flex fixed inset-y-0 z-20">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-serif font-bold text-sm">考</div>
          <div>
            <p className="font-serif font-bold text-sm leading-tight">智能考试系统</p>
            <p className="text-[10px] text-sidebar-foreground/60">管理后台</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <p className="text-xs text-sidebar-foreground/60 mb-2 truncate">{name}</p>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-xs text-sidebar-foreground/70 hover:text-sidebar-accent-foreground transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            退出登录
          </button>
        </div>
      </aside>

      {/* 移动端顶栏 */}
      <div className="md:hidden fixed top-0 inset-x-0 z-20 bg-sidebar text-sidebar-foreground">
        <div className="h-14 flex items-center justify-between px-4">
          <span className="font-serif font-bold text-sm">智能考试系统</span>
          <button onClick={logout} className="text-xs text-sidebar-foreground/70">退出</button>
        </div>
        <nav className="flex px-2 pb-2 gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap',
                  active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70',
                )}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <main className="flex-1 md:ml-56 pt-24 md:pt-0 min-w-0">
        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
