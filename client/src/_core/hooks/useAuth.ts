import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/login" } =
    options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        // Already logged out, continue cleanup
      } else {
        console.error("Logout error:", error);
      }
    } finally {
      // SECURITY: Clear all auth data on logout
      localStorage.removeItem("auth_token");
      localStorage.removeItem("user-info");
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      window.location.href = "/login";
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    let user = meQuery.data;
    // Only use localStorage as fallback during initial loading.
    // Once the API has responded, trust the API result exclusively.
    if (!user && meQuery.isLoading) {
      try {
        const stored = localStorage.getItem('user-info');
        if (stored) {
          user = JSON.parse(stored);
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Only cache valid user data
    if (user) {
      localStorage.setItem("user-info", JSON.stringify(user));
    } else if (!meQuery.isLoading) {
      // API responded with no user — clear stale cache
      localStorage.removeItem("user-info");
    }

    return {
      user: user ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(user),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    // Session expired or user not authenticated — clean up and redirect
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user-info");
    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
