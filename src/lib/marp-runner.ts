import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findMarpCli(): string {
  // When running from dist, try different paths to find the marp binary
  const possiblePaths = [
    resolve(__dirname, '../../node_modules/.bin/marp'),
    resolve(__dirname, '../../../node_modules/.bin/marp'),
    resolve(process.cwd(), 'node_modules/.bin/marp'),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  // Fallback to npx if binary not found (should not happen in production)
  throw new Error('Marp CLI binary not found. Please ensure @marp-team/marp-cli is installed.');
}

export interface MarpRunnerOptions {
  theme?: string;
  html?: boolean;
}

export interface MarpRunnerResult {
  html: string;
  slidesCount: number;
  error?: string;
}

export async function runMarpCli(markdown: string, options: MarpRunnerOptions = {}): Promise<MarpRunnerResult> {
  const { theme = 'default', html = true } = options;

  return new Promise((resolve, reject) => {
    const args = [
      '--stdin',           // Read from stdin
      '--html',           // Enable HTML output
      '-o', '-',          // Output to stdout
    ];

    // Add theme if specified and not a built-in theme
    if (theme) {
      // For file paths, we need to ensure Marp CLI properly resolves them
      args.push('--theme', theme);
    } else {
      args.push('--theme', "am_blue");
    }

    const marpCliPath = findMarpCli();

    const marpProcess = spawn(marpCliPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    marpProcess.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    marpProcess.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    marpProcess.on('close', (code) => {
      if (code !== 0) {
        resolve({
          html: `<div class="marp-error">
            <h1>Marp CLI Error</h1>
            <p>Exit code: ${code}</p>
            <pre>${stderr}</pre>
          </div>`,
          slidesCount: 1,
          error: stderr,
        });
        return;
      }

      // Count slides in the output HTML
      const slidesCount = countSlidesInHtml(stdout);

      // Inject Mermaid support
      const htmlWithMermaid = injectMermaidSupport(stdout);

      resolve({
        html: htmlWithMermaid,
        slidesCount,
      });
    });

    marpProcess.on('error', (error) => {
      resolve({
        html: `<div class="marp-error">
          <h1>Marp CLI Process Error</h1>
          <p>${error.message}</p>
        </div>`,
        slidesCount: 1,
        error: error.message,
      });
    });

    // Send markdown to stdin
    marpProcess.stdin?.write(markdown);
    marpProcess.stdin?.end();
  });
}

function countSlidesInHtml(html: string): number {
  // Count section elements which represent slides in Marp output
  const matches = html.match(/<section[^>]*>/g);
  return matches ? matches.length : 1;
}

function injectMermaidSupport(html: string): string {
  // Inject Mermaid initialization script into the head
  const mermaidScript = `
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
      mermaid.initialize({ startOnLoad: true });
    </script>
  `;

  // Insert before closing head tag, or at the beginning if no head
  if (html.includes('</head>')) {
    return html.replace('</head>', `${mermaidScript}</head>`);
  } else {
    return `${mermaidScript}${html}`;
  }
}

export function generateSourceHash(content: string, theme: string, config: any = {}): string {
  const hashInput = JSON.stringify({ content, theme, config });
  return createHash('md5').update(hashInput).digest('hex').substring(0, 8);
}