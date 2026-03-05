export default function Dashboard() {
  return (
    <div className="h-full w-full -m-6">
      <iframe
        src="/call-dashboard.html"
        title="Call History & Analytics"
        className="w-full h-[calc(100vh-4rem)] border-0 rounded-none"
      />
    </div>
  );
}
