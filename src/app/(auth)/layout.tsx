export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth">
      <div className="logo"><img src="/icon.svg" alt="" /> MyBooks</div>
      <div className="card">{children}</div>
    </main>
  );
}
