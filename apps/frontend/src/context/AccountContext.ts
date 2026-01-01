import { createContext } from "react";

/**
 * Represents a Threads account credential
 */
export type ThreadsAccount = {
  id: string;
  accountName: string;
  threadsUserId: string;
  threadsUserName?: string;
  isDefault: boolean;
  status: string;
  createdAt: string;
  expiresAt?: string;
  accessToken?: string; // Not exposed by API, only for internal use
};

/**
 * Account context state interface
 */
export type AccountContextState = {
  accounts: ThreadsAccount[];
  loading: boolean;
  error: string | null;
  selectedAccountId: string | null;
  isInitialized: boolean;
};

/**
 * Account context return type combines state and actions
 */
export type UseAccountContextReturn = AccountContextState & {
  // Query actions
  fetchAccounts: () => Promise<void>;
  getAccountById: (id: string) => ThreadsAccount | undefined;
  getDefaultAccount: () => ThreadsAccount | undefined;

  // Mutation actions
  setSelectedAccount: (id: string | null) => void;
  addAccount: (credential: ThreadsAccount) => void;
  removeAccount: (id: string) => Promise<void>;
  setDefaultAccount: (id: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
};

export const AccountContext = createContext<
  UseAccountContextReturn | undefined
>(undefined);
