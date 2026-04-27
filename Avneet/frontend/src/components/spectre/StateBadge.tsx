const stateStyles: Record<string, string> = {
  active: "bg-spectre-active-bg text-spectre-active",
  zombie: "bg-spectre-zombie-bg text-spectre-zombie",
  shadow: "bg-spectre-shadow-bg text-spectre-shadow",
  rogue: "bg-spectre-rogue-bg text-spectre-rogue",
};

const StateBadge = ({ state, large }: { state: string; large?: boolean }) => {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium capitalize ${
        stateStyles[state] || stateStyles.active
      } ${large ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[10px]"}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${
        state === "active" ? "bg-spectre-active" :
        state === "zombie" ? "bg-spectre-zombie" :
        state === "shadow" ? "bg-spectre-shadow" :
        "bg-spectre-rogue"
      }`} />
      {state}
    </span>
  );
};

export default StateBadge;
