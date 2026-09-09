import React, { useState } from "react";
import { CheckIcon, DocumentDuplicateIcon } from "@heroicons/react/24/outline";

interface CopyButtonProps {
  text: string;
}

const CopyButton: React.FC<CopyButtonProps> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className={`p-1 ml-1 transition-all rounded-md ${
        copied
          ? "text-green-500 bg-green-50 dark:bg-green-900/20"
          : "text-zinc-400 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      }`}
    >
      {copied ? (
        <CheckIcon className="w-3 h-3" />
      ) : (
        <DocumentDuplicateIcon className="w-3 h-3" />
      )}
    </button>
  );
};

export default CopyButton;
