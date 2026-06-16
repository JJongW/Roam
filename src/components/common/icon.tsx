import {
  BrainCircuit,
  Bot,
  Car,
  Gamepad2,
  HeartPulse,
  Landmark,
  UtensilsCrossed,
  Leaf,
  ShoppingBag,
  Search,
  Users,
  Sparkles,
  Zap,
  Scale,
  Compass,
  User,
  Heart,
  Home,
  Briefcase,
  MapPin,
  PenLine,
  StickyNote,
  GraduationCap,
  Store,
  Coffee,
  Palette,
  BookOpen,
  Blocks,
  FlaskConical,
  BookMarked,
  Globe,
  Library,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const REGISTRY: Record<string, LucideIcon> = {
  BrainCircuit,
  Bot,
  Car,
  Gamepad2,
  HeartPulse,
  Landmark,
  UtensilsCrossed,
  Leaf,
  ShoppingBag,
  Search,
  Users,
  Sparkles,
  Zap,
  Scale,
  Compass,
  User,
  Heart,
  Home,
  Briefcase,
  MapPin,
  PenLine,
  StickyNote,
  GraduationCap,
  Store,
  Coffee,
  Palette,
  BookOpen,
  Blocks,
  FlaskConical,
  BookMarked,
  Globe,
  Library,
};

export function Icon({
  name,
  className,
  fallback = MapPin,
}: {
  name: string;
  className?: string;
  fallback?: LucideIcon;
}) {
  const Cmp = REGISTRY[name] ?? fallback;
  return <Cmp className={cn("size-5", className)} aria-hidden="true" />;
}
