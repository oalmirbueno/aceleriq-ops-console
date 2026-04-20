/**
 * Templates de credenciais por categoria — sugestões pra autocomplete do
 * service_name quando o usuário cria nova credencial. Apenas hint visual,
 * o usuário pode digitar qualquer coisa.
 */
import { Megaphone, Server, Globe, Users, Sparkles, type LucideIcon } from "lucide-react";

export type CredentialCategory = "platform" | "hosting_dns" | "cms" | "social_email" | "other";

export interface CategoryMeta {
  id: CredentialCategory;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  /** Serviços comuns dessa categoria (sugestões de service_name) */
  presets: string[];
}

export const CREDENTIAL_CATEGORIES: CategoryMeta[] = [
  {
    id: "platform",
    label: "Plataformas de mídia",
    description: "Meta Ads, Google Ads, GA4, Search Console, TikTok",
    icon: Megaphone,
    color: "text-violet-400 border-violet-500/40",
    bg: "bg-violet-500/10",
    presets: [
      "Meta Business Manager", "Meta Ads Manager", "Google Ads", "Google Analytics 4",
      "Google Search Console", "Google Tag Manager", "TikTok Ads", "Pinterest Ads",
      "LinkedIn Campaign Manager",
    ],
  },
  {
    id: "hosting_dns",
    label: "Hospedagem & DNS",
    description: "cPanel, Cloudflare, registrador de domínio, servidor",
    icon: Server,
    color: "text-cyan-400 border-cyan-500/40",
    bg: "bg-cyan-500/10",
    presets: [
      "Cloudflare", "Registro.br", "GoDaddy", "Hostinger cPanel", "AWS",
      "DigitalOcean", "Vercel", "Netlify",
    ],
  },
  {
    id: "cms",
    label: "CMS & Sites",
    description: "WordPress, Webflow, Shopify e outros painéis",
    icon: Globe,
    color: "text-emerald-400 border-emerald-500/40",
    bg: "bg-emerald-500/10",
    presets: [
      "WordPress Admin", "Webflow", "Shopify Admin", "Wix", "Squarespace",
      "RD Station", "HubSpot", "Hotmart",
    ],
  },
  {
    id: "social_email",
    label: "Redes sociais & E-mail",
    description: "IG, FB, LinkedIn, e-mail corporativo, WhatsApp Business",
    icon: Users,
    color: "text-pink-400 border-pink-500/40",
    bg: "bg-pink-500/10",
    presets: [
      "Instagram", "Facebook Page", "LinkedIn Company Page", "TikTok",
      "YouTube", "WhatsApp Business", "E-mail corporativo (Google Workspace)",
      "E-mail corporativo (Microsoft 365)",
    ],
  },
  {
    id: "other",
    label: "Outros acessos",
    description: "Qualquer outro login importante do projeto",
    icon: Sparkles,
    color: "text-muted-foreground border-border",
    bg: "bg-muted/30",
    presets: [],
  },
];

export function getCategoryMeta(id: string): CategoryMeta {
  return CREDENTIAL_CATEGORIES.find((c) => c.id === id) ?? CREDENTIAL_CATEGORIES[4];
}
