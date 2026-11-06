'use client';

import { apiFetch } from '@/lib/client-fetch';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KeyRound, Loader2, Plus, ShieldCheck, ShieldOff, Trash2, UserCog } from 'lucide-react';

interface Admin {
  id: string;
  username: string;
  name: string;
  role: string;
  created_at: string;
}

export default function AdminsPage() {
  const [items, setItems] = useState<Admin[]>([]);
  const [meId, setMeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 添加对话框
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ username: '', name: '', password: '', role: 'normal' });
  const [adding, setAdding] = useState(false);

  // 重置密码对话框
  const [pwdTarget, setPwdTarget] = useState<Admin | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    const [meRes, listRes] = await Promise.all([apiFetch('/api/auth/me'), apiFetch('/api/admin/admins')]);
    const meJson = await meRes.json();
    const listJson = await listRes.json();
    if (meJson.code === 0) setMeId(meJson.data?.admin?.id ?? '');
    if (listJson.code === 0) setItems(listJson.data ?? []);
    else setError(listJson.message ?? '加载失败');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    setAdding(true); setError('');
    try {
      const res = await apiFetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      const json = await res.json();
      if (json.code !== 0) { setError(json.message ?? '添加失败'); return; }
      setAddOpen(false);
      setAddForm({ username: '', name: '', password: '', role: 'normal' });
      await load();
    } finally { setAdding(false); }
  }

  async function handleDelete(target: Admin) {
    if (!window.confirm(`确定删除管理员「${target.name}（${target.username}）」吗？其登录会话将立即失效。`)) return;
    const res = await apiFetch(`/api/admin/admins/${target.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.code !== 0) { setError(json.message ?? '删除失败'); return; }
    await load();
  }

  async function handleToggleRole(target: Admin) {
    const next = target.role === 'super' ? 'normal' : 'super';
    const label = next === 'super' ? '设为超级管理员' : '降为普通管理员';
    if (!window.confirm(`确定将「${target.name}」${label}吗？`)) return;
    const res = await apiFetch(`/api/admin/admins/${target.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: next }),
    });
    const json = await res.json();
    if (json.code !== 0) { setError(json.message ?? '操作失败'); return; }
    await load();
  }

  async function handleResetPwd() {
    if (!pwdTarget) return;
    setResetting(true); setError('');
    try {
      const res = await apiFetch(`/api/admin/admins/${pwdTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPwd }),
      });
      const json = await res.json();
      if (json.code !== 0) { setError(json.message ?? '重置失败'); return; }
      setPwdTarget(null); setNewPwd('');
    } finally { setResetting(false); }
  }

  return (
    <div className="space-y-5 page-enter">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-wide">管理员管理</h1>
          <div className="divider-glow w-24 mt-2" />
          <p className="text-sm text-muted-foreground mt-2">超级管理员可添加、删除管理员账号并重置密码</p>
        </div>
        <Button onClick={() => { setError(''); setAddOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" />添加管理员
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-2.5 text-sm text-red-300">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-12">加载中…</p>
      ) : (
        <Card className="card-tech">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="px-4 py-3">用户名</th>
                    <th className="px-4 py-3">姓名</th>
                    <th className="px-4 py-3">角色</th>
                    <th className="px-4 py-3">创建时间</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{a.username}</td>
                      <td className="px-4 py-3">
                        {a.name}
                        {a.id === meId && <span className="text-xs text-muted-foreground ml-1.5">(我)</span>}
                      </td>
                      <td className="px-4 py-3">
                        {a.role === 'super' ? (
                          <Badge className="bg-primary/15 text-primary border border-primary/40">超级管理员</Badge>
                        ) : (
                          <Badge variant="secondary">普通管理员</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString('zh-CN')}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => { setError(''); setPwdTarget(a); setNewPwd(''); }}>
                            <KeyRound className="w-3.5 h-3.5 mr-1" />重置密码
                          </Button>
                          {a.id !== meId && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => handleToggleRole(a)}>
                                {a.role === 'super' ? <><ShieldOff className="w-3.5 h-3.5 mr-1" />降为普通</> : <><ShieldCheck className="w-3.5 h-3.5 mr-1" />设为超管</>}
                              </Button>
                              <Button variant="ghost" size="sm" className="text-red-300 hover:text-red-200 hover:bg-red-500/10" onClick={() => handleDelete(a)}>
                                <Trash2 className="w-3.5 h-3.5 mr-1" />删除
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 添加管理员 */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserCog className="w-5 h-5 text-primary" />添加管理员</DialogTitle>
            <DialogDescription>创建新的管理端账号，密码至少 8 位且包含字母和数字</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>用户名</Label>
              <Input className="input-tech" placeholder="字母开头，3-32 位字母/数字/下划线" value={addForm.username} onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>姓名</Label>
              <Input className="input-tech" placeholder="管理员姓名" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>初始密码</Label>
              <Input className="input-tech" type="password" placeholder="至少 8 位，含字母和数字" value={addForm.password} onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>角色</Label>
              <Select value={addForm.role} onValueChange={(v) => setAddForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger className="input-tech"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">普通管理员</SelectItem>
                  <SelectItem value="super">超级管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>取消</Button>
            <Button onClick={handleAdd} disabled={adding || !addForm.username || !addForm.name || !addForm.password}>
              {adding && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重置密码 */}
      <Dialog open={!!pwdTarget} onOpenChange={(open) => { if (!open) setPwdTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
            <DialogDescription>为「{pwdTarget?.name}」设置新密码，重置后其登录会话将立即失效</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>新密码</Label>
            <Input className="input-tech" type="password" placeholder="至少 8 位，含字母和数字" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwdTarget(null)}>取消</Button>
            <Button onClick={handleResetPwd} disabled={resetting || !newPwd}>
              {resetting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}确认重置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
