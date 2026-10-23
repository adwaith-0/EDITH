import { motion } from 'framer-motion';
import Image from 'next/image';
import { useState, useEffect } from 'react';

interface SplashScreenProps {
    onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
    // Generate particles on client-side only to avoid hydration mismatch
    const [particles, setParticles] = useState<Array<{ left: string; top: string; delay: number; duration: number }>>([]);

    useEffect(() => {
        // Generate particle positions only on client
        const generatedParticles = [...Array(20)].map(() => ({
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            delay: Math.random() * 2,
            duration: 3 + Math.random() * 2,
        }));
        setParticles(generatedParticles);
    }, []);

    return (
        <motion.div
            className="fixed inset-0 z-[9999] bg-black flex items-center justify-center overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            onAnimationComplete={(definition) => {
                if (definition === "exit") {
                    onComplete();
                }
            }}
        >
            {/* Premium Background Gradient */}
            <div className="absolute inset-0 bg-neutral-950">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,212,255,0.08)_0%,transparent_60%)]" />
            </div>

            {/* Cinematic Background with Electric Energy Lines */}
            <motion.div
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.5 }}
            >
                {/* Subtle Electric Energy Lines */}
                <svg className="absolute inset-0 w-full h-full opacity-30">
                    <defs>
                        <linearGradient id="energyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#00d4ff" />
                            <stop offset="50%" stopColor="#00ffaa" />
                            <stop offset="100%" stopColor="#0099ff" />
                        </linearGradient>
                    </defs>

                    {/* Animated Energy Lines */}
                    <motion.path
                        d="M 0 50 Q 400 100, 800 50 T 1600 50"
                        stroke="url(#energyGradient)"
                        strokeWidth="2"
                        fill="none"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: [0, 0.6, 0] }}
                        transition={{ duration: 3, delay: 0.5, ease: "easeInOut" }}
                    />
                    <motion.path
                        d="M 0 200 Q 600 150, 1200 200 T 2400 200"
                        stroke="url(#energyGradient)"
                        strokeWidth="1.5"
                        fill="none"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: [0, 0.4, 0] }}
                        transition={{ duration: 3.5, delay: 0.8, ease: "easeInOut" }}
                    />
                    <motion.path
                        d="M 0 400 Q 500 350, 1000 400 T 2000 400"
                        stroke="url(#energyGradient)"
                        strokeWidth="1"
                        fill="none"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: [0, 0.3, 0] }}
                        transition={{ duration: 4, delay: 1, ease: "easeInOut" }}
                    />
                </svg>

                {/* Metallic Light Sweep */}
                <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
                    initial={{ x: '-100%' }}
                    animate={{ x: '200%' }}
                    transition={{ duration: 2.5, delay: 1, ease: "easeInOut" }}
                />
            </motion.div>

            {/* Main Animated Text Container */}
            <motion.div
                className="relative z-10 flex flex-col items-center justify-center gap-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 0.8 }}
            >
                {/* TORQ Text - Letter by Letter Animation */}
                <div className="flex items-center gap-2">
                    {['T', 'O', 'R', 'Q'].map((letter, index) => (
                        <motion.div
                            key={letter}
                            className="relative"
                            initial={{ opacity: 0, y: 50, rotateX: -90 }}
                            animate={{ opacity: 1, y: 0, rotateX: 0 }}
                            transition={{
                                duration: 0.8,
                                delay: 1.2 + index * 0.15,
                                ease: [0.25, 0.1, 0.25, 1]
                            }}
                        >
                            {/* Metallic Chrome Text */}
                            <div className="relative">
                                {/* Glow Layer */}
                                <div className="absolute inset-0 blur-xl opacity-60">
                                    <span className="text-[120px] md:text-[180px] font-black text-cyan-400">
                                        {letter}
                                    </span>
                                </div>

                                {/* Main Chrome Text */}
                                <span
                                    className="relative text-[120px] md:text-[180px] font-black tracking-wider"
                                    style={{
                                        background: 'linear-gradient(180deg, #ffffff 0%, #c0c0c0 50%, #808080 100%)',
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        backgroundClip: 'text',
                                        filter: 'drop-shadow(0 4px 20px rgba(0, 212, 255, 0.4))',
                                    }}
                                >
                                    {letter}
                                </span>

                                {/* Rim Light Effect */}
                                <motion.div
                                    className="absolute inset-0 opacity-0"
                                    animate={{ opacity: [0, 0.6, 0] }}
                                    transition={{
                                        duration: 2,
                                        delay: 2 + index * 0.15,
                                        ease: "easeInOut"
                                    }}
                                >
                                    <span
                                        className="text-[120px] md:text-[180px] font-black tracking-wider"
                                        style={{
                                            background: 'linear-gradient(90deg, transparent 0%, #00d4ff 50%, transparent 100%)',
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            backgroundClip: 'text',
                                        }}
                                    >
                                        {letter}
                                    </span>
                                </motion.div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Tagline - Fade In */}
                <motion.div
                    className="flex items-center gap-4 text-white/80"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1, delay: 2.8, ease: "easeOut" }}
                >
                    <motion.span
                        className="text-xl md:text-2xl font-light tracking-[0.3em]"
                        animate={{ opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                        CHARGE
                    </motion.span>
                    <span className="text-cyan-400 text-2xl">•</span>
                    <motion.span
                        className="text-xl md:text-2xl font-light tracking-[0.3em]"
                        animate={{ opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 2, delay: 0.7, repeat: Infinity, ease: "easeInOut" }}
                    >
                        NAVIGATE
                    </motion.span>
                    <span className="text-cyan-400 text-2xl">•</span>
                    <motion.span
                        className="text-xl md:text-2xl font-light tracking-[0.3em]"
                        animate={{ opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 2, delay: 1.4, repeat: Infinity, ease: "easeInOut" }}
                    >
                        GO
                    </motion.span>
                </motion.div>

                {/* Energy Pulse Effect */}
                <motion.div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.3, 0] }}
                    transition={{
                        duration: 1.5,
                        delay: 3.5,
                        ease: "easeInOut"
                    }}
                >
                    <div className="w-[800px] h-[400px] rounded-full bg-gradient-radial from-cyan-400/20 via-teal-400/10 to-transparent blur-3xl" />
                </motion.div>
            </motion.div>

            {/* Premium Cinematic Vignette */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: 'radial-gradient(circle at center, transparent 40%, rgba(0,0,0,0.8) 100%)',
                }}
            />

            {/* Soft Particles for Depth - Client-side only */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {particles.map((particle, i) => (
                    <motion.div
                        key={i}
                        className="absolute w-1 h-1 bg-cyan-400/30 rounded-full blur-sm"
                        style={{
                            left: particle.left,
                            top: particle.top,
                        }}
                        animate={{
                            y: [0, -100, 0],
                            opacity: [0, 0.6, 0],
                        }}
                        transition={{
                            duration: particle.duration,
                            delay: particle.delay,
                            repeat: Infinity,
                            ease: "easeInOut",
                        }}
                    />
                ))}
            </div>
        </motion.div>
    );
}
