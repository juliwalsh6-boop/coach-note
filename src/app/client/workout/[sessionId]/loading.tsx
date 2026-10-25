import { PageSkeleton } from "@/components/ui/page-skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-[480px] px-4 pt-safe">
      <PageSkeleton />
    </main>
  );
}
