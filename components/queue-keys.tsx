"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Single-key shortcuts for working a list. Stays out of the way while typing or on a focused control. */
export function QueueKeys({ keys }: { keys: Record<string, string | undefined> }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, button, a, summary, dialog, [contenteditable]")) return;
      const href = keys[event.key];
      if (!href) return;
      event.preventDefault();
      router.push(href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys, router]);
  return null;
}
