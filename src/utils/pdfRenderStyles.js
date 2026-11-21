export function copyComputedStyles(source, target, getStyle = window.getComputedStyle) {
  const sourceStyle = getStyle(source);
  for (let index = 0; index < sourceStyle.length; index += 1) {
    const property = sourceStyle[index];
    target.style.setProperty(
      property,
      sourceStyle.getPropertyValue(property),
      sourceStyle.getPropertyPriority(property),
    );
  }

  for (let index = 0; index < source.children.length; index += 1) {
    copyComputedStyles(source.children[index], target.children[index], getStyle);
  }
}
