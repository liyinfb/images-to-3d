import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import Navbar from "@/components/Navbar";
import ImageUploader from "@/components/ImageUploader";
import ModelViewer from "@/components/ModelViewer";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Box, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

type ReconstructionState = "idle" | "uploading" | "processing" | "completed" | "failed";

export default function Reconstruct() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [state, setState] = useState<ReconstructionState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const createMutation = trpc.reconstruction.create.useMutation();

  // Poll for job status
  const statusQuery = trpc.reconstruction.status.useQuery(
    { jobId: jobId! },
    {
      enabled: jobId !== null && state === "processing",
      refetchInterval: 3000,
    }
  );

  // Watch status changes
  useEffect(() => {
    if (!statusQuery.data) return;

    const job = statusQuery.data;
    setProgress(job.progress);

    if (job.status === "completed" && job.modelUrl) {
      setState("completed");
      setModelUrl(job.modelUrl);
    } else if (job.status === "failed") {
      setState("failed");
      setErrorMessage(job.errorMessage || "Reconstruction failed");
    }
  }, [statusQuery.data]);

  const handleImageSelected = useCallback((file: File, preview: string) => {
    setSelectedFile(file);
    setPreviewUrl(preview);
    setState("idle");
    setErrorMessage(null);
    setModelUrl(null);
    setJobId(null);
    setProgress(0);
  }, []);

  const handleStartReconstruction = useCallback(async () => {
    if (!selectedFile || !previewUrl) return;

    try {
      setState("uploading");
      setProgress(0);
      setErrorMessage(null);

      // Convert to base64 (strip the data:image/...;base64, prefix)
      const base64 = previewUrl.split(",")[1];

      setState("processing");
      const result = await createMutation.mutateAsync({
        imageBase64: base64,
        filename: selectedFile.name,
      });

      setJobId(result.jobId);
      setProgress(5);
    } catch (error) {
      setState("failed");
      setErrorMessage(error instanceof Error ? error.message : "Failed to start reconstruction");
    }
  }, [selectedFile, previewUrl, createMutation]);

  const handleReset = () => {
    setState("idle");
    setSelectedFile(null);
    setPreviewUrl(null);
    setJobId(null);
    setErrorMessage(null);
    setModelUrl(null);
    setProgress(0);
  };

  const handleDownload = () => {
    if (modelUrl) {
      const a = document.createElement("a");
      a.href = modelUrl;
      a.download = `model_${jobId}.glb`;
      a.click();
    }
  };

  // Redirect if not authenticated
  if (!authLoading && !isAuthenticated) {
    window.location.href = getLoginUrl();
    return null;
  }

  const isProcessing = state === "uploading" || state === "processing";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-16">
        <div className="container max-w-6xl mx-auto px-4">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="font-display text-3xl sm:text-4xl font-bold mb-2">
              3D Reconstruction
            </h1>
            <p className="text-muted-foreground text-lg">
              Upload a photo and our AI will generate a 3D model from it.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Panel: Upload & Controls */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-6"
            >
              {/* Image Upload */}
              <div className="glass-panel rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-semibold text-lg">Source Image</h2>
                  {selectedFile && state === "idle" && (
                    <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
                      Clear
                    </Button>
                  )}
                </div>
                <ImageUploader
                  onImageSelected={handleImageSelected}
                  disabled={isProcessing}
                />
              </div>

              {/* Reconstruct Button */}
              <AnimatePresence mode="wait">
                {selectedFile && state === "idle" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <Button
                      size="lg"
                      className="w-full gap-2 glow-violet text-base"
                      onClick={handleStartReconstruction}
                    >
                      <Box className="w-5 h-5" />
                      Generate 3D Model
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Progress */}
              <AnimatePresence mode="wait">
                {isProcessing && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="glass-panel rounded-xl p-6 space-y-4"
                  >
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      <div>
                        <p className="font-medium text-sm">
                          {state === "uploading" ? "Uploading image..." : "Generating 3D model..."}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          This may take 1-3 minutes depending on complexity
                        </p>
                      </div>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-muted-foreground font-mono text-right">
                      {progress}%
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Error */}
              <AnimatePresence mode="wait">
                {state === "failed" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="glass-panel rounded-xl p-6 border-destructive/30 space-y-4"
                  >
                    <div className="flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-destructive" />
                      <div>
                        <p className="font-medium text-sm text-destructive">Reconstruction Failed</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{errorMessage}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleReset} className="bg-transparent">
                      Try Again
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Success */}
              <AnimatePresence mode="wait">
                {state === "completed" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="glass-panel rounded-xl p-6 space-y-4"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <div>
                        <p className="font-medium text-sm">3D Model Ready!</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Your model has been generated successfully.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleDownload} className="gap-2">
                        Download GLB
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleReset} className="bg-transparent">
                        New Reconstruction
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Tips */}
              {state === "idle" && !selectedFile && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="glass-panel rounded-xl p-6 space-y-3"
                >
                  <h3 className="font-display font-semibold text-sm">Tips for best results</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      Use images with a single, clear object as the subject
                    </li>
                    <li className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      Good lighting and contrast improve reconstruction quality
                    </li>
                    <li className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      Avoid images with heavy occlusion or transparent objects
                    </li>
                    <li className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      Higher resolution images generally produce better models
                    </li>
                  </ul>
                </motion.div>
              )}
            </motion.div>

            {/* Right Panel: 3D Viewer */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="glass-panel rounded-xl overflow-hidden sticky top-24">
                <div className="p-4 border-b border-border/30">
                  <h2 className="font-display font-semibold text-lg">3D Preview</h2>
                </div>
                <div className="aspect-square relative bg-background/50">
                  {modelUrl ? (
                    <ModelViewer
                      modelUrl={modelUrl}
                      onDownload={handleDownload}
                      className="w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-4 dot-grid">
                      <div className="w-20 h-20 rounded-2xl bg-primary/5 flex items-center justify-center">
                        <Box className="w-10 h-10 text-primary/30" />
                      </div>
                      <p className="text-sm text-muted-foreground text-center max-w-[200px]">
                        {isProcessing
                          ? "Generating your 3D model..."
                          : "Your 3D model will appear here"}
                      </p>
                      {isProcessing && (
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
