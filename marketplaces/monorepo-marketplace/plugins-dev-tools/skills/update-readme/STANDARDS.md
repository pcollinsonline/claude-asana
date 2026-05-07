# README Standards

## Root README Template

````markdown
# [Project Name]

## Overview

| Folder    | Description                                                           |
|-----------|-----------------------------------------------------------------------|
| packages  | packages for shared code libraries                                    |
| apps      | packages for web applications                                         |
| toolchain | packages supporting the shared toolchain (eslint, vitest, typescript) |

## Prerequisites

| Tool    | Description                                                                                                                                                  |
|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Node.js | check node version in engines section of package.json for latest minimum version                                                                             |
| PNPM    | Fast, disk space efficient package manager ([PNpm](https://pnpm.io)) <br>(best to install via corepack) <pre lang="shell"><code># corepack enable pnpm</pre> |

## Packages

| Package | Description |
|---------|-------------|
| [`@scope/package-name`](./packages/package-name) | [description from package.json] |

## Apps

| App | Description | Port |
|-----|-------------|------|
| [`app-name`](./apps/app-name) | [description from package.json] | [port] |

## Useful Monorepo Operations

| Command | Description |
|---------|-------------|
| `pnpm install` | Install dependencies for all workspaces |
| `pnpm run -w clean` | Remove all generated `build` artifacts |
| `pnpm run -w build` | Produce final artifacts for deployment |
| `pnpm run -w test` | Run unit tests for all workspaces |
| `pnpm run -w lint` | Run linting for all workspaces |
| `pnpm run -w typecheck` | Run TypeScript type checks |

## Building Docker Image

_(Include only if Dockerfile exists)_

\`\`\`shell
docker build . -t [app-name] --build-arg="APP_NAME=[app-name]"
docker run --rm --name=[app-name] -p 8080:3000 [app-name]
\`\`\`

## Local Development Services

_(Include only if docker-compose.yml exists)_

| Service | Description |
|---------|-------------|
| [service-name] | [description] |

Start: `docker compose up -d` · Stop: `docker compose down`

## Conventional Commits Best Practices

Commit messages must adhere to [Conventional Commits](https://www.conventionalcommits.org/) best practices.
````

---

## Package README Section Catalog

Assemble each package README by selecting relevant sections from this catalog. Include a section when its trigger condition is met. Omit it when the condition is not met -- never include empty sections or placeholder content.

### Title & Description

- **When:** Always
- **Quality bar:** Title = `package.json` name (e.g. `# @packages/plugins-base`). Description is one sentence on the line after the title, no heading. Must be specific enough to distinguish from sibling packages.

### Installation

- **When:** Libraries consumed by other packages (`packageType: library`)
- **Quality bar:** Show the exact install command (`pnpm add @scope/name`). For internal toolchain packages, show the devDependency JSON instead of a shell command if that matches actual usage.

### Usage

- **When:** Always
- **Quality bar:** At minimum one code example with a real import path and real export names from the package. For packages with multiple export paths or profiles, show each separately. Show "typical monorepo usage" when the common case involves spreading and overriding.

### API

- **When:** Libraries with public exports (`exports` list from `readme_prepare` is non-empty)
- **Quality bar:** List each export with a one-line description. For functions, include the signature: `functionName(params): ReturnType`. Use tables for parameter descriptions when a function has 2+ parameters. Group exports by export path when multiple exist. Do NOT write exhaustive parameter-by-parameter docs -- TypeScript types serve that purpose.

### Endpoints / Routes

- **When:** API servers or packages defining HTTP routes
- **Quality bar:** Table with Method, Path, and Description columns. Include all routes including documentation endpoints and health checks.

### Environment Variables

- **When:** Apps that read environment variables (check for `process.env` usage, `.env.example`, or env var references in source)
- **Quality bar:** Table with Variable, Description, Required, and Default columns. Reference `.env.example` if one exists.

### Skills / Tools / Agents

- **When:** Plugin packages (`marketplaces/` category) that define skills, MCP tools, or agents
- **Quality bar:** Separate table for each concept. Skills table: Skill, Description, Usage. Tools table: Tool, Description. Agents table: Agent, Model, Description. Include all entries -- these are the package's primary interface.

### Hooks

- **When:** Plugin packages that define hook handlers
- **Quality bar:** Table with Hook, Trigger, and Behavior columns.

### Profiles / Presets

- **When:** Config packages that offer named configurations (eslint profiles, tsconfig presets)
- **Quality bar:** Subsection per profile/preset with what it includes. Use tables for compiler options or rule categories.

### What's Included

- **When:** Config or tooling packages where the value is the curated set of things bundled
- **Quality bar:** Bulleted list or table. For eslint configs, list bundled plugins with purpose. For build tooling, list the components/phases.

### Key Rules / Key Behavior

- **When:** Config packages where users need to know the enforced rules or conventions
- **Quality bar:** Group by category (e.g. TypeScript, JavaScript, Vitest). Use short bullet points. Focus on rules that surprise or constrain -- do not list every rule.

### Configuration

- **When:** Packages that support runtime configuration files
- **Quality bar:** Show the config file path, a complete JSON example, and describe each option. Use a code block for the JSON example.

### Structure

- **When:** Packages with non-obvious directory layout that aids understanding
- **Quality bar:** ASCII tree diagram showing the source layout with one-line descriptions for key files. Only include when the structure is genuinely informative (e.g. a plugin with `skills/`, `hooks/`, `agents/` directories).

### Getting Started

- **When:** Apps only (`packageType: app`)
- **Quality bar:** Step-by-step instructions: install, configure env, run dev server. Include the dev server URL and port.

### Workflow

- **When:** Packages that define multi-step pipelines or processes
- **Quality bar:** Numbered steps with brief description of each.

### Docker

- **When:** Apps with a Dockerfile in the repo root or package directory
- **Quality bar:** Show build and run commands with the correct app name and port mapping.

### Build

- **When:** Packages with build output (`build` script in `package.json` that produces artifacts)
- **Quality bar:** Show the build command and state where output goes.

### Scripts

- **When:** Always
- **Quality bar:** Table with Script and Description columns. List all scripts from `package.json`. Descriptions must be specific, not just repeating the script name.

---

## Anti-Patterns

Do NOT include any of the following:

- **Placeholder text** -- `[description]`, `TODO`, `TBD`, or any bracket-wrapped placeholders
- **Dependencies section** -- duplicates `package.json`; adds no value
- **Generic descriptions** -- "A utility package" or "Shared configuration" without specifics
- **Empty sections** -- if a section has no content, omit it entirely
- **Exhaustive parameter docs** -- TypeScript types are the reference; READMEs orient
- **Badges** -- no coverage, build status, or npm badges
- **Table of contents** -- packages are not long enough to need one
- **License section** -- covered at repo root level

---

## Style Rules

- **Title** = `package.json` name field (e.g. `# @toolchain/eslint-config`)
- **First line after title** is a one-sentence description, no heading
- **Tables** for structured data (scripts, env vars, routes, exports)
- **Real imports** in code examples -- use actual export names from the package
- **Imperative mood** for instructions ("Run ESLint" not "Runs ESLint")
- **One blank line** between sections
- **Code blocks** specify language (`typescript`, `shell`, `json`, `javascript`)
- **Internal links** use relative paths (`./packages/foo`)
