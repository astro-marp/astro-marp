export interface MarpConfig {
  /** Default theme to use for presentations. Must be a built-in theme name. */
  defaultTheme?: string;
  /** Enable debug logging for development */
  debug?: boolean;
  /** Maximum number of slides to process (for performance) */
  maxSlides?: number;
  /** Enable Mermaid diagram support */
  enableMermaid?: boolean;
  /**
   * Mermaid rendering strategy (server-side only)
   * - 'inline-svg': Build-time rendering as inline SVG (default)
   * - 'img-svg': Build-time rendering as SVG image
   * - 'img-png': Build-time rendering as PNG image
   * - 'pre-mermaid': Output as <pre class="mermaid"> for custom rendering
   *
   * All strategies require Playwright: npm install playwright && npx playwright install chromium
   */
  mermaidStrategy?: 'inline-svg' | 'img-svg' | 'img-png' | 'pre-mermaid';
  /** Custom Marp CLI arguments */
  marpCliArgs?: string[];
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