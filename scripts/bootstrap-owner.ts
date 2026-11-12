// Creates the single Owner. Run once after the migrations are applied:
//   npm run bootstrap-owner -- you@example.com "Your Name"
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SITE_URL in .env.local.
import { createClient } from '@supabase/supabase-js';

async function main() {
  const [email, ...nameParts] = process.argv.slice(2);
  const displayName = nameParts.join(' ').trim() || undefined;
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    console.error('Usage: npm run bootstrap-owner -- you@example.com "Your Name"');
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  if (!url || !key) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: existing, error: lookupError } = await admin.from('profiles').select('email').eq('is_owner', true).maybeSingle();
  if (lookupError) throw new Error(`Could not read profiles (were the migrations applied?): ${lookupError.message}`);
  if (existing) {
    console.error(`An owner already exists (${existing.email}). There can be only one. Nothing changed.`);
    process.exit(1);
  }

  const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: displayName ? { display_name: displayName } : {} });
  let userId = created.data.user?.id;
  if (created.error) {
    // The user may already exist (for example, invited earlier). Find them by email.
    const { data: profile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    if (!profile) throw new Error(`Could not create the user: ${created.error.message}`);
    userId = profile.id;
  }

  const { error: ownerError } = await admin.from('profiles').update({ is_owner: true }).eq('id', userId!);
  if (ownerError) throw new Error(`Could not mark the owner: ${ownerError.message}`);

  const link = await admin.auth.admin.generateLink({ type: 'recovery', email });
  if (link.error || !link.data.properties?.hashed_token) throw new Error(`Could not create the sign-in link: ${link.error?.message}`);

  console.log(`\nOwner created: ${email}\n`);
  console.log('Open this link once to choose your password and set up two-step sign-in (it expires in about an hour):\n');
  console.log(`${site}/auth/confirm?token_hash=${link.data.properties.hashed_token}&type=recovery\n`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
