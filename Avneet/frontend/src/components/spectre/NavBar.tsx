import ThemeToggle from "./ThemeToggle";

interface NavBarProps {
  showLogo?: boolean;
}

const NavBar = ({ showLogo = true }: NavBarProps) => {
  return (
    <nav className="flex items-center justify-between px-6 py-3">
      {showLogo ? (
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#E24B4A] text-white text-[10px] font-medium">
            SP
          </div>
          <span className="text-sm font-medium text-foreground tracking-tight">SPECTRE</span>
        </div>
      ) : (
        <div />
      )}
      <ThemeToggle />
    </nav>
  );
};

export default NavBar;
