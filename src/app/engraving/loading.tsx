export default function EngravingLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between pb-4 border-b border-line">
        <div className="space-y-1">
          <div className="h-4 w-28 bg-surface-muted rounded" />
          <div className="h-7 w-44 bg-surface-muted rounded" />
          <div className="h-4 w-80 bg-surface-muted rounded" />
        </div>
        <div className="h-9 w-28 bg-surface-muted rounded" />
      </div>

      <div className="h-14 bg-surface-muted rounded-lg" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-56 bg-surface-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}
