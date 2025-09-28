import { createHash } from 'node:crypto';

interface ParsedMarpFile {
  frontmatter: Record<string, any>;
  content: string;
  title: string;
  images: string[];
}

export async function parseMarpFile(contents: string): Promise<ParsedMarpFile> {
  const { frontmatter, content } = extractFrontmatter(contents);

  // Extract title from frontmatter or first heading
  const title = frontmatter.title || extractTitleFromContent(content) || 'Untitled Presentation';

  // Extract image references
  const images = extractImageReferences(content);

  return {
    frontmatter,
    content,
    title,
    images,
  };
}

function extractFrontmatter(contents: string): { frontmatter: Record<string, any>; content: string } {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = contents.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, content: contents };
  }

  try {
    // Simple YAML parsing for basic frontmatter
    const yamlContent = match[1];
    const frontmatter: Record<string, any> = {};

    const lines = yamlContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex > 0) {
          const key = trimmed.substring(0, colonIndex).trim();
          const value = trimmed.substring(colonIndex + 1).trim();

          // Handle quoted strings
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            frontmatter[key] = value.slice(1, -1);
          } else if (value === 'true') {
            frontmatter[key] = true;
          } else if (value === 'false') {
            frontmatter[key] = false;
          } else if (!isNaN(Number(value))) {
            frontmatter[key] = Number(value);
          } else {
            frontmatter[key] = value;
          }
        }
      }
    }

    return { frontmatter, content: match[2] };
  } catch (error) {
    console.warn('[astro-marp] Failed to parse frontmatter:', error);
    return { frontmatter: {}, content: contents };
  }
}

function extractTitleFromContent(content: string): string | null {
  const headingMatch = content.match(/^#{1,6}\s+(.+)$/m);
  return headingMatch ? headingMatch[1].trim() : null;
}

function extractImageReferences(content: string): string[] {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const images: string[] = [];
  let match;

  while ((match = imageRegex.exec(content)) !== null) {
    images.push(match[2]); // The URL part
  }

  return images;
}

export function generateContentHash(content: string, theme: string): string {
  return createHash('md5').update(content + theme).digest('hex').substring(0, 8);
}

export function countSlides(content: string): number {
  // Count slide separators (---) plus 1 for the first slide
  const separators = (content.match(/^---\s*$/gm) || []).length;
  return separators + 1;
}