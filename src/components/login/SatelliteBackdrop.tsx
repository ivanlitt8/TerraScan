"use client";

import { motion } from "framer-motion";

/** Desfases escalonados de las ondas de radar para un flujo continuo. */
const RADAR_DELAYS = [0, 1.5, 3] as const;

/**
 * Fondo satelital animado del panel de login: un glow atmosférico que pulsa
 * (simulando un planeta vivo) + ondas de radar concéntricas que se expanden en
 * loop. Todo es decorativo (`aria-hidden`, `pointer-events-none`) y vive detrás
 * de la tarjeta informativa (que lleva `z-10`).
 */
export default function SatelliteBackdrop() {
  return (
    <>
      {/* Glow atmosférico dinámico (pulso planetario) */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 55% 50% at 75% 18%, rgba(16,185,129,0.28), transparent 72%), radial-gradient(ellipse 50% 50% at 20% 90%, rgba(20,184,166,0.22), transparent 72%)",
        }}
        initial={{ opacity: 0.55 }}
        animate={{ opacity: [0.55, 0.9, 0.55] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Ondas de radar concéntricas */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        {RADAR_DELAYS.map((delay) => (
          <motion.div
            key={delay}
            className="absolute h-72 w-72 rounded-full border-2 border-emerald-400/30"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [0.8, 2.2], opacity: [0, 0.5, 0] }}
            transition={{
              duration: 4.5,
              repeat: Infinity,
              ease: "easeOut",
              delay,
            }}
          />
        ))}
      </div>
    </>
  );
}
