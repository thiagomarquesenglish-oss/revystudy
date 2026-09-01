import { motion } from 'framer-motion';
import { useTabTransitionKey } from '@/components/TabLayout';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const transitionKey = useTabTransitionKey();

  return (
    <motion.div
      key={transitionKey}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
