/**
 * Tiny DOM helpers. All dynamic text goes through text nodes / textContent — never innerHTML —
 * because city names and condition text come from a network response.
 */

export function h(tag, attributes, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes || {})) {
    if (value === undefined || value === null || value === false) continue;
    element.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

export function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`SKY CRED: missing #${id} in index.html`);
  return element;
}
