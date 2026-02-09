import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function BookmarkStar({
  bookmarked,
  onClick,
  className,
}: {
  bookmarked: boolean;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
}) {
  return (
    <button
      className={cn(
        "shrink-0 cursor-pointer transition-colors",
        bookmarked
          ? "text-amber-400"
          : "text-muted-foreground/40 hover:text-amber-400",
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      title={bookmarked ? "Remove bookmark" : "Bookmark endpoint"}
    >
      <Star
        className="h-3 w-3"
        fill={bookmarked ? "currentColor" : "none"}
      />
    </button>
  );
}
