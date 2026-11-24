"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/shared/auth/AuthProvider";
import { ProjectAccessGate } from "@/shared/auth/ProjectAccessGate";
import { AiConsentProvider } from "@/shared/llm/AiConsentProvider";
import { AppShell } from "./AppShell";

export function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider><ProjectAccessGate><AiConsentProvider><AppShell>{children}</AppShell></AiConsentProvider></ProjectAccessGate></AuthProvider>;
}
