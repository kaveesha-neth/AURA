export function mediaUrl(filePath) {
  return filePath ? `aura-media://media/${encodeURIComponent(filePath)}` : '';
}
