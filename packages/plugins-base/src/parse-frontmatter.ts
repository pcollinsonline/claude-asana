import matter from 'gray-matter'

/** Parse YAML frontmatter from a markdown file using gray-matter. */
export const parseFrontmatter = (
  content: string,
): { body: string; frontmatter: Record<string, unknown> } => {
  const result = matter(content) as { content: string; data: Record<string, unknown> }
  return { body: result.content, frontmatter: result.data }
}
