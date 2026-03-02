import { useEffect, useRef, useState } from "react";

type UseHideMobileFloatingControlsOptions = {
  topOffset?: number;
  threshold?: number;
  desktopBreakpoint?: number;
};

export function useHideMobileFloatingControls(
  options: UseHideMobileFloatingControlsOptions = {},
) {
  const { topOffset = 40, threshold = 8, desktopBreakpoint = 768 } = options;
  const [hidden, setHidden] = useState(false);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerWidth >= desktopBreakpoint) {
        setHidden(false);
        lastScrollYRef.current = window.scrollY;
        return;
      }

      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - lastScrollYRef.current;

      if (currentScrollY <= topOffset) {
        setHidden(false);
      } else if (scrollDelta > threshold) {
        setHidden(true);
      } else if (scrollDelta < -threshold) {
        setHidden(false);
      }

      lastScrollYRef.current = currentScrollY;
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [desktopBreakpoint, threshold, topOffset]);

  return hidden;
}
