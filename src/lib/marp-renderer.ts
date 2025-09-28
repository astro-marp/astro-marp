import type { MarpConfig } from '../types.js';
import { runMarpCli } from './marp-runner.js';
import { parseMarpFile } from './marp-parser.js';
import { resolveTheme } from './theme-resolver.js';

export async function renderMarpContent(rawContent: string, config: MarpConfig = {}) {
  const parsed = await parseMarpFile(rawContent);
  const theme = resolveTheme(config.defaultTheme || 'default');

  // Use the theme from frontmatter if specified
  const effectiveTheme = parsed.frontmatter.theme
    ? resolveTheme(parsed.frontmatter.theme as string)
    : theme;

  // Run Marp CLI to process the markdown
  const marpResult = await runMarpCli(parsed.content, {
    theme: effectiveTheme,
    html: true,
  });

  // Create an Astro component that renders the Marp HTML
  const Content = (result: any, _props: any, _slots: any) => {
    return result.response.body = marpResult.html;
  };

  return { Content };
}

// Renderer entry point for Astro
export default {
  name: 'astro-marp-renderer',
  serverEntrypoint: 'astro-marp/dist/lib/marp-renderer.js',
};