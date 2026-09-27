import {
  Activity,
  Ambulance,
  Biohazard,
  Cable,
  CircleAlert,
  Construction,
  Fence,
  Flame,
  Footprints,
  HardHat,
  Radiation,
  Route,
  ShieldCheck,
  Snowflake,
  Sun,
  TrafficCone,
  TowerControl,
  Zap,
} from "lucide-react";

const icons = {
  utilities: Cable,
  fence: Fence,
  access: Footprints,
  "first-aid": Ambulance,
  emergency: CircleAlert,
  power: Zap,
  traffic: Route,
  excavation: Construction,
  fall: ShieldCheck,
  scaffold: HardHat,
  crane: TowerControl,
  operations: Activity,
  "hot-work": Flame,
  hazmat: Biohazard,
  confined: Radiation,
  demolition: TrafficCone,
  sun: Sun,
  snow: Snowflake,
};

export function BlockVisual({ visualKey, color, size = "medium" }: { visualKey: string; color: string; size?: "small" | "medium" | "large" }) {
  const Icon = icons[visualKey as keyof typeof icons] ?? ShieldCheck;
  return <span className={`block-visual block-visual-${size}`} style={{ color, backgroundColor: `${color}18` }}><Icon /></span>;
}
