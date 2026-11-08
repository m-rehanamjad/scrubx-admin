export default function SettingsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between pb-4 border-b border-line">
        <div className="space-y-1">
          <div className="h-4 w-28 bg-surface-muted rounded" />
          <div className="h-7 w-36 bg-surface-muted rounded" />
          <div className="h-4 w-80 bg-surface-muted rounded" />
        </div>
        <div className="h-6 w-36 bg-surface-muted rounded-full" />
      </div>

      <div className="h-10 w-96 bg-surface-muted rounded-lg" />
      <div className="h-96 bg-surface-muted rounded-xl" />
    </div>
  );
}
