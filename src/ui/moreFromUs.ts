// Shared "More from us" links (decision D-HELPER-SITES-CROSSLINK): every helper
// site links to the others. Tiny Worlds 3D is added once its URL exists.
export const MORE_FROM_US: ReadonlyArray<{ name: string; url: string; blurb: string }> = [
  { name: 'Utility Helpers', url: 'https://utility-helpers.netlify.app/', blurb: 'free private browser tools' },
  { name: 'PromptForge', url: 'https://prmoptforge.netlify.app/', blurb: 'turn-based battle of arguments' },
];

export function moreFromUsHtml(linkStyle: string): string {
  return MORE_FROM_US.map(
    (s) => `<a href="${s.url}" target="_blank" rel="noopener" style="${linkStyle}">${s.name}</a> <span style="color:#8b949e;">— ${s.blurb}</span>`,
  ).join('<span style="color:#30363d;margin:0 8px;">·</span>');
}
