import { Canvas } from "@react-three/fiber";
import { OrbitControls, Center, ContactShadows } from "@react-three/drei";
import { Suspense, useEffect, useRef, useState, Component, type ReactNode } from "react";
import { Loader2, Download, AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Local error boundary specifically for the 3D Canvas.
 * Prevents Canvas crashes (WebGL context lost, HDR load failures, etc.)
 * from taking down the entire page.
 */
interface CanvasErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface CanvasErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class CanvasErrorBoundary extends Component<CanvasErrorBoundaryProps, CanvasErrorBoundaryState> {
  constructor(props: CanvasErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): CanvasErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-8">
            <AlertCircle className="w-10 h-10 text-destructive/60" />
            <p className="text-sm text-muted-foreground text-center">
              3D viewer encountered an error.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-transparent"
              onClick={() => {
                this.setState({ hasError: false, error: null });
              }}
            >
              <RotateCcw className="w-4 h-4" />
              Retry
            </Button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

/**
 * Check if a loaded GLTF scene has any textures/images.
 * Used to decide whether to apply a default attractive material.
 */
function sceneHasTextures(scene: THREE.Group): boolean {
  let hasTexture = false;
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        // Check MeshStandardMaterial and MeshPhysicalMaterial (PBR models)
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          if (mat.map || mat.emissiveMap || mat.normalMap) {
            hasTexture = true;
          }
        }
        // Check MeshBasicMaterial (used by KHR_materials_unlit extension for photo textures)
        if (mat instanceof THREE.MeshBasicMaterial) {
          if (mat.map) {
            hasTexture = true;
          }
        }
      }
    }
  });
  return hasTexture;
}

/**
 * Apply an attractive default material to untextured models.
 * Uses a smooth clay/ceramic look with subtle color variation.
 */
function applyDefaultMaterial(scene: THREE.Group) {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.65, 0.62, 0.58), // Warm clay tone
    metalness: 0.05,
    roughness: 0.55,
    clearcoat: 0.3,
    clearcoatRoughness: 0.4,
    side: THREE.DoubleSide,
    envMapIntensity: 0.8,
  });

  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = material;
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function Model({ url }: { url: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        const group = groupRef.current;
        if (!group) return;

        // Clear previous children
        while (group.children.length > 0) {
          group.remove(group.children[0]);
        }

        const model = gltf.scene;
        group.add(model);

        // Auto-scale the model to fit the viewport
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
          const scale = 2 / maxDim;
          model.scale.setScalar(scale);

          // Recalculate bounding box after scaling
          const scaledBox = new THREE.Box3().setFromObject(model);
          const center = scaledBox.getCenter(new THREE.Vector3());
          model.position.sub(center);
        }

        // Check if model has native textures
        const hasTextures = sceneHasTextures(model);

        if (hasTextures) {
          // Model has textures - ensure they render correctly
          model.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                mat.side = THREE.DoubleSide;
                if (mat.map) {
                  mat.map.colorSpace = THREE.SRGBColorSpace;
                  mat.map.needsUpdate = true;
                }
                mat.needsUpdate = true;
              });
            }
          });
        } else {
          // No textures - apply attractive default material
          applyDefaultMaterial(model);
        }

        setLoaded(true);
      },
      undefined,
      (error) => {
        console.error("Failed to load GLB model:", error);
      }
    );

    return () => {
      setLoaded(false);
    };
  }, [url]);

  return <group ref={groupRef} />;
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#8B5CF6" wireframe />
    </mesh>
  );
}

/**
 * A simple hemisphere + directional light setup that doesn't require
 * any external HDR files. Works reliably on all devices including mobile.
 */
function SceneLighting() {
  return (
    <>
      {/* Hemisphere light for ambient fill - sky blue from above, ground color from below */}
      <hemisphereLight
        args={["#b1c5ff", "#3d2b1f", 0.6]}
      />
      {/* Key light */}
      <directionalLight
        position={[5, 8, 5]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      {/* Fill light */}
      <directionalLight position={[-5, 5, -3]} intensity={0.6} />
      {/* Back/rim light */}
      <directionalLight position={[0, -3, 5]} intensity={0.3} />
      {/* Accent light for visual interest */}
      <pointLight position={[-3, 2, -5]} intensity={0.5} color="#a78bfa" />
    </>
  );
}

interface ModelViewerProps {
  modelUrl: string;
  onDownload?: () => void;
  className?: string;
}

export default function ModelViewer({ modelUrl, onDownload, className = "" }: ModelViewerProps) {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className={`relative rounded-xl overflow-hidden ${className}`}>
      {/* Dot grid background */}
      <div className="absolute inset-0 dot-grid opacity-30" />

      {/* 3D Canvas */}
      <div className="relative w-full h-full min-h-[400px]">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <span className="text-sm text-muted-foreground font-mono">Loading model...</span>
            </div>
          </div>
        )}

        <CanvasErrorBoundary>
          <Canvas
            camera={{ position: [3, 2, 5], fov: 45 }}
            onCreated={({ gl }) => {
              gl.outputColorSpace = THREE.SRGBColorSpace;
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.2;
              setIsLoading(false);
            }}
            gl={{
              antialias: true,
              // Improve mobile compatibility
              powerPreference: "default",
              failIfMajorPerformanceCaveat: false,
            }}
            style={{ background: "transparent" }}
          >
            {/* Pure code-based lighting - no external HDR files needed */}
            <SceneLighting />

            <Suspense fallback={<LoadingFallback />}>
              <Center>
                <Model url={modelUrl} />
              </Center>
              <ContactShadows
                position={[0, -1.5, 0]}
                opacity={0.4}
                scale={10}
                blur={2}
                far={4}
                color="#8B5CF6"
              />
            </Suspense>

            <OrbitControls
              enablePan
              enableZoom
              enableRotate
              autoRotate
              autoRotateSpeed={1}
              minDistance={1}
              maxDistance={20}
            />
          </Canvas>
        </CanvasErrorBoundary>
      </div>

      {/* Controls overlay */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono glass-panel px-3 py-1.5 rounded-full">
            Drag to rotate &middot; Scroll to zoom
          </span>
        </div>
        {onDownload && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onDownload}
            className="gap-2 glass-panel"
          >
            <Download className="w-4 h-4" />
            Download GLB
          </Button>
        )}
      </div>

      {/* Radial glow behind model */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-primary/10 blur-[100px]" />
      </div>
    </div>
  );
}
