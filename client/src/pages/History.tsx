import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import Navbar from "@/components/Navbar";
import ModelViewer from "@/components/ModelViewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Box, Clock, Download, Eye, Loader2, ArrowRight, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Link } from "wouter";

export default function History() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [viewingModelUrl, setViewingModelUrl] = useState<string | null>(null);
  const [viewingJobId, setViewingJobId] = useState<number | null>(null);

  const historyQuery = trpc.reconstruction.history.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (!authLoading && !isAuthenticated) {
    window.location.href = getLoginUrl();
    return null;
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return "—";
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">Completed</Badge>;
      case "processing":
        return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Processing</Badge>;
      case "failed":
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Failed</Badge>;
      default:
        return <Badge variant="outline" className="bg-muted text-muted-foreground">Pending</Badge>;
    }
  };

  const handleDownload = (url: string, jobId: number) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `model_${jobId}.glb`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-16">
        <div className="container max-w-6xl mx-auto px-4">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 flex items-center justify-between"
          >
            <div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold mb-2">
                History
              </h1>
              <p className="text-muted-foreground text-lg">
                Your past 3D reconstruction jobs.
              </p>
            </div>
            <Link href="/reconstruct">
              <Button className="gap-2">
                <Box className="w-4 h-4" />
                New Reconstruction
              </Button>
            </Link>
          </motion.div>

          {/* Model Viewer Modal */}
          <AnimatePresence>
            {viewingModelUrl && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
                onClick={() => { setViewingModelUrl(null); setViewingJobId(null); }}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="w-full max-w-3xl aspect-square glass-panel rounded-2xl overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-4 border-b border-border/30 flex items-center justify-between">
                    <h3 className="font-display font-semibold">3D Model Preview</h3>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleDownload(viewingModelUrl, viewingJobId!)}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setViewingModelUrl(null); setViewingJobId(null); }}
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                  <div className="h-[calc(100%-60px)]">
                    <ModelViewer modelUrl={viewingModelUrl} className="w-full h-full" />
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading */}
          {historyQuery.isLoading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}

          {/* Empty state */}
          {historyQuery.data && historyQuery.data.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel rounded-2xl p-16 text-center space-y-4"
            >
              <Box className="w-16 h-16 text-primary/30 mx-auto" />
              <h2 className="font-display text-xl font-semibold">No reconstructions yet</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Start by uploading a photo to generate your first 3D model.
              </p>
              <Link href="/reconstruct">
                <Button className="gap-2 mt-4">
                  Start Reconstructing
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </motion.div>
          )}

          {/* Job list */}
          {historyQuery.data && historyQuery.data.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {historyQuery.data.map((job, i) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-panel rounded-xl overflow-hidden group hover:glow-violet-sm transition-all duration-300"
                >
                  {/* Thumbnail / Preview */}
                  <div className="aspect-video relative bg-background/50 dot-grid flex items-center justify-center">
                    {job.sourceImageUrl ? (
                      <img
                        src={job.sourceImageUrl}
                        alt="Source"
                        className="w-full h-full object-cover opacity-80"
                      />
                    ) : (
                      <Box className="w-12 h-12 text-primary/20" />
                    )}
                    {job.status === "processing" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      </div>
                    )}
                    {job.status === "failed" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                        <AlertCircle className="w-8 h-8 text-destructive" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      {getStatusBadge(job.status)}
                      <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(job.processingTimeMs)}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {formatDate(job.createdAt)}
                    </p>

                    {job.status === "completed" && job.modelUrl && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="flex-1 gap-1"
                          onClick={() => { setViewingModelUrl(job.modelUrl!); setViewingJobId(job.id); }}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1 bg-transparent"
                          onClick={() => handleDownload(job.modelUrl!, job.id)}
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </Button>
                      </div>
                    )}

                    {job.status === "failed" && job.errorMessage && (
                      <p className="text-xs text-destructive/80 truncate" title={job.errorMessage}>
                        {job.errorMessage}
                      </p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
