export default function PaymentsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between pb-4 border-b border-line">
        <div className="space-y-1">
          <div className="h-4 w-20 bg-surface-muted rounded" />
          <div className="h-7 w-48 bg-surface-muted rounded" />
          <div className="h-4 w-72 bg-surface-muted rounded" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-surface-muted rounded-xl" />
        ))}
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="h-9 w-64 bg-surface-muted rounded mb-4" />
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 w-full bg-surface-muted/60 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
