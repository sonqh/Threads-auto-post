import { useContext } from "react";
import {
  AccountContext,
  type UseAccountContextReturn,
} from "../context/AccountContext";

/**
 * Hook to use the account context
 * Must be used within AccountContextProvider
 */
export function useAccountContext(): UseAccountContextReturn {
  const context = useContext(AccountContext);

  if (context === undefined) {
    throw new Error(
      "useAccountContext must be used within an AccountContextProvider"
    );
  }

  return context;
}
