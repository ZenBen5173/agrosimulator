const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const pageId = process.env.NOTION_CLAUDE_MD_PAGE_ID;

async function richTextToMarkdown(richTexts) {
  return richTexts
    .map((rt) => {
      let text = rt.plain_text;
      if (rt.annotations.bold) text = `**${text}**`;
      if (rt.annotations.italic) text = `*${text}*`;
      if (rt.annotations.strikethrough) text = `~~${text}~~`;
      if (rt.annotations.code) text = `\`${text}\``;
      if (rt.href) text = `[${text}](${rt.href})`;
      return text;
    })
    .join("");
}

async function blockToMarkdown(block) {
  const type = block.type;
  const data = block[type];

  switch (type) {
    case "paragraph":
      return richTextToMarkdown(data.rich_text);
    case "heading_1":
      return `# ${await richTextToMarkdown(data.rich_text)}`;
    case "heading_2":
      return `## ${await richTextToMarkdown(data.rich_text)}`;
    case "heading_3":
      return `### ${await richTextToMarkdown(data.rich_text)}`;
    case "bulleted_list_item":
      return `- ${await richTextToMarkdown(data.rich_text)}`;
    case "numbered_list_item":
      return `1. ${await richTextToMarkdown(data.rich_text)}`;
    case "to_do":
      const checked = data.checked ? "x" : " ";
      return `- [${checked}] ${await richTextToMarkdown(data.rich_text)}`;
    case "toggle":
      return `<details><summary>${await richTextToMarkdown(data.rich_text)}</summary></details>`;
    case "code":
      const lang = data.language || "";
      return `\`\`\`${lang}\n${await richTextToMarkdown(data.rich_text)}\n\`\`\``;
    case "quote":
      return `> ${await richTextToMarkdown(data.rich_text)}`;
    case "callout":
      const icon = data.icon?.emoji || "";
      return `> ${icon} ${await richTextToMarkdown(data.rich_text)}`;
    case "divider":
      return "---";
    case "table_of_contents":
      return "";
    case "bookmark":
      return data.url || "";
    case "image":
      const url = data.type === "external" ? data.external.url : data.file.url;
      const caption = data.caption?.length
        ? await richTextToMarkdown(data.caption)
        : "";
      return `![${caption}](${url})`;
    default:
      return "";
  }
}

async function getChildBlocks(blockId) {
  const blocks = [];
  let cursor;
  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    blocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

async function blocksToMarkdown(blockId) {
  const blocks = await getChildBlocks(blockId);
  const lines = [];

  for (const block of blocks) {
    const md = await blockToMarkdown(block);
    lines.push(md);

    if (block.has_children && block.type !== "table_of_contents") {
      const childMd = await blocksToMarkdown(block.id);
      const indented = childMd
        .split("\n")
        .map((l) => (l ? `  ${l}` : l))
        .join("\n");
      lines.push(indented);
    }
  }

  return lines.join("\n");
}

async function main() {
  if (!process.env.NOTION_API_KEY) {
    console.error("Error: NOTION_API_KEY is not set in .env.local");
    process.exit(1);
  }
  if (!pageId) {
    console.error("Error: NOTION_CLAUDE_MD_PAGE_ID is not set in .env.local");
    process.exit(1);
  }

  const markdown = await blocksToMarkdown(pageId);
  const outPath = path.resolve(__dirname, "../CLAUDE.md");
  fs.writeFileSync(outPath, markdown.trimEnd() + "\n", "utf-8");
  console.log("CLAUDE.md synced from Notion");
}

main().catch((err) => {
  console.error("Failed to sync CLAUDE.md:", err.message);
  process.exit(1);
});
