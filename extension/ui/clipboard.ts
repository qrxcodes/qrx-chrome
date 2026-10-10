/**
 * Copy and download without the clipboardWrite or downloads permissions: the popup is a focused extension page acting
 * on a click, which is all the async Clipboard API and an <a download> need. The image host is in host_permissions,
 * so fetching the PNG is not blocked by CORS.
 */

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

async function fetchPng(imageUrl: string): Promise<Blob> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Couldn't load the image (HTTP ${res.status}).`);
  const blob = await res.blob();
  return blob.type === 'image/png' ? blob : new Blob([await blob.arrayBuffer()], { type: 'image/png' });
}

export async function copyImage(imageUrl: string): Promise<void> {
  // pass a promise so the clipboard write starts inside the click, before the fetch finishes
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': fetchPng(imageUrl) })]);
}

export async function downloadImage(imageUrl: string, filename: string): Promise<void> {
  const blob = await fetchPng(imageUrl);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
