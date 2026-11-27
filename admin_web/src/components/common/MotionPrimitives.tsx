import React, { useEffect, useState } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { EASE_CINEMATIC } from './motionTokens';

interface ScrollProgressBarProps {
  containerRef: React.RefObject<HTMLElement | null>;
}

export const ScrollProgressBar: React.FC<ScrollProgressBarProps> = ({ containerRef }) => {
  const { scrollYProgress } = useScroll({ container: containerRef });
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 180,
    damping: 28,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="h-[2.5px] w-full origin-left bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-400 pointer-events-none shrink-0 z-30"
    />
  );
};

interface RevealSectionProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export const RevealSection: React.FC<RevealSectionProps> = ({
  children,
  className = '',
  delay = 0,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.12 }}
    transition={{ duration: 0.5, delay, ease: EASE_CINEMATIC }}
    className={className}
  >
    {children}
  </motion.div>
);

interface StaggerCardProps {
  children: React.ReactNode;
  className?: string;
  index?: number;
}

export const StaggerCard: React.FC<StaggerCardProps> = ({
  children,
  className = '',
  index = 0,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 18, scale: 0.985 }}
    whileInView={{ opacity: 1, y: 0, scale: 1 }}
    viewport={{ once: true, amount: 0.15 }}
    transition={{
      duration: 0.45,
      delay: Math.min(index * 0.07, 0.35),
      ease: EASE_CINEMATIC,
    }}
    whileHover={{
      y: -3,
      transition: { duration: 0.2, ease: 'easeOut' },
    }}
    className={className}
  >
    {children}
  </motion.div>
);

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  formatter?: (n: number) => string;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  duration = 650,
  formatter = (n) => Math.round(n).toLocaleString(),
}) => {
  const [displayValue, setDisplayValue] = useState<number>(value);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced || duration <= 0) {
      setDisplayValue(value);
      return;
    }

    let frameId = 0;
    const startVal = displayValue;
    const delta = value - startVal;
    if (delta === 0) return;

    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayValue(startVal + delta * eased);
      if (t < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <span className="tabular-nums">{formatter(displayValue)}</span>;
};
