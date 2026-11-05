import { cn } from "../../lib/utils";

export function ProductThumb({
  src,
  alt,
  size = "md",
  className,
}: {
  src: string;
  alt: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    sm: "h-9 w-9 rounded-md",
    md: "h-11 w-11 rounded-lg",
    lg: "h-16 w-16 rounded-lg",
    xl: "h-24 w-24 rounded-xl",
  };
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden border border-line bg-surface-muted",
        sizes[size],
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.opacity = "0.25";
        }}
      />
    </div>
  );
}

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const sizes = {
    sm: "h-7 w-7 text-[10px]",
    md: "h-9 w-9 text-[11px]",
    lg: "h-12 w-12 text-sm",
  };
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-brand-50 font-semibold text-brand-700 ring-1 ring-brand-100",
        sizes[size],
        className,
      )}
    >
      {initials || "?"}
    </div>
  );
}
