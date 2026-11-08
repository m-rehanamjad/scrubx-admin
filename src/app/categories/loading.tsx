export default function CategoriesLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between pb-4 border-b border-line">
        <div className="space-y-1">
          <div className="h-4 w-28 bg-surface-muted rounded" />
          <div className="h-7 w-40 bg-surface-muted rounded" />
          <div className="h-4 w-72 bg-surface-muted rounded" />
        </div>
        <div className="h-9 w-32 bg-surface-muted rounded" />
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="h-6 w-full bg-surface-muted rounded mb-4" />
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 w-full bg-surface-muted/60 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
