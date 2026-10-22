export default function Loading() {
  return (
    <div className="w-full min-h-[50vh] flex flex-col items-center justify-center space-y-4">
      <div className="relative w-12 h-12">
        <div className="w-12 h-12 rounded-full border-4 border-blue-200 animate-spin border-t-blue-600" />
      </div>
      <p className="text-sm font-medium text-slate-500 animate-pulse">
        資料載入中，請稍候...
      </p>
    </div>
  );
}
