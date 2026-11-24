import { createContext, useContext } from "react";
import type { SsoProfile } from "./session";

export type AuthValue = {
  user: SsoProfile | null;
  projectId: string | null;
  ready: boolean;
  error: string;
  handoffFailed: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
};

export const AuthContext = createContext<AuthValue>({
  user: null, projectId: null, ready: false, error: "", handoffFailed: false,
  signIn: async () => {}, signOut: async () => {}, getAccessToken: async () => null,
});

export const useAuth = () => useContext(AuthContext);
