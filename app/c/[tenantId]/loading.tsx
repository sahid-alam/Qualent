export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="grid animate-pulse gap-3">
      <div className="h-7 w-56 rounded-full bg-inner" />
      <div className="h-4 w-80 max-w-full rounded-full bg-inner" />
      <div className="h-48 rounded-card bg-card" />
    </div>
  );
}
