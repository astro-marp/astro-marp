# Publishing astro-marp to npm

This document explains how to publish new versions of astro-marp to the npm registry using GitHub Actions.

## Prerequisites

### 1. npm Account and Token

You need an npm account and an automation token:

1. **Create npm account** (if you don't have one):
   - Go to https://www.npmjs.com/signup
   - Create your account

2. **Generate npm access token**:
   - Go to https://www.npmjs.com/settings/[your-username]/tokens
   - Click "Generate New Token" → "Classic Token"
   - Select **"Automation"** (recommended for CI/CD)
   - Copy the token (starts with `npm_...`)

### 2. Add Token to GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"**
4. Name: `NPM_TOKEN`
5. Value: Paste your npm token
6. Click **"Add secret"**

## Publishing Workflow

### Automatic Publishing (Recommended)

The repository is configured to automatically publish to npm when you push a version tag:

1. **Update version in package.json**:
   ```bash
   npm version patch   # For bug fixes (0.1.0 → 0.1.1)
   npm version minor   # For new features (0.1.0 → 0.2.0)
   npm version major   # For breaking changes (0.1.0 → 1.0.0)
   ```

2. **Push the tag**:
   ```bash
   git push --follow-tags
   ```

3. **GitHub Actions will**:
   - ✅ Checkout code
   - ✅ Install dependencies (`npm ci`)
   - ✅ Build the package (`npm run build`)
   - ✅ Publish to npm with provenance
   - ✅ Make package publicly accessible

### Manual Publishing (Fallback)

If you need to publish manually:

```bash
# 1. Build the package
npm run build

# 2. Login to npm (one-time)
npm login

# 3. Publish
npm publish --access public
```

## Workflow Files

### `.github/workflows/publish.yml`

**Triggers**: When you push a git tag matching `v*.*.*` (e.g., `v0.1.0`, `v1.2.3`)

**What it does**:
- Runs on Ubuntu with Node.js 22
- Installs dependencies with `npm ci` (uses package-lock.json)
- Builds TypeScript code with `npm run build`
- Publishes to npm registry with provenance (supply chain security)
- Sets package as public

**Environment**:
- Uses `NPM_TOKEN` secret for authentication
- Enables provenance for package verification

### `.github/workflows/ci.yml`

**Triggers**: On push to `main` branch or pull requests

**What it does**:
- Runs on Ubuntu with Node.js 22
- Installs dependencies
- Builds the package (verifies TypeScript compiles)
- Runs linter (continues even if linting fails)

**Purpose**: Ensures code quality before merging

## Version Numbering

Follow [Semantic Versioning (SemVer)](https://semver.org/):

- **PATCH** (0.0.x): Bug fixes, no breaking changes
- **MINOR** (0.x.0): New features, backward compatible
- **MAJOR** (x.0.0): Breaking changes

## Publishing Checklist

Before publishing a new version:

- [ ] All changes committed and pushed
- [ ] Tests pass locally (`npm test` if tests exist)
- [ ] Build succeeds (`npm run build`)
- [ ] Version number updated in `package.json`
- [ ] Changelog/release notes prepared (optional)
- [ ] Git tag created with `npm version`
- [ ] Tag pushed to GitHub with `git push --follow-tags`

## Verifying Publication

After GitHub Actions completes:

1. Check the **Actions** tab in GitHub for workflow status
2. Visit https://www.npmjs.com/package/astro-marp
3. Verify the new version is live
4. Test installation:
   ```bash
   npm install astro-marp@latest
   ```

## Troubleshooting

### Error: "npm ERR! 403 Forbidden"

**Cause**: NPM_TOKEN is missing or invalid

**Solution**:
1. Verify the token exists in GitHub Secrets
2. Generate a new token if needed (old one may have expired)
3. Ensure token type is "Automation" or "Publish"

### Error: "npm ERR! You do not have permission to publish"

**Cause**: You're not a maintainer of the package, or package name is taken

**Solution**:
1. Verify you're logged in with the correct npm account
2. Check package.json `name` field - may need to scope it (e.g., `@username/astro-marp`)
3. Contact package owner to add you as a maintainer

### Workflow doesn't trigger

**Cause**: Tag format doesn't match `v*.*.*` pattern

**Solution**:
- Use `npm version` which creates proper tags (e.g., `v0.1.0`)
- Don't manually create tags without the `v` prefix
- Push tags with `git push --follow-tags` or `git push --tags`

### Build fails in GitHub Actions

**Cause**: Dependencies or build script issues

**Solution**:
1. Test build locally: `npm ci && npm run build`
2. Check GitHub Actions logs for specific error
3. Ensure `package-lock.json` is committed
4. Verify Node.js version compatibility (workflow uses Node 22)

## Package Provenance

The workflow uses `--provenance` flag which:

- ✅ Links npm package to source code commit
- ✅ Verifies package authenticity
- ✅ Provides supply chain security
- ✅ Shows build information on npm package page

This is a best practice for modern npm packages.

## Additional Resources

- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Semantic Versioning Specification](https://semver.org/)
- [npm Provenance](https://github.blog/2023-04-19-introducing-npm-package-provenance/)
