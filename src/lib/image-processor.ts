import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';

export interface ImageReference {
  original: string;
  alt: string;
  title?: string;
  optimizedSrc?: string;
  isRemote: boolean;
}

export interface ImageProcessingResult {
  processedMarkdown: string;
  images: ImageReference[];
  imageImports: string[];
  runtimeReplacements: { placeholder: string; importName: string }[];
}

const IMAGE_REGEX = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g;

export function isRemoteUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

export function resolveImagePath(imagePath: string, marpFilePath: string): string {
  if (imagePath.startsWith('./') || imagePath.startsWith('../')) {
    // Relative to the .marp file
    return resolve(dirname(marpFilePath), imagePath);
  } else if (imagePath.startsWith('/')) {
    // Absolute path from project root
    return resolve(process.cwd(), imagePath.slice(1));
  } else if (imagePath.startsWith('@/')) {
    // Alias to src directory
    return resolve(process.cwd(), 'src', imagePath.slice(2));
  }
  // Default: relative to .marp file
  return resolve(dirname(marpFilePath), imagePath);
}

export async function processImagesForVite(
  markdown: string,
  marpFilePath: string
): Promise<ImageProcessingResult> {
  const images: ImageReference[] = [];
  const imageImports: string[] = [];
  const runtimeReplacements: { placeholder: string; importName: string }[] = [];
  let processedMarkdown = markdown;
  let imageCounter = 0;

  // Extract all image references
  const matches = Array.from(markdown.matchAll(IMAGE_REGEX));

  for (const match of matches) {
    const [, alt, src, title] = match;

    if (isRemoteUrl(src)) {
      // Remote image - no processing
      images.push({
        original: src,
        alt,
        title,
        optimizedSrc: src,
        isRemote: true
      });
      continue;
    }

    // Local image - resolve and create import
    const absolutePath = resolveImagePath(src, marpFilePath);

    if (!existsSync(absolutePath)) {
      console.warn(`[astro-marp] Image not found: ${absolutePath}`);
      images.push({
        original: src,
        alt,
        title,
        optimizedSrc: src,
        isRemote: false
      });
      continue;
    }

    // Create import statement and placeholder
    const importName = `image${imageCounter++}`;
    const placeholder = `ASTRO_IMAGE_${importName}`;

    // Create import relative to .marp file location
    imageImports.push(`import ${importName} from '${src}';`);

    // Replace in markdown with placeholder
    const originalPattern = `![${alt}](${src}${title ? ` "${title}"` : ''})`;
    const replacement = `![${alt}](${placeholder}${title ? ` "${title}"` : ''})`;
    processedMarkdown = processedMarkdown.replace(originalPattern, replacement);

    runtimeReplacements.push({ placeholder, importName });

    images.push({
      original: src,
      alt,
      title,
      optimizedSrc: placeholder, // Will be replaced at runtime
      isRemote: false
    });

    // Image will be imported and processed by Astro's asset pipeline
  }

  return {
    processedMarkdown,
    images,
    imageImports,
    runtimeReplacements
  };
}
