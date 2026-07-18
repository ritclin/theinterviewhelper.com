import React, { useRef, useEffect } from "react";
import { Code, Check, Copy } from "lucide-react";

interface MarkdownStreamViewerProps {
  content: string;
  autoScroll?: boolean;
}

export function MarkdownStreamViewer({ content, autoScroll = true }: MarkdownStreamViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);

  // Auto-scroll to the bottom when content streams in (throttled for performance)
  useEffect(() => {
    if (!autoScroll || !containerRef.current) return;

    const frame = requestAnimationFrame(() => {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    return () => cancelAnimationFrame(frame);
  }, [content, autoScroll]);

  // Handle code snippet copy actions
  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Ultra-robust stream segmenter
  const parseContent = (text: string) => {
    const parts = [];
    let currentIndex = 0;

    while (true) {
      const startIndex = text.indexOf("```", currentIndex);
      if (startIndex === -1) {
        if (currentIndex < text.length) {
          parts.push({ type: "text", value: text.substring(currentIndex) });
        }
        break;
      }

      if (startIndex > currentIndex) {
        parts.push({ type: "text", value: text.substring(currentIndex, startIndex) });
      }

      const endIndex = text.indexOf("```", startIndex + 3);
      if (endIndex === -1) {
        // Open-ended code block (currently streaming in)
        const blockContent = text.substring(startIndex + 3);
        const newlineIndex = blockContent.indexOf("\n");
        const language = newlineIndex !== -1 ? blockContent.substring(0, newlineIndex).trim() : "";
        const code = newlineIndex !== -1 ? blockContent.substring(newlineIndex + 1) : blockContent;
        parts.push({ type: "code", language, value: code, isIncomplete: true });
        break;
      } else {
        const blockContent = text.substring(startIndex + 3, endIndex);
        const newlineIndex = blockContent.indexOf("\n");
        const language = newlineIndex !== -1 ? blockContent.substring(0, newlineIndex).trim() : "";
        const code = newlineIndex !== -1 ? blockContent.substring(newlineIndex + 1) : blockContent;
        parts.push({ type: "code", language, value: code, isIncomplete: false });
        currentIndex = endIndex + 3;
      }
    }

    return parts;
  };

  // Quick light regex-less token highlighter for rich premium visual aesthetic
  const highlightCode = (codeText: string, language: string) => {
    const lines = codeText.split("\n");
    return lines.map((line, idx) => {
      // Highlight comments
      if (line.trim().startsWith("//") || line.trim().startsWith("#")) {
        return <span key={idx} className="text-gray-500 block font-mono text-sm">{line}</span>;
      }
      
      // Tokenize basic keywords for visual sparkle (React, Python, SQL)
      const keywords = ["const", "function", "return", "import", "export", "class", "def", "if", "else", "while", "for", "in", "SELECT", "FROM", "WHERE", "INNER JOIN", "ON", "CREATE", "INDEX", "DESC", "LIMIT"];
      const parts = line.split(/(\s+)/);
      
      return (
        <span key={idx} className="block font-mono text-sm leading-6">
          {parts.map((part, pIdx) => {
            if (keywords.includes(part.trim())) {
              return <span key={pIdx} className="text-indigo-400 font-semibold">{part}</span>;
            }
            if (part.trim().startsWith('"') || part.trim().startsWith("'") || part.trim().startsWith("`")) {
              return <span key={pIdx} className="text-emerald-400">{part}</span>;
            }
            // highlight types
            if (/^[A-Z][a-zA-Z0-9]+/.test(part.trim()) && !keywords.includes(part.trim())) {
              return <span key={pIdx} className="text-amber-400">{part}</span>;
            }
            return <span key={pIdx} className="text-slate-200">{part}</span>;
          })}
        </span>
      );
    });
  };

  const parsedBlocks = parseContent(content);

  const renderTextBlock = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      
      if (!trimmed) return <div key={idx} className="h-2" />;

      // Main header mapping
      if (trimmed.startsWith("### ")) {
        return (
          <h4 key={idx} className="text-lg font-bold font-display tracking-tight text-white mt-6 mb-3 flex items-center gap-2 border-b border-slate-800 pb-1.5">
            <span className="w-1.5 h-4 bg-indigo-500 rounded-full inline-block" />
            {trimmed.replace("### ", "")}
          </h4>
        );
      }
      if (trimmed.startsWith("## ")) {
        return (
          <h3 key={idx} className="text-xl font-bold font-display tracking-tight text-white mt-8 mb-4 border-b border-indigo-900 pb-2">
            {trimmed.replace("## ", "")}
          </h3>
        );
      }
      if (trimmed.startsWith("# ")) {
        return (
          <h2 key={idx} className="text-2xl font-bold font-display tracking-tight text-white mt-10 mb-5 text-indigo-300">
            {trimmed.replace("# ", "")}
          </h2>
        );
      }

      // Bullet items mapping
      if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
        const textContent = trimmed.substring(2);
        const boldRegex = /\*\*(.*?)\*\*/g;
        const parts = [];
        let lastIndex = 0;
        let match;

        // Inline bold markdown parser
        while ((match = boldRegex.exec(textContent)) !== null) {
          if (match.index > lastIndex) {
            parts.push(textContent.substring(lastIndex, match.index));
          }
          parts.push(<strong key={match.index} className="text-indigo-300 font-semibold">{match[1]}</strong>);
          lastIndex = boldRegex.lastIndex;
        }
        if (lastIndex < textContent.length) {
          parts.push(textContent.substring(lastIndex));
        }

        return (
          <li key={idx} className="flex gap-2 text-slate-300 ml-4 mb-2.5 leading-relaxed text-sm">
            <span className="text-indigo-400 font-bold select-none">•</span>
            <div>{parts.length > 0 ? parts : textContent}</div>
          </li>
        );
      }

      // General paragraph rendering
      const boldRegex = /\*\*(.*?)\*\*/g;
      const parts = [];
      let lastIndex = 0;
      let match;

      while ((match = boldRegex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          parts.push(line.substring(lastIndex, match.index));
        }
        parts.push(<strong key={match.index} className="text-white font-semibold">{match[1]}</strong>);
        lastIndex = boldRegex.lastIndex;
      }
      if (lastIndex < line.length) {
        parts.push(line.substring(lastIndex));
      }

      return (
        <p key={idx} className="text-slate-300 mb-3.5 leading-relaxed text-sm">
          {parts.length > 0 ? parts : line}
        </p>
      );
    });
  };

  return (
    <div className="space-y-4 font-sans text-left max-w-none">
      {parsedBlocks.map((block, index) => {
        if (block.type === "code") {
          return (
            <div key={index} className="relative rounded-xl border border-slate-800 bg-slate-950/80 backdrop-blur-md overflow-hidden my-4 group">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-900 bg-slate-950/90 select-none">
                <div className="flex items-center gap-2">
                  <Code className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-xs text-slate-400 font-mono tracking-wider uppercase">
                    {block.language || "code"} {block.isIncomplete && <span className="text-[10px] text-amber-500 font-sans tracking-normal animate-pulse inline-block ml-1">(streaming)</span>}
                  </span>
                </div>
                <button
                  onClick={() => copyToClipboard(block.value, index)}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer"
                  title="Copy code"
                >
                  {copiedIndex === index ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="p-4 overflow-x-auto max-h-[350px] scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                <pre className="m-0 p-0 whitespace-pre">
                  <code>{highlightCode(block.value, block.language)}</code>
                </pre>
              </div>
            </div>
          );
        } else {
          return (
            <div key={index} className="text-slate-300">
              {renderTextBlock(block.value)}
            </div>
          );
        }
      })}
      <div ref={containerRef} className="h-1" />
    </div>
  );
}
