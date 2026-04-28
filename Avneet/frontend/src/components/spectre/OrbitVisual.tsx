/**
 * Animated orbital API discovery visualization.
 * - 3 concentric dashed orbits (Known, Shadow, Zombie)
 * - Rotating dots representing APIs of each state
 * - Pulsing core with "SPECTRE / DISCOVERY" label
 * - Subtle radar sweep
 */
const OrbitVisual = () => {
  // dot configs: { orbit (px radius), startAngle (deg), color token }
  const knownDots = [
    { angle: 0 },
    { angle: 120 },
    { angle: 240 },
  ];
  const shadowDots = [
    { angle: 30 },
    { angle: 110 },
    { angle: 200 },
    { angle: 290 },
  ];
  const zombieDots = [
    { angle: 60 },
    { angle: 165 },
    { angle: 250 },
    { angle: 340 },
  ];

  return (
    <div className="relative mx-auto h-[420px] w-[420px] md:h-[520px] md:w-[520px] select-none">
      {/* radar sweep */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, hsl(var(--spectre-active) / 0.12) 30deg, transparent 60deg)",
          animation: "spin 8s linear infinite",
          maskImage: "radial-gradient(circle, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(circle, black 30%, transparent 75%)",
        }}
      />

      {/* Outer orbit - Zombie */}
      <Orbit size="92%" color="hsl(var(--spectre-zombie))" label="Zombie APIs" labelPos="top" dashed />
      {/* Middle orbit - Shadow */}
      <Orbit size="66%" color="hsl(var(--spectre-shadow))" label="Shadow APIs" labelPos="right" dashed />
      {/* Inner orbit - Known/Active */}
      <Orbit size="40%" color="hsl(var(--spectre-active))" label="Known APIs" labelPos="top" />

      {/* Rotating rings of dots */}
      <RotatingRing radius="46%" duration="40s" direction="normal">
        {zombieDots.map((d, i) => (
          <OrbitDot key={`z${i}`} angle={d.angle} color="hsl(var(--spectre-zombie))" delay={i * 0.4} />
        ))}
      </RotatingRing>
      <RotatingRing radius="33%" duration="28s" direction="reverse">
        {shadowDots.map((d, i) => (
          <OrbitDot key={`s${i}`} angle={d.angle} color="hsl(var(--spectre-shadow))" delay={i * 0.3} />
        ))}
      </RotatingRing>
      <RotatingRing radius="20%" duration="18s" direction="normal">
        {knownDots.map((d, i) => (
          <OrbitDot key={`k${i}`} angle={d.angle} color="hsl(var(--spectre-active))" delay={i * 0.2} size={9} />
        ))}
      </RotatingRing>

      {/* Core */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative flex h-24 w-24 md:h-28 md:w-28 items-center justify-center rounded-full bg-[#E24B4A]/15 backdrop-blur-sm">
          {/* pulse rings */}
          <span className="absolute inset-0 rounded-full bg-[#E24B4A]/30 animate-pulse-ring" />
          <span
            className="absolute inset-0 rounded-full bg-[#E24B4A]/20 animate-pulse-ring"
            style={{ animationDelay: "1.2s" }}
          />
          <div className="relative flex h-14 w-14 md:h-16 md:w-16 flex-col items-center justify-center rounded-full bg-[#E24B4A] text-white shadow-[0_0_40px_rgba(226,75,74,0.5)]">
            <span className="text-[11px] font-medium tracking-tight leading-none">SPECTRE</span>
            <span className="mt-0.5 text-[7px] uppercase tracking-[0.2em] opacity-80">Discovery</span>
          </div>
        </div>
      </div>

      {/* Faint cross-hair lines */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-1/2 h-px w-full -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-transparent via-border to-transparent opacity-30" />
        <div className="absolute left-1/2 top-1/2 h-full w-px -translate-x-1/2 -translate-y-1/2 bg-gradient-to-b from-transparent via-border to-transparent opacity-30" />
      </div>
    </div>
  );
};

interface OrbitProps {
  size: string;
  color: string;
  label: string;
  labelPos: "top" | "right" | "bottom" | "left";
  dashed?: boolean;
}

const Orbit = ({ size, color, label, labelPos, dashed }: OrbitProps) => {
  const labelStyle: React.CSSProperties = {
    position: "absolute",
    color,
    fontSize: "11px",
    fontWeight: 500,
    letterSpacing: "0.02em",
    whiteSpace: "nowrap",
  };
  if (labelPos === "top") {
    Object.assign(labelStyle, { top: "-10px", left: "50%", transform: "translate(-50%,-100%)" });
  } else if (labelPos === "right") {
    Object.assign(labelStyle, { right: "-10px", top: "50%", transform: "translate(100%,-50%)" });
  }
  return (
    <div
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        width: size,
        height: size,
        border: `1px ${dashed ? "dashed" : "solid"} ${color}`,
        opacity: dashed ? 0.45 : 0.7,
        boxShadow: !dashed ? `0 0 30px -10px ${color}` : undefined,
      }}
    >
      <span style={labelStyle}>{label}</span>
    </div>
  );
};

interface RotatingRingProps {
  radius: string;
  duration: string;
  direction: "normal" | "reverse";
  children: React.ReactNode;
}

const RotatingRing = ({ radius, duration, direction, children }: RotatingRingProps) => (
  <div
    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
    style={{
      width: `calc(${radius} * 2)`,
      height: `calc(${radius} * 2)`,
      animation: `spin ${duration} linear ${direction === "reverse" ? "reverse" : ""} infinite`,
    }}
  >
    {children}
  </div>
);

interface OrbitDotProps {
  angle: number;
  color: string;
  delay?: number;
  size?: number;
}

const OrbitDot = ({ angle, color, delay = 0, size = 11 }: OrbitDotProps) => {
  const positionStyle: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 0,
    height: 0,
    transform: `rotate(${angle}deg) translateY(-50%)`,
    transformOrigin: "0 0",
  };
  return (
    <div style={positionStyle}>
      <div style={{ transform: `rotate(-${angle}deg)` }}>
        <div
          style={{
            width: size,
            height: size,
            marginLeft: -size / 2,
            marginTop: -size / 2,
            borderRadius: "9999px",
            background: color,
            boxShadow: `0 0 ${size * 1.4}px ${color}, 0 0 ${size * 0.5}px ${color}`,
            animation: `orbit-dot-pulse 2.4s ease-in-out ${delay}s infinite`,
          }}
        />
      </div>
    </div>
  );
};

export default OrbitVisual;
