import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF, Center, ContactShadows } from "@react-three/drei";
import { Suspense, useEffect, useRef, useState } from "react";
import { Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as THREE from "three";

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const ref = useRef<THREE.Group>(null);

  useEffect(() => {
    if (ref.current) {
      // Auto-scale the model to fit the viewport
      const box = new THREE.Box3().setFromObject(ref.current);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2 / maxDim;
      ref.current.scale.setScalar(scale);

      // Center the model
      const center = box.getCenter(new THREE.Vector3());
      ref.current.position.sub(center.multiplyScalar(scale));

      // Ensure textures render correctly
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Enable double-sided rendering for all meshes
          if (child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((mat) => {
              mat.side = THREE.DoubleSide;
              // If the model has a texture, ensure it's properly configured
              if (mat.map) {
                mat.map.colorSpace = THREE.SRGBColorSpace;
                mat.map.needsUpdate = true;
              }
              mat.needsUpdate = true;
            });
          }
        }
      });
    }
  }, [scene]);

  return (
    <group ref={ref}>
      <primitive object={scene} />
    </group>
  );
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#8B5CF6" wireframe />
    </mesh>
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

        <Canvas
          camera={{ position: [3, 2, 5], fov: 45 }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.2;
            setIsLoading(false);
          }}
          gl={{ antialias: true }}
          style={{ background: "transparent" }}
        >
          {/* Lighting setup optimized for textured models */}
          <ambientLight intensity={0.6} />
          <directionalLight
            position={[5, 8, 5]}
            intensity={1.2}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight position={[-5, 5, -3]} intensity={0.5} />
          <directionalLight position={[0, -3, 5]} intensity={0.2} />
          {/* Subtle rim light for depth */}
          <pointLight position={[-3, 2, -5]} intensity={0.4} color="#a78bfa" />

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
            <Environment preset="studio" environmentIntensity={0.4} />
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
