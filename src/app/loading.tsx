import { RefreshCw } from "lucide-react";

export default function Loading() {
  return (
    <div className="w-full min-h-[50vh] flex flex-col items-center justify-center">
      <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-3" />
      <p className="text-sm font-medium text-slate-500">
        資料載入中，請稍候...
      </p>
    </div>
  );
}
