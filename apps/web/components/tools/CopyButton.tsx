"use client";
/**
 * CopyButton (T2.5 tools UI) — copies an invite token or share URL to the
 * clipboard and flips to "Copied" for a moment so the click visibly landed.
 * Used by the Groups page (invite tokens, share links).
 */
import { useEffect, useRef, useState } from "react";

export default function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the pending flip-back timer when the button unmounts.
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      // Clipboard access can be denied (http origins, permissions) — say so.
      setStatus("failed");
    }
    resetTimer.current = setTimeout(() => setStatus("idle"), 1500);
  }

  return (
    <button type="button" onClick={copyValue} className="btn btn-xs btn-ghost text-colortext-2">
      {status === "copied" ? "Copied!" : status === "failed" ? "Copy failed" : label}
    </button>
  );
}
