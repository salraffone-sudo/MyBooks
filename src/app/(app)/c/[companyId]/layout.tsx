import { notFound } from 'next/navigation';
import NavLink from '@/components/NavLink';
import { requireViewer } from '@/lib/viewer';

export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const viewer = await requireViewer();
  const company = viewer.companies.find((c) => c.id === companyId);
  if (!company) notFound();
  return (
    <>
      <div className="row spread" style={{ marginBottom: 12 }}>
        <div>
          <h1>{company.display_name}</h1>
          <div className="muted small">{company.legal_name} · {company.kind === 'personal' ? 'Personal books' : `${company.basis} basis`}{company.archived_at ? ' · archived' : ''}</div>
        </div>
        <nav className="nav" style={{ flex: 'none' }} aria-label="Company">
          <NavLink href={`/c/${companyId}/accounts`}>Chart of accounts</NavLink>
          <NavLink href={`/c/${companyId}/settings`}>Settings</NavLink>
        </nav>
      </div>
      {children}
    </>
  );
}
