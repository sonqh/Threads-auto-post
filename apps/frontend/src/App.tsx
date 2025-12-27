import { ExcelImporter } from "./components/ExcelImporter";
import { JobMonitoring } from "./components/JobMonitoring";
import { PostsList } from "./components/PostsList";
import { SchedulerDebug } from "./components/SchedulerDebug";
import { FileText } from "lucide-react";

function App() {
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
        <ExcelImporter />
        <PostsList />
        <JobMonitoring />
      </main>

      {/* Debug Panel */}
      {/* <SchedulerDebug /> */}
    </div>
  );
}

export default App;
