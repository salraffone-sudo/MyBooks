import { redirect } from 'next/navigation';

export default async function CompanyHome({ params }: { params: Promise<{ companyId: string }> }) {
  redirect(`/c/${(await params).companyId}/accounts`);
}
