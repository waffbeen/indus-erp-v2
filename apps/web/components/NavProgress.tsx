"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Thin loading bar at the top — pulses for ~600ms after each navigation so the
 * user feels the app responding even when the API is slow.
 *
 * Not a real progress indicator (App Router doesn't expose route-change events
 * cleanly yet); just a perceived-performance cue.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 600);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[200] pointer-events-none transition-opacity duration-200"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div className="h-[3px] overflow-hidden">
        <div
          className="h-full w-1/3 nav-progress-bar"
          style={{
            background: "linear-gradient(90deg, transparent, var(--primary), transparent)",
          }}
        />
      </div>
      <style jsx>{`
        .nav-progress-bar {
          animation: nav-slide 1s ease-in-out infinite;
        }
        @keyframes nav-slide {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(200%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
