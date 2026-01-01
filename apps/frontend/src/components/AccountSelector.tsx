import type { ThreadsAccount } from "@/context/AccountContext";
import React from "react";
import { useAccountContext } from "../hooks";
import { Button } from "./ui/button";

interface AccountSelectorProps {
  multiSelect?: boolean;
  className?: string;
  disabled?: boolean;
  onSelect?: (accountId: string | string[]) => void;
}

export const AccountSelector: React.FC<AccountSelectorProps> = ({
  multiSelect = false,
  className = "",
  disabled = false,
  onSelect,
}) => {
  const { accounts, selectedAccountId, setSelectedAccount } =
    useAccountContext();

  const isSelected = (id: string) => {
    return selectedAccountId === id;
  };

  const handleSelect = (id: string) => {
    setSelectedAccount(id);
    onSelect?.(id);
  };

  if (accounts.length === 0) {
    return (
      <div className={`text-sm text-gray-500 ${className}`}>
        No accounts connected
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="text-sm font-medium">
        {multiSelect ? "Select Accounts" : "Select Account"}
      </label>
      <div className="flex flex-wrap gap-2">
        {accounts.map((account: ThreadsAccount) => (
          <Button
            key={account.id}
            variant={isSelected(account.id) ? "default" : "outline"}
            size="sm"
            onClick={() => handleSelect(account.id)}
            disabled={disabled}
            className="text-xs"
          >
            {account.accountName}
            {account.isDefault && " ✓"}
          </Button>
        ))}
      </div>
    </div>
  );
};
