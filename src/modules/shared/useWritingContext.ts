"use client";

import { useMemo } from "react";
import { useAuth } from "@/shared/auth/authContext";
import type { ApiContext } from "@/shared/worker/api";

export function useWritingContext() {
  const { getAccessToken, projectId } = useAuth();
  const context = useMemo<ApiContext | null>(() => projectId ? { getToken: getAccessToken, projectId } : null, [getAccessToken, projectId]);
  return context;
}
