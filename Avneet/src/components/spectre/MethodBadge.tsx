const methodColors: Record<string, string> = {
  GET: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  POST: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  PUT: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  DELETE: "bg-red-500/10 text-red-600 dark:text-red-400",
  PATCH: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
};

const MethodBadge = ({ method }: { method: string }) => (
  <span
    className={`inline-flex rounded px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide ${
      methodColors[method] || methodColors.GET
    }`}
  >
    {method}
  </span>
);

export default MethodBadge;
