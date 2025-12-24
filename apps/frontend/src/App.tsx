import { useState } from 'react';
import { ExcelImporter } from './components/ExcelImporter';
import { PostsList } from './components/PostsList';
import { FileText } from 'lucide-react';

function App() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Threads Post Scheduler
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and schedule your Threads posts
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        <ExcelImporter onImportComplete={() => setRefreshKey((k) => k + 1)} />
        <PostsList refresh={refreshKey} />
      </main>
    </div>
  );
}

export default App;
