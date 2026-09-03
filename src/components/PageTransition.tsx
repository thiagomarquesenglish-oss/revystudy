import { motion, useReducedMotion } from 'framer-motion';
import { useTabTransitionKey } from '@/components/TabLayout';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const transitionKey = useTabTransitionKey();

  return (
    <motion.div
      key={transitionKey}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
