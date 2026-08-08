"use client";

import { useEffect, useState } from "react";

// Shown next to a file input once something's selected — otherwise it's
// easy to attach the wrong photo and not notice until an admin rejects it
// a day later.
export function ScreenshotPreview({ files }: { files: FileList | undefined }) {
  const file = files?.[0];
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!file || !url) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-black/10 p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-12 w-12 rounded object-cover" />
      <div className="min-w-0 text-xs text-foreground/60">
        <p className="truncate font-medium text-foreground">{file.name}</p>
        <p>{(file.size / 1024).toFixed(0)} KB selected</p>
      </div>
    </div>
  );
}
