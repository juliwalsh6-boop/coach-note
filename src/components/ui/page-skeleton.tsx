/** 読み込み中の画面 */
export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-4 pt-6" aria-busy="true" aria-label="読み込み中">
      <div className="h-4 w-32 rounded bg-steel" />
      <div className="h-8 w-56 rounded-lg bg-steel" />
      <div className="h-40 rounded-[20px] bg-steel" />
      <div className="h-28 rounded-[20px] bg-steel" />
      <div className="h-28 rounded-[20px] bg-steel" />
    </div>
  );
}
