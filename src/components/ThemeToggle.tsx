"use client";

import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

/**
 * Theme toggle switch.
 *
 * Uses next-themes `useTheme()` to switch between light and dark mode.
 * Displays a sun icon when in dark mode (switching to light) and a moon
 * icon when in light mode (switching to dark).
 *
 * The switch is off (not checked) for dark mode, on (checked) for light.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch — next-themes needs the client to resolve
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-9 w-9" />;
  }

  const isLight = theme === "light";

  return (
    <div className="flex items-center gap-2">
      <Switch
        id="theme-toggle"
        checked={isLight}
        onCheckedChange={(checked) => setTheme(checked ? "light" : "dark")}
        aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      />
      <Label htmlFor="theme-toggle" className="cursor-pointer">
        {isLight ? (
          <Sun className="size-4 text-amber-500" aria-hidden="true" />
        ) : (
          <Moon className="size-4 text-blue-400" aria-hidden="true" />
        )}
      </Label>
    </div>
  );
}
