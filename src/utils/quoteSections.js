export function getQuoteSectionKey(lines, section) {
  return lines.find((line) => line.section === section)?.id || section;
}
