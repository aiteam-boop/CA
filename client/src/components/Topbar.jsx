export default function Topbar({ title }) {
  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 sticky top-0 z-30">
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
    </header>
  );
}
