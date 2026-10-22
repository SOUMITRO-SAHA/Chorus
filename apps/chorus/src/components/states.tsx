import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CircleAlert, RotateCcw } from "lucide-react";

/** DRY async states used by every feature. */

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void; }) {
  return (
    <Card className="border-destructive/40">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <CircleAlert className="size-8 text-destructive" />
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} aria-label="Try again">
            <RotateCcw className="size-4" /> Try again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function ListSkeleton({ rows = 8 }: { rows?: number; }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
