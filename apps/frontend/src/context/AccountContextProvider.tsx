import React, { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import {
  AccountContext,
  type AccountContextState,
  type ThreadsAccount,
  type UseAccountContextReturn,
} from "./AccountContext";

const initialState: AccountContextState = {
  accounts: [],
  loading: false,
  error: null,
  selectedAccountId: null,
  isInitialized: false,
};

/**
 * Account context provider component
 */
export function AccountContextProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountContextState>(initialState);
  const isMountedRef = React.useRef(false);

  const fetchAccounts = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await api.get("/credentials");
      const accounts = response.data || [];
      const defaultAccount = accounts.find((a: ThreadsAccount) => a.isDefault);

      setState((prev) => ({
        ...prev,
        accounts,
        selectedAccountId: defaultAccount?.id || accounts[0]?.id || null,
        isInitialized: true,
      }));
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch accounts";
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isInitialized: true,
      }));
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  const getAccountById = useCallback(
    (id: string): ThreadsAccount | undefined => {
      return state.accounts.find((a) => a.id === id);
    },
    [state.accounts]
  );

  const getDefaultAccount = useCallback((): ThreadsAccount | undefined => {
    return state.accounts.find((a) => a.isDefault);
  }, [state.accounts]);

  const setSelectedAccount = useCallback((id: string | null): void => {
    setState((prev) => ({
      ...prev,
      selectedAccountId: id,
      error: null,
    }));
  }, []);

  const addAccount = useCallback((credential: ThreadsAccount): void => {
    setState((prev) => ({
      ...prev,
      accounts: [...prev.accounts, credential],
      selectedAccountId: credential.id,
      error: null,
    }));
  }, []);

  const removeAccount = useCallback(async (id: string): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await api.delete(`/credentials/${id}`);

      setState((prev) => {
        const filtered = prev.accounts.filter((a) => a.id !== id);
        const newSelectedId =
          prev.selectedAccountId === id
            ? filtered[0]?.id || null
            : prev.selectedAccountId;

        return {
          ...prev,
          accounts: filtered,
          selectedAccountId: newSelectedId,
        };
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to remove account";
      setState((prev) => ({ ...prev, error: errorMessage }));
      throw err;
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  const setDefaultAccount = useCallback(async (id: string): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await api.patch(`/credentials/${id}/default`);

      setState((prev) => ({
        ...prev,
        accounts: prev.accounts.map((a) => ({
          ...a,
          isDefault: a.id === id,
        })),
      }));
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to set default account";
      setState((prev) => ({ ...prev, error: errorMessage }));
      throw err;
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  const clearError = useCallback((): void => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const reset = useCallback((): void => {
    setState(initialState);
  }, []);

  // Auto-fetch accounts on first mount
  useEffect(() => {
    if (!isMountedRef.current && !state.isInitialized) {
      isMountedRef.current = true;
      fetchAccounts();
    }
  }, [state.isInitialized, fetchAccounts]);

  const value: UseAccountContextReturn = {
    // State
    ...state,
    // Query actions
    fetchAccounts,
    getAccountById,
    getDefaultAccount,
    // Mutation actions
    setSelectedAccount,
    addAccount,
    removeAccount,
    setDefaultAccount,
    clearError,
    reset,
  };

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}
