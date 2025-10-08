export interface MarpConfig {
  defaultTheme?: string;
  debug?: boolean;
}

export interface MarpMeta {
  id: string;
  slug: string;
  title: string;
  theme: string;
  slidesCount: number;
  filePath: string;
  updatedAt: string;
  sourceHash: string;
  images: Array<{
    original: string;
    optimizedSrc: string;
    width?: number;
    height?: number;
    format?: string;
    alt?: string;
  }>;
  frontmatter: Record<string, unknown>;
}

export interface MarpVirtualModule {
  html: string;
  meta: MarpMeta;
  raw: string;
}