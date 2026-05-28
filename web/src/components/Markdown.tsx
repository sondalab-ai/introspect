import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Themed markdown renderer for in-app content (CLAUDE.md, agent/skill/command/memory bodies). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
