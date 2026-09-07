import logo from "@/assets/acremap-logo.png";

export function Logo({ className = "h-10 w-10", showText = false }: { className?: string; showText?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img src={logo} alt="AcreMap" className={className} />
      {showText && (
        <div className="leading-tight">
          <div className="font-bold text-primary text-lg">AcreMap</div>
          <div className="text-[10px] text-muted-foreground tracking-wider uppercase">Cartographie & Mesure</div>
        </div>
      )}
    </div>
  );
}
