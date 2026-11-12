import Link from 'next/link';
import { requireViewer } from '@/lib/viewer';
import { getScope } from '@/lib/scope';
import NavLink from '@/components/NavLink';
import CompanySwitcher from '@/components/CompanySwitcher';
import ThemeToggle from '@/components/ThemeToggle';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const stored = await getScope();
  const current = viewer.companies.some((c) => c.id === stored) ? stored : 'all';
  const active = viewer.companies.filter((c) => !c.archived_at);

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand"><img src="/icon.svg" alt="" /> MyBooks</Link>
        <nav className="nav" aria-label="Main">
          <NavLink href="/" exact>Dashboard</NavLink>
          {viewer.isOwner && <NavLink href="/companies/new">New company</NavLink>}
          {viewer.isOwner && <NavLink href="/users">Users</NavLink>}
          {viewer.isOwner && <NavLink href="/templates">Templates</NavLink>}
          {viewer.isOwner && <NavLink href="/audit">Audit log</NavLink>}
        </nav>
        <CompanySwitcher companies={active.map((c) => ({ id: c.id, name: c.display_name }))} current={current} />
        <ThemeToggle />
        <form action="/auth/signout" method="post"><button className="btn small" title={viewer.email}>Sign out</button></form>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
