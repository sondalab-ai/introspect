export function PlaceholderPage({ label }: { label: string }) {
  return (
    <div className="canvas-body">
      <div className="loading">"{label}" arriverà in una slice successiva.</div>
    </div>
  );
}
