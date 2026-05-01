import { useState, useCallback, useRef } from "react";
import { Upload, Image as ImageIcon, X, Plus, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface ImageFile {
  file: File;
  preview: string;
}

interface ImageUploaderProps {
  onImagesSelected: (images: ImageFile[]) => void;
  disabled?: boolean;
  maxImages?: number;
}

export default function ImageUploader({ onImagesSelected, disabled, maxImages = 8 }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [images, setImages] = useState<ImageFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.type.startsWith("image/"));
    
    if (fileArray.length === 0) return;

    // Check size limit
    for (const file of fileArray) {
      if (file.size > 20 * 1024 * 1024) {
        alert("Each image must be under 20MB");
        return;
      }
    }

    // Read all files
    const promises = fileArray.map(file => new Promise<ImageFile>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({ file, preview: e.target?.result as string });
      };
      reader.readAsDataURL(file);
    }));

    Promise.all(promises).then((newImages) => {
      setImages(prev => {
        const combined = [...prev, ...newImages].slice(0, maxImages);
        onImagesSelected(combined);
        return combined;
      });
    });
  }, [onImagesSelected, maxImages]);

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

    handleFiles(e.dataTransfer.files);
  }, [disabled, handleFiles]);

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    // Reset input so same file can be selected again
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeImage = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setImages(prev => {
      const updated = prev.filter((_, i) => i !== index);
      onImagesSelected(updated);
      return updated;
    });
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setImages([]);
    onImagesSelected([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div
      className={`relative rounded-xl border-2 border-dashed transition-all duration-300 overflow-hidden ${
        isDragging
          ? "border-primary bg-primary/5 glow-violet"
          : images.length > 0
          ? "border-border bg-card"
          : "border-border/50 hover:border-border hover:bg-card/50"
      } ${disabled ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={images.length === 0 ? handleClick : undefined}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
        multiple
      />

      <AnimatePresence mode="wait">
        {images.length > 0 ? (
          <motion.div
            key="gallery"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="p-4 space-y-3"
          >
            {/* Gallery header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Images className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">
                  {images.length} image{images.length > 1 ? "s" : ""} selected
                </span>
                {images.length > 1 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono">
                    Multi-view
                  </span>
                )}
              </div>
              {!disabled && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground h-7 text-xs"
                  onClick={clearAll}
                >
                  Clear all
                </Button>
              )}
            </div>

            {/* Image grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {images.map((img, index) => (
                <motion.div
                  key={`${img.file.name}-${index}`}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="relative aspect-square rounded-lg overflow-hidden border border-border/50 group"
                >
                  <img
                    src={img.preview}
                    alt={`Image ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {!disabled && (
                    <button
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => removeImage(index, e)}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {index === 0 && (
                    <div className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/80 text-white font-medium">
                      Primary
                    </div>
                  )}
                </motion.div>
              ))}

              {/* Add more button */}
              {images.length < maxImages && !disabled && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="aspect-square rounded-lg border-2 border-dashed border-border/50 hover:border-primary/50 hover:bg-primary/5 flex flex-col items-center justify-center gap-1 transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    inputRef.current?.click();
                  }}
                >
                  <Plus className="w-5 h-5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">Add more</span>
                </motion.button>
              )}
            </div>

            {/* Info text */}
            <p className="text-xs text-muted-foreground text-center">
              {images.length === 1
                ? "Add more images from different angles for better 3D reconstruction"
                : `${images.length}/${maxImages} images • Multi-view mode uses TRELLIS for higher quality`}
            </p>
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
                Drop your images here
              </p>
              <p className="text-sm text-muted-foreground">
                or click to browse &middot; PNG, JPG, WebP up to 20MB each
              </p>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ImageIcon className="w-3.5 h-3.5" />
                Single image or multiple views
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Images className="w-3.5 h-3.5" />
                Up to {maxImages} images
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export type { ImageFile };
