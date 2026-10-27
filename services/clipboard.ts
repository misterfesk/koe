export async function copyText(text: string) {
  if (!navigator.clipboard)
    throw new Error(
      "Clipboard is unavailable. Select and copy the text manually.",
    );
  await navigator.clipboard.writeText(text);
}
