import { useAccountContext } from "@/hooks";
import { CredentialsSetup } from "../components/CredentialsSetup";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { TrashIcon, CheckCircle, AlertCircle } from "lucide-react";

export const CredentialsPage = () => {
  const {
    accounts,
    loading,
    error,
    clearError,
    removeAccount,
    setDefaultAccount,
    fetchAccounts,
  } = useAccountContext();

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to remove this account?")) {
      return;
    }

    try {
      await removeAccount(id);
    } catch (err) {
      console.error("Failed to delete account:", err);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await setDefaultAccount(id);
    } catch (err) {
      console.error("Failed to set default account:", err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Threads Account Setup</h1>
        <p className="text-gray-600">
          Manage your Threads accounts and credentials for posting
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold text-red-900">Error</h3>
            <p className="text-red-700">{error}</p>
          </div>
          <button
            onClick={clearError}
            className="text-red-600 hover:text-red-700 font-semibold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Setup Form */}
      <div>
        <h2 className="text-xl font-bold mb-4">Add New Account</h2>
        <CredentialsSetup onSuccess={fetchAccounts} />
      </div>

      {/* Stored Credentials */}
      <div>
        <h2 className="text-xl font-bold mb-4">Connected Accounts</h2>

        {loading ? (
          <Card className="p-6 text-center text-gray-500">
            Loading accounts...
          </Card>
        ) : accounts.length === 0 ? (
          <Card className="p-6 text-center text-gray-500">
            <p>No accounts connected yet. Add one above to get started.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => (
              <Card
                key={account.id}
                className="p-4 flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{account.accountName}</h3>
                    {account.isDefault && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                        Default
                      </span>
                    )}
                    {account.status === "ACTIVE" ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-yellow-600" />
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Threads ID: {account.threadsUserId}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Connected {new Date(account.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex gap-2 ml-4">
                  {!account.isDefault && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetDefault(account.id)}
                    >
                      Set Default
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(account.id)}
                    disabled={loading}
                    className="text-red-600 hover:text-red-700"
                  >
                    {loading ? (
                      <span>Removing...</span>
                    ) : (
                      <TrashIcon className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Help Section */}
      <Card className="p-6 bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-3">
          How to get your credentials
        </h3>
        <ol className="space-y-2 text-sm text-blue-800 list-decimal list-inside">
          <li>Go to your Threads Business Account</li>
          <li>Navigate to Settings → Apps and Accounts</li>
          <li>Find or create your application integration</li>
          <li>
            Generate or copy your:
            <ul className="ml-6 mt-1 space-y-1">
              <li>- Threads User ID (numeric ID)</li>
              <li>- Access Token (long alphanumeric string)</li>
              <li>- Refresh Token (optional but recommended)</li>
            </ul>
          </li>
          <li>Paste them above in the "Add New Account" form</li>
          <li>Click "Connect Account" to save</li>
        </ol>
      </Card>

      {/* Next Steps */}
      {accounts.length > 0 && (
        <Card className="p-6 bg-green-50 border-green-200">
          <h3 className="font-semibold text-green-900 mb-2">
            ✓ Ready to schedule posts!
          </h3>
          <p className="text-sm text-green-800 mb-3">
            Your account is connected. You can now:
          </p>
          <ul className="space-y-2 text-sm text-green-800 list-disc list-inside">
            <li>Create new posts in the Posts section</li>
            <li>Schedule posts for later or set them to repeat</li>
            <li>Publish to multiple accounts simultaneously</li>
            <li>Track published posts and their engagement</li>
          </ul>
        </Card>
      )}
    </div>
  );
};
