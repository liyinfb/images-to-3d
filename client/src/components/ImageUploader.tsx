import { useState, useCallback, useRef } from "react";
import { Upload, Image as ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface ImageUploaderProps {
  onImageSelected: (file: File, preview: string) => void;
  disabled?: boolean;
}

export default function ImageUploader({ onImageSelected, disabled }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 20 * 1024 * 1024) {
      alert("Image must be under 20MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);
      setSelectedFile(file);
      onImageSelected(file, dataUrl);
    };
    reader.readAsDataURL(file);
  }, [onImageSelected]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [disabled, handleFile]);

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const clearImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreview(null);
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div
      className={`relative rounded-xl border-2 border-dashed transition-all duration-300 overflow-hidden ${
        isDragging
          ? "border-primary bg-primary/5 glow-violet"
          : preview
          ? "border-border bg-card"
          : "border-border/50 hover:border-border hover:bg-card/50"
      } ${disabled ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />

      <AnimatePresence mode="wait">
        {preview ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative aspect-video flex items-center justify-center p-4"
          >
            <img
              src={preview}
              alt="Selected image"
              className="max-h-full max-w-full object-contain rounded-lg"
            />
            {!disabled && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-3 right-3 w-8 h-8 glass-panel"
                onClick={clearImage}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
            {selectedFile && (
              <div className="absolute bottom-3 left-3 glass-panel rounded-full px-3 py-1.5">
                <span className="text-xs font-mono text-muted-foreground">
                  {selectedFile.name} &middot; {(selectedFile.size / 1024 / 1024).toFixed(1)}MB
                </span>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-16 px-8 gap-4"
          >
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-foreground font-medium">
                Drop your image here
              </p>
              <p className="text-sm text-muted-foreground">
                or click to browse &middot; PNG, JPG, WebP up to 20MB
              </p>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ImageIcon className="w-3.5 h-3.5" />
                Single object works best
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
