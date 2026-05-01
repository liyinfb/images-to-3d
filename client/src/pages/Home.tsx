import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import { ArrowRight, Box, Sparkles, Zap, Download, RotateCcw, Images } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "wouter";

const HERO_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663309829659/FQYEWqKe6qNPtaH9TGijJ5/hero-bg-GXTAT8DiBePcgrQDSjVkJU.webp";
const PROCESS_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663309829659/FQYEWqKe6qNPtaH9TGijJ5/process-illustration-fdKLoXf82axPq4sv3pewEE.webp";

const features = [
  {
    icon: Sparkles,
    title: "AI-Powered",
    description: "Powered by TRELLIS, a state-of-the-art 3D reconstruction model from Microsoft Research.",
  },
  {
    icon: Images,
    title: "Multi-View Support",
    description: "Upload multiple photos from different angles for significantly better 3D reconstruction quality.",
  },
  {
    icon: Zap,
    title: "Fast Generation",
    description: "Transform any 2D photograph into a detailed 3D model in minutes, not hours.",
  },
  {
    icon: Download,
    title: "GLB Export",
    description: "Download your 3D models in GLB format, ready for use in any 3D application.",
  },
  {
    icon: RotateCcw,
    title: "Interactive Preview",
    description: "Inspect your 3D models from every angle with our built-in interactive viewer.",
  },
];

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        {/* Background image with overlay */}
        <div className="absolute inset-0">
          <img
            src={HERO_BG}
            alt=""
            className="w-full h-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        </div>

        {/* Dot grid overlay */}
        <div className="absolute inset-0 dot-grid opacity-20" />

        {/* Content */}
        <div className="relative container text-center max-w-4xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-8"
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel text-sm text-muted-foreground"
            >
              <Sparkles className="w-4 h-4 text-primary" />
              Powered by TRELLIS AI
            </motion.div>

            {/* Heading */}
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
              Turn Photos into{" "}
              <span className="text-gradient-violet">3D Models</span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Upload one or multiple photographs and watch as AI reconstructs a detailed,
              interactive 3D model you can explore from every angle.
            </p>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              {isAuthenticated ? (
                <Link href="/reconstruct">
                  <Button size="lg" className="gap-2 glow-violet text-base px-8">
                    Start Reconstructing
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
              ) : (
                <Button
                  size="lg"
                  className="gap-2 glow-violet text-base px-8"
                  onClick={() => { window.location.href = getLoginUrl(); }}
                >
                  Get Started
                  <ArrowRight className="w-5 h-5" />
                </Button>
              )}
              <a href="#how-it-works">
                <Button variant="outline" size="lg" className="text-base px-8 bg-transparent">
                  How It Works
                </Button>
              </a>
            </motion.div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <div className="w-6 h-10 rounded-full border-2 border-muted-foreground/30 flex justify-center pt-2">
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="w-1.5 h-1.5 rounded-full bg-primary"
            />
          </div>
        </motion.div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 relative">
        <div className="container max-w-6xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4">
              How It Works
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Our AI pipeline transforms your 2D photographs into detailed 3D models
              through an automated reconstruction process.
            </p>
          </motion.div>

          {/* Process illustration */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="rounded-2xl overflow-hidden glass-panel p-2 mb-16"
          >
            <img
              src={PROCESS_IMG}
              alt="3D Reconstruction Pipeline: 2D Photo → Wireframe Mesh → 3D Model"
              className="w-full rounded-xl"
            />
          </motion.div>

          {/* Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Upload", desc: "Drop one or more photographs of an object — multiple angles produce better results." },
              { step: "02", title: "Reconstruct", desc: "Our AI analyzes the image and generates a full 3D mesh with textures automatically." },
              { step: "03", title: "Explore & Download", desc: "View your 3D model interactively and download it in GLB format for any use." },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                className="glass-panel rounded-xl p-6 space-y-4"
              >
                <span className="font-mono text-primary text-sm font-medium">{item.step}</span>
                <h3 className="font-display text-xl font-semibold">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 relative">
        <div className="container max-w-6xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl sm:text-4xl font-bold mb-4">
              Features
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Everything you need to transform images into 3D models.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="glass-panel rounded-xl p-6 space-y-4 group hover:glow-violet-sm transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-display text-lg font-semibold">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative">
        <div className="container max-w-3xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="glass-panel rounded-2xl p-12 space-y-6 glow-violet-sm"
          >
            <Box className="w-12 h-12 text-primary mx-auto" />
            <h2 className="font-display text-3xl font-bold">
              Ready to create your first 3D model?
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Sign in and start transforming your photographs into interactive 3D models in minutes.
            </p>
            {isAuthenticated ? (
              <Link href="/reconstruct">
                <Button size="lg" className="gap-2 glow-violet">
                  Start Reconstructing
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
            ) : (
              <Button
                size="lg"
                className="gap-2 glow-violet"
                onClick={() => { window.location.href = getLoginUrl(); }}
              >
                Get Started Free
                <ArrowRight className="w-5 h-5" />
              </Button>
            )}
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8">
        <div className="container flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-primary" />
            <span className="font-display font-medium">3D Reconstructor</span>
          </div>
          <span className="font-mono text-xs">Powered by TRELLIS AI</span>
        </div>
      </footer>
    </div>
  );
}
