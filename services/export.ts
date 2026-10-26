export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function copyText(text: string) {
  if (!navigator.clipboard)
    throw new Error(
      "Clipboard is unavailable. Select and copy the text manually.",
    );
  await navigator.clipboard.writeText(text);
}
